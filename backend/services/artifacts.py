# backend/services/artifacts.py
import shlex, subprocess
from pathlib import Path
from typing import Iterator

def _tar_stream_cmd(base_dir: Path, item: str, lite: bool) -> list[str]:
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

def stream_tar(base_dir: Path, item: str, lite: bool) -> Iterator[bytes]:
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

def build_artifact(out_dir: Path, lite: bool = False) -> Path:
    out_dir = out_dir.resolve()
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
