from pathlib import Path
from typing import Dict
from fastapi import UploadFile
import shlex, subprocess

def safe_name(fn: str) -> str:
    return "".join(c for c in fn if c.isalnum() or c in ("-", "_", ".", "+")).strip()

def write_upload(dst: Path, uf: UploadFile):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as f:
        while True:
            chunk = uf.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

def tail_file(path: Path, n: int = 200) -> str:
    if not path.exists():
        return ""
    try:
        return subprocess.check_output(["bash","-lc", f"tail -n {n} {shlex.quote(str(path))}"], text=True)
    except Exception:
        return path.read_text()[-20000:]

# PDB helpers
def enumerate_residues(pdb_path: Path) -> Dict[str, list[int]]:
    chains = {}
    with open(pdb_path) as f:
        for line in f:
            if not line.startswith("ATOM"): continue
            ch = (line[21].strip() or "_")
            try: res = int(line[22:26])
            except ValueError: continue
            chains.setdefault(ch, set()).add(res)
    return {ch: sorted(v) for ch, v in chains.items()}

def parse_freeze_spec(pdb_path: Path, spec: str) -> Dict[str, list[int]]:
    avail = enumerate_residues(pdb_path)
    if not avail: return {}
    out = {ch: set() for ch in avail}
    # split groups by space / ';'
    groups = []
    for part in spec.replace("\n"," ").split(";"):
        groups += part.strip().split()
    current = None
    def apply(chain, sel):
        if chain not in avail: return
        if sel.lower() in ("*","all"): out[chain].update(avail[chain]); return
        for chunk in sel.replace("/",",").split(","):
            c = chunk.strip()
            if not c: continue
            if "-" in c:
                a,b = c.split("-",1)
                try: lo,hi = int(a), int(b)
                except ValueError: continue
                if lo>hi: lo,hi = hi,lo
                out[chain].update(r for r in avail[chain] if lo<=r<=hi)
            else:
                try: r=int(c)
                except ValueError: continue
                if r in avail[chain]: out[chain].add(r)
    for grp in groups:
        if not grp: continue
        if ":" in grp:
            ch, sel = grp.split(":",1)
            current = ch.strip(); apply(current, sel.strip())
        else:
            tok = grp.strip()
            if tok in avail: current = tok; apply(current, "all")
            elif current: apply(current, tok)
    return {ch: sorted(v) for ch,v in out.items() if v}
