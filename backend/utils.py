import json
import os
import tarfile
import time
import subprocess
import shutil
import uuid
from pathlib import Path
from typing import Tuple, Optional

def new_job(prefix: str, base_dir: Path) -> Tuple[str, Path]:
    jid = uuid.uuid4().hex[:8]
    jdir = base_dir / prefix / jid
    jdir.mkdir(parents=True, exist_ok=True)
    (jdir / "logs").mkdir(exist_ok=True)
    return jid, jdir

def write_json(p: Path, obj):
    p.write_text(json.dumps(obj, indent=2))

def read_json(p: Path, default=None):
    try:
        return json.loads(p.read_text())
    except Exception:
        return default

def run_cmd_detached(args, log_file: Path, env: Optional[dict] = None) -> subprocess.Popen:
    lf = open(log_file, "ab", buffering=0)
    return subprocess.Popen(args, stdout=lf, stderr=subprocess.STDOUT, env=env)

def docker_inspect_status(name_or_id: str) -> Tuple[str, Optional[int]]:
    # returns (status, exit_code) e.g. ("running", None) or ("exited", 0) or ("notfound", None)
    try:
        fmt = "{{.State.Status}} {{.State.ExitCode}}"
        out = subprocess.check_output(["docker", "inspect", "-f", fmt, name_or_id], text=True).strip()
        parts = out.split()
        if not parts:
            return "unknown", None
        status = parts[0]
        code = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
        return status, code
    except subprocess.CalledProcessError:
        return "notfound", None

def docker_logs(name_or_id: str, tail: int = 200) -> str:
    try:
        out = subprocess.check_output(["docker", "logs", f"--tail={tail}", name_or_id], text=True, stderr=subprocess.STDOUT)
        return out
    except subprocess.CalledProcessError as e:
        return e.output or f"(no logs for {name_or_id})"

def tgz_dir(src_dir: Path, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(out_path, "w:gz") as tar:
        tar.add(src_dir, arcname=src_dir.name)

def find_one(patterns) -> Optional[Path]:
    for p in patterns:
        for m in Path(p).parent.glob(Path(p).name):
            return m
    return None
