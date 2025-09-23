import json, shlex, sys
from pathlib import Path
from typing import Optional
from ..utils.config import MPNN_SCRIPT, MPNN_WEIGHTS
from ..utils.files import parse_freeze_spec

def build_mpnn_cmd(src_path: Path, out_dir: Path,
                   model: str, nseq: int, bsz: int, temp: float,
                   freeze_spec: Optional[str], in_dir: Path, log_path: Path) -> str:
    if not MPNN_SCRIPT.exists():
        raise RuntimeError(f"ProteinMPNN script not found at {MPNN_SCRIPT}")
    if not MPNN_WEIGHTS.exists():
        raise RuntimeError(f"ProteinMPNN weights missing at {MPNN_WEIGHTS}")
    if src_path.suffix.lower() not in (".pdb",".cif"):
        raise RuntimeError("ProteinMPNN expects a .pdb or .cif file.")

    fixed_jsonl_path = None
    if freeze_spec and freeze_spec.strip():
        fixed = parse_freeze_spec(src_path, freeze_spec)
        if fixed:
            fixed_jsonl_path = in_dir / "fixed_positions.jsonl"
            stem = src_path.stem
            payload = {stem: fixed, f"{stem}.pdb": fixed}
            fixed_jsonl_path.write_text(json.dumps(payload))
            with open(log_path,"a") as lf: lf.write(f"freeze payload keys: {list(payload.keys())}\n")

    cmd = (
        f"{shlex.quote(sys.executable)} {shlex.quote(str(MPNN_SCRIPT))} "
        f"--pdb_path {shlex.quote(str(src_path))} "
        f"--out_folder {shlex.quote(str(out_dir))} "
        f"--path_to_model_weights {shlex.quote(str(MPNN_WEIGHTS))} "
        f"--model_name {shlex.quote(model)} "
        f"--num_seq_per_target {int(nseq)} "
        f"--batch_size {int(bsz)} "
        f"--sampling_temp {float(temp)}"
    )
    if fixed_jsonl_path:
        cmd += f" --fixed_positions_jsonl {shlex.quote(str(fixed_jsonl_path))}"
    return cmd
