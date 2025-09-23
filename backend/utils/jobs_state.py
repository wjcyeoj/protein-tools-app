from typing import Dict, Any
from pathlib import Path
import time

JOBS: Dict[str, Dict[str, Any]] = {}

def now_ts() -> float: return time.time()

def mark_running(job_id: str, pid: int): 
    JOBS[job_id]["pid"] = pid
    JOBS[job_id]["status"] = "running"

def status(job_id: str):
    job = JOBS.get(job_id)
    if not job: return {"status": "unknown"}
    exit_file = Path(job["log_path"]).with_suffix(".exit")
    if job["status"] == "running" and exit_file.exists():
        try:
            code = int(exit_file.read_text().strip() or "0")
        except Exception:
            code = -1
        job["status"] = "finished" if code == 0 else "failed"
        job["exit_code"] = code
    return {"status": job["status"], "exit_code": job.get("exit_code")}
