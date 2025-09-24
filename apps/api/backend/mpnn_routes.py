from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import PlainTextResponse, FileResponse
from pathlib import Path
import shlex, subprocess, os, json
from .config import MPNN_PY, MPNN_WEIGHTS, MPNN_OUT_BASE, JOBS_DIR
from .utils import new_job, write_json, tgz_dir

router = APIRouter()

@router.post("/jobs/upload")
async def mpnn_submit(
    file: UploadFile = File(...),                   # PDB
    model_name: str = Form("v_48_020"),            # see repo options
    num_seqs: int = Form(1),
    batch_size: int = Form(1),
    sampling_temp: float = Form(0.1)
):
    if not Path(MPNN_PY).exists():
        raise HTTPException(500, f"MPNN script not found at {MPNN_PY}")
    if not Path(MPNN_WEIGHTS).exists():
        raise HTTPException(500, f"MPNN weights dir not found at {MPNN_WEIGHTS}")

    jid, jdir = new_job("mpnn", JOBS_DIR)
    work = jdir / "work"; work.mkdir(parents=True, exist_ok=True)
    out_dir = MPNN_OUT_BASE / jid; out_dir.mkdir(parents=True, exist_ok=True)

    pdb_path = work / file.filename
    pdb_path.write_bytes(await file.read())

    cmd = [
        MPNN_PYTHON(), MPNN_PY,
        "--pdb_path", str(pdb_path),
        "--out_folder", str(out_dir),
        "--path_to_model_weights", str(MPNN_WEIGHTS),
        "--model_name", model_name,
        "--num_seq_per_target", str(num_seqs),
        "--batch_size", str(batch_size),
        "--sampling_temp", str(sampling_temp),
    ]

    meta = {
        "job_id": jid, "out_dir": str(out_dir), "work": str(work),
        "cmd": " ".join(shlex.quote(x) for x in cmd)
    }
    write_json(jdir / "meta.json", meta)

    log = jdir / "logs" / "runner.log"
    with open(log, "ab", buffering=0) as lf:
        proc = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT)
    (jdir / "pid.txt").write_text(str(proc.pid))
    return {"job_id": jid}

def MPNN_PYTHON():
    # Prefer explicit venv python if present and executable
    py = os.environ.get("MPNN_PYTHON", "/data/tools/proteinmpnn_official/.venv/bin/python")
    return py

@router.get("/jobs/{job_id}")
def mpnn_status(job_id: str):
    jdir = (JOBS_DIR / "mpnn" / job_id)
    if not jdir.exists(): raise HTTPException(404, "job not found")
    pidf = jdir / "pid.txt"
    if not pidf.exists(): return {"status":"unknown","exit_code":None}
    pid = int(pidf.read_text().strip())
    # check process
    try:
        os.kill(pid, 0)  # raises if not running
        return {"status":"running","exit_code":None}
    except Exception:
        # check exit code from logs? simplest: see if outputs exist → finished
        out_dir = Path(json.loads((jdir / "meta.json").read_text())["out_dir"])
        done = out_dir.exists() and any(out_dir.glob("**/*.fa*"))
        return {"status":"finished" if done else "stopped", "exit_code": 0 if done else 1}

@router.get("/jobs/{job_id}/logs", response_class=PlainTextResponse)
def mpnn_logs(job_id: str, tail: int = 200):
    jdir = (JOBS_DIR / "mpnn" / job_id)
    log = jdir / "logs" / "runner.log"
    if not log.exists(): return "(no logs yet)"
    # tail last N lines
    lines = log.read_text(errors="ignore").splitlines()[-tail:]
    return "\n".join(lines)

@router.get("/jobs/{job_id}/download")
def mpnn_download(job_id: str):
    jdir = (JOBS_DIR / "mpnn" / job_id)
    meta = (jdir / "meta.json")
    if not meta.exists(): raise HTTPException(404, "job not found")
    out_dir = Path(json.loads(meta.read_text())["out_dir"])
    if not out_dir.exists(): raise HTTPException(404, "output not ready")
    tgz = jdir / f"{out_dir.name}.tgz"
    if not tgz.exists(): tgz_dir(out_dir, tgz)
    return FileResponse(tgz, filename=tgz.name)

