# backend/routers/jobs.py
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from typing import Literal, Optional, Dict, Any
from pathlib import Path
import uuid, shlex, subprocess

from ..utils import config
from ..utils import af as af_utils
from ..utils import mpnn as mpnn_utils
from ..utils.io import safe_name, write_upload, launch_and_tee, tail as tail_file
from ..utils.jobs_state import JOBS, now_ts, status as job_status_state

router = APIRouter()

@router.post("/jobs")
def submit_job(
    tool: Literal["alphafold","proteinmpnn"] = Form(...),
    file: UploadFile = File(...),

    # AF
    model_preset: Literal["monomer","multimer"] = Form("monomer"),
    db_preset: Literal["full_dbs","reduced_dbs"] = Form("full_dbs"),
    max_template_date: str = Form("2024-12-31"),

    # MPNN
    mpnn_model_name: str = Form("v_48_020"),
    mpnn_num_seq: int = Form(10),
    mpnn_batch_size: int = Form(1),
    mpnn_sampling_temp: float = Form(0.1),
    mpnn_freeze_spec: Optional[str] = Form(None),
):
    job_id   = uuid.uuid4().hex[:8]
    in_dir   = config.BASE_INPUT / job_id
    out_dir  = config.BASE_OUTPUT / job_id
    log_path = config.BASE_LOGS / f"{job_id}.log"
    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    fname = safe_name(file.filename or f"input_{tool}")
    src   = in_dir / fname
    write_upload(src, file)

    JOBS[job_id] = {
        "id": job_id, "tool": tool,
        "input_path": str(src), "output_dir": str(out_dir),
        "log_path": str(log_path), "status": "queued",
        "created_at": now_ts(),
    }

    if tool == "alphafold":
        docker_cmd = af_utils.build_af_docker_cmd(
            fasta_host_path=src, out_host_dir=out_dir,
            model_preset=model_preset, db_preset=db_preset,
            max_template_date=max_template_date,
        )
        if not docker_cmd:
            return JSONResponse({"detail": "AlphaFold DBs incomplete at /data/af_download_data"}, status_code=500)
        launch_and_tee(docker_cmd, log_path, lambda pid: JOBS[job_id].update(pid=pid, status="running"))
        return {"job_id": job_id, "status": "queued"}

    # proteinmpnn
    if src.suffix.lower() not in [".pdb", ".cif"]:
        return JSONResponse({"detail": "ProteinMPNN expects a .pdb or .cif"}, status_code=400)

    fixed_jsonl = mpnn_utils.parse_freeze_spec(src, mpnn_freeze_spec)
    cmd = mpnn_utils.build_mpnn_cmd(
        pdb_path=src, out_dir=out_dir, model_name=mpnn_model_name,
        num_seq=mpnn_num_seq, batch_size=mpnn_batch_size,
        sampling_temp=mpnn_sampling_temp, fixed_jsonl=fixed_jsonl,
    )
    launch_and_tee(cmd, log_path, lambda pid: JOBS[job_id].update(pid=pid, status="running"))
    return {"job_id": job_id, "status": "queued"}

@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in JOBS:
        return JSONResponse({"detail":"Unknown job_id"}, status_code=404)
    st = job_status_state(job_id)
    info = JOBS[job_id].copy()
    info.update(st)
    info.pop("input_path", None)
    return info

@router.get("/jobs/{job_id}/logs")
def job_logs(job_id: str, tail: int = 200):
    job = JOBS.get(job_id)
    if not job: return JSONResponse({"detail":"Unknown job_id"}, status_code=404)
    return {"log": tail_file(Path(job["log_path"]), n=max(1, min(tail, 4000)))}

@router.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    job = JOBS.get(job_id)
    if not job: return JSONResponse({"detail":"Unknown job_id"}, status_code=404)
    if job["tool"] == "alphafold":
        subprocess.run(["bash","-lc", f"docker rm -f af-{job_id} >/dev/null 2>&1 || true"])
    pid = job.get("pid")
    if pid:
        subprocess.run(["bash","-lc", f"kill -TERM {int(pid)} >/dev/null 2>&1 || true"])
    Path(job["log_path"]).with_suffix(".exit").write_text("137")
    job.update(status="failed", exit_code=137)
    return {"status": "cancelling"}

@router.get("/jobs/{job_id}/download_stream")
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

@router.get("/jobs/{job_id}/download")
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
