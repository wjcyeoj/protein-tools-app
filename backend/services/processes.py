import os, shlex, subprocess, time
from pathlib import Path

def now_ts() -> float: return time.time()

def launch_and_log(cmd: str, log_file: Path, job_id: str, jobs: dict) -> int:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    shell = (
        "set -o pipefail; "
        f"( {cmd} ) 2>&1 | stdbuf -oL -eL tee -a {shlex.quote(str(log_file))}; "
        f"echo $? > {shlex.quote(str(log_file.with_suffix('.exit')))}"
    )
    proc = subprocess.Popen(["bash","-lc", shell], start_new_session=True)
    jobs[job_id]["pid"] = proc.pid
    jobs[job_id]["status"] = "running"
    jobs[job_id]["started_at"] = now_ts()
    return proc.pid

def proc_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
