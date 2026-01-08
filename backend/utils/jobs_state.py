# backend/utils/jobs_state.py
from typing import Dict, Any
from pathlib import Path
import time, json

JOBS: Dict[str, Dict[str, Any]] = {}

def now_ts() -> float:
    return time.time()

def mark_running(job_id: str, pid: int):
    JOBS[job_id]["pid"] = pid
    JOBS[job_id]["status"] = "running"
    JOBS[job_id]["started_at"] = now_ts()

def mark_finished(job_id: str, result_data: Any = None):
    JOBS[job_id]["status"] = "finished"
    if result_data is not None:
        JOBS[job_id]["result_data"] = result_data

def mark_failed(job_id: str, exit_code: int = -1, message: str | None = None):
    JOBS[job_id]["status"] = "failed"
    JOBS[job_id]["exit_code"] = exit_code
    if message:
        JOBS[job_id]["error"] = message

def status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return {"status": "unknown"}

    exit_file = Path(job["log_path"]).with_suffix(".exit")

    # Transition running -> finished/failed when exit code appears
    if job["status"] == "running" and exit_file.exists():
        try:
            code = int(exit_file.read_text().strip() or "0")
        except Exception:
            code = -1
        job["status"] = "finished" if code == 0 else "failed"
        job["exit_code"] = code

        # If finished, try to load summary.json into result_data
        if job["status"] == "finished":
            try:
                out_dir = Path(job["output_dir"]).resolve()
                summary = out_dir / "summary.json"
                if summary.exists():
                    job["result_data"] = json.loads(summary.read_text())
            except Exception:
                pass

    return {"status": job["status"], "exit_code": job.get("exit_code")}
