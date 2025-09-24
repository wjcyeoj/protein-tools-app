# backend/utils/mpnn.py
from pathlib import Path
from typing import Dict, Optional
import json, shlex
from .config import MPNN_ROOT, MPNN_PY, MPNN_SCRIPT, MPNN_WEIGHTS

def parse_freeze_spec(pdb_path: Path, spec: Optional[str]) -> Optional[Path]:
    """
    Convert a human-friendly spec (e.g. 'A:1-10,20  B') into ProteinMPNN's fixed_positions.jsonl.
    Returns the path to the created jsonl if anything was selected, else None.
    """
    if not spec or not spec.strip():
        return None

    # enumerate residues in PDB (fixed-column parsing)
    chains: Dict[str, set[int]] = {}
    with open(pdb_path) as f:
        for line in f:
            if not line.startswith("ATOM"): continue
            ch = (line[21].strip() or "_")
            try:
                res = int(line[22:26])
            except ValueError:
                continue
            chains.setdefault(ch, set()).add(res)

    if not chains:
        return None

    out: Dict[str, set[int]] = {ch: set() for ch in chains}

    # parse groups like: "A:1-10,67-100  B:all"
    def apply(chain: str, sel: str):
        if chain not in chains: return
        if sel.lower() in ("all", "*"):
            out[chain].update(chains[chain]); return
        for token in sel.replace("/", ",").split(","):
            t = token.strip()
            if not t: continue
            if "-" in t:
                a,b = t.split("-",1)
                try:
                    lo, hi = int(a), int(b)
                except ValueError:
                    continue
                if lo > hi: lo,hi = hi,lo
                out[chain].update(r for r in chains[chain] if lo <= r <= hi)
            else:
                try:
                    r = int(t)
                except ValueError:
                    continue
                if r in chains[chain]: out[chain].add(r)

    current = None
    for grp in spec.replace("\n"," ").split():
        if ":" in grp:
            ch, sel = grp.split(":",1)
            current = ch.strip()
            apply(current, sel.strip())
        else:
            tok = grp.strip()
            if tok in chains:
                current = tok
                apply(current, "all")
            elif current:
                apply(current, tok)

    # write single JSON mapping (not JSONL lines)
    sel = {ch: sorted(v) for ch,v in out.items() if v}
    if not sel:
        return None

    jsonl = pdb_path.parent / "fixed_positions.jsonl"
    stem  = pdb_path.stem
    payload = {stem: sel, f"{stem}.pdb": sel}
    jsonl.write_text(json.dumps(payload))
    return jsonl

def choose_python() -> str:
    py = str(MPNN_PY if MPNN_PY.exists() else "python3")
    if py != "python3" and not Path(py).exists():
        py = "python3"
    return py

def build_mpnn_cmd(
    pdb_path: Path,
    out_dir: Path,
    model_name: str = "v_48_020",
    num_seq: int = 10,
    batch_size: int = 1,
    sampling_temp: float = 0.1,
    fixed_jsonl: Optional[Path] = None,
) -> str:
    if not MPNN_SCRIPT.exists():
        raise FileNotFoundError(f"ProteinMPNN script not found: {MPNN_SCRIPT}")
    if not MPNN_WEIGHTS.exists():
        raise FileNotFoundError(f"ProteinMPNN weights missing: {MPNN_WEIGHTS}")

    py = choose_python()
    cmd = (
        f"{shlex.quote(py)} {shlex.quote(str(MPNN_SCRIPT))} "
        f"--pdb_path {shlex.quote(str(pdb_path))} "
        f"--out_folder {shlex.quote(str(out_dir))} "
        f"--path_to_model_weights {shlex.quote(str(MPNN_WEIGHTS))} "
        f"--model_name {shlex.quote(model_name)} "
        f"--num_seq_per_target {int(num_seq)} "
        f"--batch_size {int(batch_size)} "
        f"--sampling_temp {float(sampling_temp)}"
    )
    if fixed_jsonl:
        cmd += f" --fixed_positions_jsonl {shlex.quote(str(fixed_jsonl))}"
    return cmd
