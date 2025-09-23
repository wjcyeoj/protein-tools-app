import shlex, subprocess
from pathlib import Path

def safe_name(fn: str) -> str:
    return "".join(c for c in fn if c.isalnum() or c in ("-", "_", ".", "+")).strip()

def write_upload(dst: Path, uf):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as f:
        while True:
            chunk = uf.file.read(1024 * 1024)
            if not chunk: break
            f.write(chunk)

def launch_and_tee(cmd: str, log_file: Path, on_pid):
    log_file.parent.mkdir(parents=True, exist_ok=True)
    shell = (
        "set -o pipefail; "
        f"( {cmd} ) 2>&1 | stdbuf -oL -eL tee -a {shlex.quote(str(log_file))}; "
        f"echo $? > {shlex.quote(str(log_file.with_suffix('.exit')))}"
    )
    proc = subprocess.Popen(["bash", "-lc", shell], start_new_session=True)
    on_pid(proc.pid)
    return proc.pid

def tail(path: Path, n: int = 200) -> str:
    if not path.exists(): return ""
    try:
        return subprocess.check_output(["bash", "-lc", f"tail -n {n} {shlex.quote(str(path))}"], text=True)
    except Exception:
        return path.read_text()[-20000:]

def stream_tar_cmd(base_dir: Path, item: str, lite: bool):
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
