# backend/routers/jobs.py
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse

from ..utils import config
from ..utils.io import safe_name, write_upload, tail as tail_file
from ..utils.jobs_state import JOBS, now_ts, status as job_status_state, mark_finished, mark_failed
from ..utils.fasta import pid_matrix, parse_fasta_positions, muscle_align_if_available, conserved_columns, read_fasta_file
from ..utils.pdb import parse_pdb_positions

from ..services.processes import launch_and_log
from ..services.artifacts import stream_tar, build_artifact
from ..services.proteinsol import run_proteinsol

from ..services.alphafold import build_af_cmd
from ..services.proteinmpnn import build_mpnn_cmd
from ..services.rfdiffusion import build_rfdiffusion_cmd

router = APIRouter()


def _ensure_finished_or_409(job_id: str):
    st = job_status_state(job_id)
    if st.get("status") != "finished":
        raise HTTPException(status_code=409, detail="Job not finished")


@router.post("/jobs")
def submit_job(
    tool: Literal["alphafold", "proteinmpnn", "residueid", "msa", "rfdiffusion", "aggrescan3d", "proteinsol"] = Form(...),
    file: Optional[UploadFile] = File(None),

    # Aggrescan3D knobs
    a3d_distance: int = Form(10),
    a3d_dynamic: bool = Form(False),
    a3d_foldx: bool = Form(False),
    a3d_hide: bool = Form(True),
    a3d_timeout_s: int = Form(1800),
    a3d_poll_s: int = Form(10),

    # --- RFdiffusion knobs ---
    rf_mode: Literal["free", "motif"] = Form("free"),
    rf_len: int = Form(100),
    rf_num_designs: int = Form(1),
    rf_contigs: Optional[str] = Form(None),

    rf_num_steps: Optional[int] = Form(None),
    rf_temperature: Optional[float] = Form(None),
    rf_guidance_scale: Optional[float] = Form(None),
    rf_recycle: Optional[int] = Form(None),
    rf_seed: Optional[int] = Form(None),
    rf_deterministic: bool = Form(False),

    rf_symmetry_type: Optional[Literal["cyclic", "dihedral", "tetrahedral", "octahedral", "icosahedral"]] = Form(None),
    rf_symmetry_order: Optional[int] = Form(None),
    rf_min_plddt: Optional[float] = Form(None),
    rf_checkpoint: Optional[str] = Form(None),
    rf_extra_overrides: Optional[str] = Form(None),

    # AlphaFold knobs
    model_preset: Literal["monomer", "multimer"] = Form("monomer"),
    db_preset: Literal["full_dbs", "reduced_dbs"] = Form("full_dbs"),
    max_template_date: str = Form("2024-12-31"),

    # ProteinMPNN knobs
    mpnn_model_name: Literal[
        "v_48_002", "v_48_010", "v_48_020", "v_48_030",
        "ca_48_002", "ca_48_010", "ca_48_020",
        "s_48_002", "s_48_010", "s_48_020", "s_48_030"
    ] = Form("v_48_020"),
    mpnn_num_seq: int = Form(10),
    mpnn_batch_size: int = Form(1),
    mpnn_sampling_temp: float = Form(0.1),
    mpnn_freeze_spec: Optional[str] = Form(None),

    # (optional) custom job id (you can re-add ensure_job_id later)
    job_id: Optional[str] = Form(None),
):
    import uuid

    job_id = (job_id.strip() if job_id else "") or uuid.uuid4().hex[:8]

    in_dir = config.BASE_INPUT / job_id
    out_dir = config.BASE_OUTPUT / job_id
    log_path = config.BASE_LOGS / f"{job_id}.log"

    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    src_path: Optional[Path] = None
    if file is not None:
        fname = safe_name(file.filename or f"input_{tool}")
        src_path = in_dir / fname
        write_upload(src_path, file)

    JOBS[job_id] = {
        "id": job_id,
        "tool": tool,
        **({"input_path": str(src_path)} if src_path else {}),
        "output_dir": str(out_dir),
        "log_path": str(log_path),
        "status": "queued",
        "created_at": now_ts(),
    }

    # -------------------------
    # ASYNC TOOLS (spawn + log)
    # -------------------------

    if tool == "alphafold":
        if src_path is None:
            return JSONResponse({"detail": "AlphaFold expects a FASTA file."}, status_code=400)
        try:
            docker_cmd, container_name = build_af_cmd(
                fasta_host=src_path,
                out_host_dir=out_dir,
                job_id=job_id,
                model_preset=model_preset,
                db_preset=db_preset,
                max_template_date=max_template_date,
            )
        except Exception as e:
            mark_failed(job_id, exit_code=-1, message=str(e))
            return JSONResponse({"detail": str(e)}, status_code=500)

        # Store container name so cancel can use it
        JOBS[job_id]["container"] = container_name
        launch_and_log(docker_cmd, log_path, job_id, JOBS)
        return {"job_id": job_id, "status": "queued"}

    if tool == "proteinmpnn":
        if src_path is None:
            return JSONResponse({"detail": "ProteinMPNN expects a .pdb or .cif file."}, status_code=400)
        try:
            cmd = build_mpnn_cmd(
                src_path=src_path,
                out_dir=out_dir,
                model=mpnn_model_name,
                nseq=mpnn_num_seq,
                bsz=mpnn_batch_size,
                temp=mpnn_sampling_temp,
                freeze_spec=mpnn_freeze_spec,
                in_dir=in_dir,
                log_path=log_path,
            )
        except Exception as e:
            mark_failed(job_id, exit_code=-1, message=str(e))
            return JSONResponse({"detail": str(e)}, status_code=500)

        launch_and_log(cmd, log_path, job_id, JOBS)
        return {"job_id": job_id, "status": "queued"}

    if tool == "rfdiffusion":
        try:
            cmd = build_rfdiffusion_cmd(
                job_id=job_id,
                in_dir=in_dir,
                out_dir=out_dir,
                rf_mode=rf_mode,
                rf_len=rf_len,
                rf_num_designs=rf_num_designs,
                rf_contigs=rf_contigs,
                rf_num_steps=rf_num_steps,
                rf_temperature=rf_temperature,
                rf_guidance_scale=rf_guidance_scale,
                rf_recycle=rf_recycle,
                rf_seed=rf_seed,
                rf_deterministic=rf_deterministic,
                rf_symmetry_type=rf_symmetry_type,
                rf_symmetry_order=rf_symmetry_order,
                rf_min_plddt=rf_min_plddt,
                rf_checkpoint=rf_checkpoint,
                rf_extra_overrides=rf_extra_overrides,
                src_path=src_path,
            )
        except Exception as e:
            mark_failed(job_id, exit_code=-1, message=str(e))
            return JSONResponse({"detail": str(e)}, status_code=500)

        with open(log_path, "a") as lf:
            lf.write(f"RFdiffusion CMD: {cmd}\n")

        launch_and_log(cmd, log_path, job_id, JOBS)
        return {"job_id": job_id, "status": "queued"}

    if tool == "aggrescan3d":
        if src_path is None or src_path.suffix.lower() != ".pdb":
            return JSONResponse({"detail": "Aggrescan3D expects a .pdb file."}, status_code=400)

        runner = Path(__file__).resolve().parent.parent / "services" / "aggrescan3d.py"
        if not runner.exists():
            return JSONResponse({"detail": f"Aggrescan3D runner missing: {runner}"}, status_code=500)

        py = sys.executable
        cmd = (
            f"{py} {str(runner)} "
            f"--pdb {str(src_path)} "
            f"--out_dir {str(out_dir)} "
            f"--distance {int(a3d_distance)} "
            f"{'--dynamic ' if a3d_dynamic else ''}"
            f"{'--foldx ' if a3d_foldx else ''}"
            f"{'--hide ' if a3d_hide else ''}"
            f"--timeout_s {int(a3d_timeout_s)} "
            f"--poll_s {int(a3d_poll_s)} "
        )
        launch_and_log(cmd, log_path, job_id, JOBS)
        return {"job_id": job_id, "status": "queued"}

    # -------------------------
    # SYNC TOOLS (compute now)
    # -------------------------

    if tool == "proteinsol":
        if src_path is None:
            return JSONResponse({"detail": "ProteinSol expects a FASTA file."}, status_code=400)

        ext = src_path.suffix.lower()
        if ext not in (".fa", ".fasta"):
            return JSONResponse({"detail": "ProteinSol expects .fa/.fasta"}, status_code=400)

        result = run_proteinsol(
            job_id=job_id,
            input_fasta=src_path,
            output_dir=out_dir,
            log_path=log_path,
        )

        # store result + mark finished
        mark_finished(job_id, result_data=result)

        # Optional artifact lite
        try:
            art = build_artifact(out_dir, lite=True)
            JOBS[job_id]["artifact"] = str(art)
            JOBS[job_id]["artifact_lite"] = str(art)
        except Exception:
            pass

        return {"job_id": job_id, "status": "finished"}

    if tool == "residueid":
        if src_path is None:
            return JSONResponse({"detail": "Residue Identifier expects FASTA or PDB."}, status_code=400)

        ext = src_path.suffix.lower()
        if ext in (".fa", ".fasta"):
            results = parse_fasta_positions(src_path.read_text())
        elif ext == ".pdb":
            results = parse_pdb_positions(src_path)
        else:
            return JSONResponse({"detail": "Unsupported type (use .fa/.fasta or .pdb)"}, status_code=400)

        out_json = out_dir / "residues.json"
        out_json.write_text(json.dumps(results, indent=2))

        mark_finished(job_id, result_data=results)
        return {"job_id": job_id, "status": "finished"}

    if tool == "msa":
        if src_path is None:
            return JSONResponse({"detail": "MSA expects a multi-FASTA."}, status_code=400)

        ext = src_path.suffix.lower()
        if ext not in (".fa", ".fasta"):
            return JSONResponse({"detail": "Upload a multi-FASTA (.fa/.fasta) with ≥2 sequences."}, status_code=400)

        # Try to align with MUSCLE if present; otherwise use as-is
        try:
            recs = muscle_align_if_available(src_path)
        except subprocess.CalledProcessError:
            recs = read_fasta_file(src_path)

        if not recs or len(recs) < 2:
            result = {"note": "Need at least two sequences", "n_sequences": len(recs), "aligned_length": 0, "conserved": []}
        else:
            same_len = len(set(len(s) for _, s in recs)) == 1
            if same_len:
                result = conserved_columns(recs, ignore_gaps=True)
                result["pid"] = pid_matrix(recs, ignore_gaps=True)
            else:
                result = {
                    "note": "Sequences not aligned; install MUSCLE to auto-align",
                    "n_sequences": len(recs),
                    "aligned_length": 0,
                    "conserved": [],
                    "pid": None,
                }

        out_json = out_dir / "msa_results.json"
        out_json.write_text(json.dumps(result, indent=2))

        mark_finished(job_id, result_data=result)

        # Optional artifact lite (handy for download)
        try:
            art = build_artifact(out_dir, lite=True)
            JOBS[job_id]["artifact"] = str(art)
            JOBS[job_id]["artifact_lite"] = str(art)
        except Exception:
            pass

        return {"job_id": job_id, "status": "finished"}

    return JSONResponse({"detail": f"Unknown tool: {tool}"}, status_code=400)


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in JOBS:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)

    st = job_status_state(job_id)
    info = JOBS[job_id].copy()
    info.update(st)
    info.pop("input_path", None)
    return info


@router.get("/jobs/{job_id}/logs")
def job_logs(job_id: str, tail: int = 200):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    return {"log": tail_file(Path(job["log_path"]), n=max(1, min(tail, 4000)))}


@router.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)

    # docker stop for alphafold
    if job["tool"] == "alphafold":
        cont = job.get("container") or f"af-{job_id}"
        subprocess.run(["bash", "-lc", f"docker rm -f {cont} >/dev/null 2>&1 || true"])

    pid = job.get("pid")
    if pid:
        subprocess.run(["bash", "-lc", f"kill -TERM {int(pid)} >/dev/null 2>&1 || true"])

    Path(job["log_path"]).with_suffix(".exit").write_text("137")
    job.update(status="failed", exit_code=137)
    return {"status": "cancelling"}


@router.get("/jobs/{job_id}/download_stream")
def download_stream(job_id: str, mode: Literal["full", "lite"] = "full"):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    if job_status_state(job_id)["status"] != "finished":
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
        stream_tar(base, name, lite),
        media_type="application/gzip",
        headers=headers,
    )


@router.get("/jobs/{job_id}/download")
def download_artifact(job_id: str, mode: Literal["full", "lite"] = "full"):
    job = JOBS.get(job_id)
    if not job:
        return JSONResponse({"detail": "Unknown job_id"}, status_code=404)
    if job_status_state(job_id)["status"] != "finished":
        return JSONResponse({"detail": "Job not finished"}, status_code=409)

    key = "artifact_lite" if mode == "lite" else "artifact"
    path = job.get(key)

    if path and Path(path).exists():
        art = Path(path)
        return FileResponse(str(art), media_type="application/gzip", filename=art.name)

    out_dir = Path(job["output_dir"]).resolve()
    try:
        art = build_artifact(out_dir, lite=(mode == "lite"))
        JOBS[job_id][key] = str(art)
        return FileResponse(str(art), media_type="application/gzip", filename=art.name)
    except Exception:
        return download_stream(job_id, mode=mode)
