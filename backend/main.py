import os, shlex, subprocess, time, uuid, json
from pathlib import Path
from typing import Literal, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse

# =========================
# ---- CONFIGURABLES  -----
# =========================

# AlphaFold data bundle path (where uniref90, mgnify, pdb_mmcif, etc live)
AF_DB = Path("/data/af_download_data")

# Docker image to use for AlphaFold
AF_IMAGE = "alphafold:cuda12jax"

# Where job inputs/outputs/logs go
BASE_INPUT = Path("/data/appjobs/inputs")        # per-job uploads
BASE_OUTPUT = Path("/data/appjobs/outputs")      # per-job results
BASE_LOGS = Path("/data/appjobs/logs")           # per-job logs

# ProteinMPNN (official runner)
MPNN_ROOT = Path("/data/tools/proteinmpnn_official")
MPNN_PY = MPNN_ROOT / ".venv" / "bin" / "python"  # falls back to python3 if missing
MPNN_SCRIPT = MPNN_ROOT / "protein_mpnn_run.py"
MPNN_WEIGHTS = Path("/data/tools/proteinmpnn_official/vanilla_model_weights")

# Network
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000

# =========================
# ---- APP + STORAGE  -----
# =========================

app = FastAPI(title="Protein Tools Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory job table (simple)
JOBS: Dict[str, Dict[str, Any]] = {}

# ensure dirs exist
for d in (BASE_INPUT, BASE_OUTPUT, BASE_LOGS):
    d.mkdir(parents=True, exist_ok=True)

# =========================
# ---- HELPERS ----------
# =========================

def _now_ts() -> float:
    return time.time()

def _safe_name(fn: str) -> str:
    return "".join(c for c in fn if c.isalnum() or c in ("-", "_", ".", "+")).strip()

def _write_upload(dst: Path, uf: UploadFile):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as f:
        while True:
            chunk = uf.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

def _detect_af_databases() -> Dict[str, str]:
    """Find AF database files/prefixes inside AF_DB; return container paths."""
    def first(pattern: str) -> Optional[Path]:
        matches = sorted(AF_DB.glob(pattern))
        return matches[0] if matches else None

    # single files
    uniref90 = first("uniref90/*.fa*")
    mgnify = first("mgnify/*.fa*")
    uniprot = first("uniprot/*")
    pdb_seqres = first("pdb_seqres/*")
    obsolete = AF_DB / "pdb_mmcif" / "obsolete.dat"

    # HHblits prefix dirs (need prefix only)
    def hh_prefix(dir_glob: str) -> Optional[str]:
        ff = first(dir_glob)
        if not ff:
            return None
        # _hhm.ffindex -> prefix
        return ff.name.replace("_hhm.ffindex", "")

    u30_prefix = hh_prefix("uniref30/*_hhm.ffindex")
    bfd_prefix = hh_prefix("bfd/*_hhm.ffindex")
    pdb70_prefix = hh_prefix("pdb70/*_hhm.ffindex")

    out = {
        "uniref90": f"/db/uniref90/{uniref90.name}" if uniref90 else None,
        "mgnify": f"/db/mgnify/{mgnify.name}" if mgnify else None,
        "u30_prefix": f"/db/uniref30/{u30_prefix}" if u30_prefix else None,
        "bfd_prefix": f"/db/bfd/{bfd_prefix}" if bfd_prefix else None,
        "pdb70_prefix": f"/db/pdb70/{pdb70_prefix}" if pdb70_prefix else None,
        "uniprot": f"/db/uniprot/{uniprot.name}" if uniprot else None,
        "pdb_seqres": f"/db/pdb_seqres/{pdb_seqres.name}" if pdb_seqres else None,
        "mmcif_dir": "/db/pdb_mmcif/mmcif_files" if (AF_DB / "pdb_mmcif" / "mmcif_files").exists() else None,
        "obsolete": f"/db/pdb_mmcif/obsolete.dat" if obsolete.exists() else None,
    }
    return out

def _launch(cmd: str, log_file: Path, job_id: str):
    import os, shlex, subprocess
    log_file.parent.mkdir(parents=True, exist_ok=True)
    shell = (
        "set -o pipefail; "
        f"( {cmd} ) 2>&1 | stdbuf -oL -eL tee -a {shlex.quote(str(log_file))}; "
        f"echo $? > {shlex.quote(str(log_file.with_suffix('.exit')))}"
    )
    # This is the key: decouple from the login session so SIGHUP doesn’t kill it
    proc = subprocess.Popen(["bash", "-lc", shell], start_new_session=True)
    JOBS[job_id]["pid"] = proc.pid
    JOBS[job_id]["status"] = "running"
    return proc.pid

def _job_status(job_id: str) -> Dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        return {"status": "unknown"}
    # check exit code file
    exit_file = Path(job["log_path"]).with_suffix(".exit")
    if job["status"] == "running" and exit_file.exists():
        try:
            code = int(exit_file.read_text().strip() or "0")
        except Exception:
            code = -1
        job["status"] = "finished" if code == 0 else "failed"
        job["exit_code"] = code
    return {"status": job["status"], "exit_code": job.get("exit_code")}

def _tail(path: Path, n: int = 200) -> str:
    if not path.exists():
        return ""
    try:
        return subprocess.check_output(["bash", "-lc", f"tail -n {n} {shlex.quote(str(path))}"], text=True)
    except Exception:
        return path.read_text()[-20000:]  # fallback small tail

def _tar_stream_cmd(base_dir: Path, item: str, lite: bool):
    base_q = shlex.quote(str(base_dir))
    item_q = shlex.quote(item)
    excludes = []
    if lite:
        excludes += ["--exclude=**/msas", "--exclude=**/result_model_*", "--exclude=**/*.pkl"]
    exclude_str = " ".join(excludes)
    cmd = (
        f"if command -v pigz >/dev/null 2>&1; then "
        f"tar -C {base_q} -I 'pigz -1' -cf - {exclude_str} {item_q}; "
        f"else tar -C {base_q} -czf - {exclude_str} {item_q}; fi"
    )
    return ["bash", "-lc", cmd]

def _stream_tar(base_dir: Path, item: str, lite: bool):
    proc = subprocess.Popen(
        _tar_stream_cmd(base_dir, item, lite),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=1024 * 1024,
    )
    try:
        while True:
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
        proc.wait()

def build_artifact(job_id: str, lite: bool = False) -> Path:
    job = JOBS[job_id]
    out_dir = Path(job["output_dir"]).resolve()
    base = out_dir.parent
    name = out_dir.name
    suffix = "-lite" if lite else ""
    artifact = Path(f"/tmp/{name}{suffix}.tgz")

    excludes = []
    if lite:
        excludes += ["--exclude=**/msas", "--exclude=**/result_model_*", "--exclude=**/*.pkl"]
    exclude_str = " ".join(excludes)

    cmd = (
        f"cd {shlex.quote(str(base))} && "
        f"(command -v pigz >/dev/null 2>&1 && tar -I 'pigz -1' -cf {shlex.quote(str(artifact))} {exclude_str} {shlex.quote(name)}) "
        f"|| tar -czf {shlex.quote(str(artifact))} {exclude_str} {shlex.quote(name)}"
    )
    subprocess.run(["bash", "-lc", cmd], check=True)
    return artifact

def _enumerate_residues(pdb_path: Path) -> Dict[str, list[int]]:
    """
    Return {chain_id: [resSeq,...]} using PDB fixed columns.
    Works for standard .pdb. If file has no ATOM rows, returns {}.
    """
    chains: Dict[str, set[int]] = {}
    with open(pdb_path) as f:
        for line in f:
            if not line.startswith("ATOM"):
                continue
            ch = (line[21].strip() or "_")
            try:
                res = int(line[22:26])
            except ValueError:
                continue
            chains.setdefault(ch, set()).add(res)
    return {ch: sorted(v) for ch, v in chains.items()}

def _parse_freeze_spec(pdb_path: Path, spec: str) -> Dict[str, list[int]]:
    """
    Parse strings like:
      "A:1-100, B:*"  or  "A:10,25,30  B:all"  or  "B"
    Meaning: freeze those residues (keep original AA).
    Grammar:
      Items separated by commas or whitespace.
      Each item: CHAIN[:SEL]
        - CHAIN is a chain ID (single char typical; '_' if blank)
        - SEL is:
            * or all     -> all residues in that chain
            N            -> one residue
            N-M          -> inclusive range
            N,M,K        -> comma-separated numbers
      If no SEL given (just "B"), acts like "B:*".
    We intersect with residues that actually exist in the PDB.
    """
    avail = _enumerate_residues(pdb_path)  # {chain: [resids]}
    if not avail:
        return {}

    out: Dict[str, set[int]] = {ch: set() for ch in avail}
    # normalize separators
    raw_tokens = spec.replace("\n", " ").replace(";", ",").split(",")
    tokens = []
    for t in raw_tokens:
        tokens += t.strip().split()

    for tok in tokens:
        if not tok:
            continue
        if ":" in tok:
            ch, sel = tok.split(":", 1)
            ch, sel = ch.strip(), sel.strip()
        else:
            ch, sel = tok.strip(), "*"

        if ch not in avail:
            continue

        if sel in ("*", "all"):
            out[ch].update(avail[ch])
            continue

        # split possible "10,12,20" lists
        for chunk in sel.replace("/", ",").split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            if "-" in chunk:
                a, b = chunk.split("-", 1)
                try:
                    a, b = int(a), int(b)
                except ValueError:
                    continue
                lo, hi = (a, b) if a <= b else (b, a)
                out[ch].update(r for r in avail[ch] if lo <= r <= hi)
            else:
                try:
                    r = int(chunk)
                except ValueError:
                    continue
                if r in avail[ch]:
                    out[ch].add(r)

    # prune empties and sort
    frozen = {ch: sorted(list(v)) for ch, v in out.items() if v}
    return frozen

# =========================
# ---- ENDPOINTS ----------
# =========================

@app.get("/health")
def health():
    return {"ok": True, "time": _now_ts()}

@app.post("/jobs")
def submit_job(
    tool: Literal["alphafold", "proteinmpnn"] = Form(...),
    file: UploadFile = File(...),

    # AlphaFold knobs
    model_preset: Literal["monomer", "multimer"] = Form("monomer"),
    db_preset: Literal["full_dbs", "reduced_dbs"] = Form("full_dbs"),
    max_template_date: str = Form("2024-12-31"),

    # ProteinMPNN knobs
    mpnn_model_name: Literal[
        "v_48_002","v_48_010","v_48_020","v_48_030",
        "ca_48_002","ca_48_010","ca_48_020",
        "s_48_002","s_48_010","s_48_020","s_48_030"
    ] = Form("v_48_020"),
    mpnn_num_seq: int = Form(10),
    mpnn_batch_size: int = Form(1),
    mpnn_sampling_temp: float = Form(0.1),
    mpnn_freeze_spec: Optional[str] = Form(None),
):
    job_id = uuid.uuid4().hex[:8]
    in_dir = BASE_INPUT / job_id
    out_dir = BASE_OUTPUT / job_id
    log_path = BASE_LOGS / f"{job_id}.log"
    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    fname = _safe_name(file.filename or f"input_{tool}")
    src_path = in_dir / fname
    _write_upload(src_path, file)

    JOBS[job_id] = {
        "id": job_id,
        "tool": tool,
        "input_path": str(src_path),
        "output_dir": str(out_dir),
        "log_path": str(log_path),
        "status": "queued",
        "created_at": _now_ts(),
    }

    if tool == "alphafold":
        af = _detect_af_databases()

        db_ok = all([
            af["uniref90"], af["mgnify"], af["u30_prefix"],
            af["bfd_prefix"], af["mmcif_dir"], af["obsolete"]
        ])
        if model_preset == "multimer":
            db_ok = db_ok and af["uniprot"] and af["pdb_seqres"]
        if not db_ok:
            return JSONResponse({"detail": "AlphaFold DBs are incomplete. Check /data/af_download_data."}, status_code=500)

        fasta_in_cont = f"/in/{src_path.name}"
        out_name = Path(src_path.name).stem
        out_cont_dir = f"/out/{out_name}"

        # Build flags strictly as --flag=value (no spaces)
        args = [
            f"--fasta_paths={fasta_in_cont}",
            f"--data_dir=/db",
            f"--output_dir={out_cont_dir}",
            f"--max_template_date={max_template_date}",
            f"--db_preset={db_preset}",
            f"--model_preset={model_preset}",
            f"--uniref90_database_path={af['uniref90']}",
            f"--mgnify_database_path={af['mgnify']}",
            f"--uniref30_database_path={af['u30_prefix']}",
            f"--bfd_database_path={af['bfd_prefix']}",
            f"--template_mmcif_dir={af['mmcif_dir']}",
            f"--obsolete_pdbs_path={af['obsolete']}",
            "--models_to_relax=none",
            "--use_gpu_relax=false",
        ]
        if model_preset == "multimer":
            args += [
                f"--uniprot_database_path={af['uniprot']}",
                f"--pdb_seqres_database_path={af['pdb_seqres']}",
            ]
        else:
            pdb70 = af.get("pdb70_prefix")
            if pdb70:
                args += [f"--pdb70_database_path={pdb70}"]

        # Quote each whole arg once when composing the docker shell command
        arg_str = " ".join(shlex.quote(s) for s in args)

        docker = (
            f"docker run --rm --name af-{job_id} --gpus all --shm-size=16g "
            f"-e JAX_PLATFORM_NAME=cuda -e XLA_PYTHON_CLIENT_PREALLOCATE=false "
            f"-v {AF_DB}:/db -v {in_dir}:/in -v {out_dir}:/out "
            f"{AF_IMAGE} {arg_str}"
        )
        _launch(docker, log_path, job_id)

    else:  # proteinmpnn
        # choose python
        py = str(MPNN_PY if MPNN_PY.exists() else "python3")
        if not Path(py).exists() and py != "python3":
            py = "python3"

        if not MPNN_SCRIPT.exists():
            return JSONResponse({"detail": f"ProteinMPNN script not found at {MPNN_SCRIPT}"}, status_code=500)
        if not MPNN_WEIGHTS.exists():
            return JSONResponse({"detail": f"ProteinMPNN weights missing at {MPNN_WEIGHTS}"}, status_code=500)

        # expect a PDB upload
        if not src_path.suffix.lower() in [".pdb", ".cif"]:
            return JSONResponse({"detail": "ProteinMPNN expects a .pdb or .cif file."}, status_code=400)

        fixed_jsonl_path = None
        if mpnn_freeze_spec and mpnn_freeze_spec.strip():
            fixed = _parse_freeze_spec(src_path, mpnn_freeze_spec)
            if fixed:
                fixed_jsonl_path = in_dir / "fixed_positions.jsonl"
                fixed_jsonl_path.write_text(json.dumps({"fixed_positions": fixed}) + "\n")
        else:
            # nothing matched; we continue without freezing (but note in the log)
            with open(log_path, "a") as lf:
                lf.write("NOTE: freeze spec provided, but no residues matched file; ignoring.\n")

        cmd = (
            f"{shlex.quote(py)} {shlex.quote(str(MPNN_SCRIPT))} "
            f"--pdb_path {shlex.quote(str(src_path))} "
            f"--out_folder {shlex.quote(str(out_dir))} "
            f"--path_to_model_weights {shlex.quote(str(MPNN_WEIGHTS))} "
            f"--model_name {shlex.quote(mpnn_model_name)} "
            f"--num_seq_per_target {int(mpnn_num_seq)} "
            f"--batch_size {int(mpnn_batch_size)} "
            f"--sampling_temp {float(mpnn_sampling_temp)}"
        )
        if fixed_jsonl_path:
            cmd += f" --fixed_positions_jsonl {shlex.quote(str(fixed_jsonl_path))}"
        _launch(cmd, log_path, job_id)

    return {"job_id": job_id, "status": "queued"}

@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in JOBS:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    st = _job_status(job_id)
    info = JOBS[job_id].copy()
    info.update(st)
    # don't leak paths to client unless helpful
    info.pop("input_path", None)
    return info

@app.get("/jobs/{job_id}/logs")
def job_logs(job_id: str, tail: int = 200):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    txt = _tail(Path(job["log_path"]), n=max(1, min(tail, 4000)))
    return {"log": txt}

@app.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    # try docker stop (AF)
    if job["tool"] == "alphafold":
        subprocess.run(["bash", "-lc", f"docker rm -f af-{job_id} >/dev/null 2>&1 || true"])
    # kill spawned process
    pid = job.get("pid")
    if pid:
        subprocess.run(["bash", "-lc", f"kill -TERM {int(pid)} >/dev/null 2>&1 || true"])
    Path(job["log_path"]).with_suffix(".exit").write_text("137")
    job["status"] = "failed"
    job["exit_code"] = 137
    return {"status": "cancelling"}

@app.get("/jobs/{job_id}/download_stream")
def download_stream(job_id: str, mode: Literal["full", "lite"] = "full"):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    if _job_status(job_id)["status"] != "finished":
        return JSONResponse({"detail": "Job not finished"}, status_code=409)

    out_dir = Path(job["output_dir"]).resolve()
    if not out_dir.exists():
        return JSONResponse({"detail": "Output dir missing"}, status_code=404)

    base = out_dir.parent
    name = out_dir.name
    lite = (mode == "lite")
    filename = f"{name}{'-lite' if lite else ''}.tgz"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(
        _stream_tar(base, name, lite),
        media_type="application/gzip",
        headers=headers,
    )

@app.get("/jobs/{job_id}/download")
def download_artifact(job_id: str, mode: Literal["full", "lite"] = "full"):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    if _job_status(job_id)["status"] != "finished":
        return JSONResponse({"detail": "Job not finished"}, status_code=409)

    key = "artifact_lite" if mode == "lite" else "artifact"
    path = job.get(key)

    if path and Path(path).exists():
        filename = Path(path).name
        return FileResponse(path, media_type="application/gzip", filename=filename)

    # build on demand if missing
    try:
        art = build_artifact(job_id, lite=(mode == "lite"))
        JOBS[job_id][key] = str(art)
        filename = art.name
        return FileResponse(str(art), media_type="application/gzip", filename=filename)
    except Exception as e:
        # fallback to streaming
        return download_stream(job_id, mode=mode)
