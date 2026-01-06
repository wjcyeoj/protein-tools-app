# backend/services/proteinsol.py
import json
import shlex
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Dict, Any

def check_proteinsol_env(root: Path):
    if not root.exists():
        raise RuntimeError(f"ProteinSol root not found: {root}")
    if not (root / "repo/protein-sol").exists():
        raise RuntimeError("ProteinSol Perl scripts missing")
    if not shutil.which("perl"):
        raise RuntimeError("Perl not found in PATH")

def run_proteinsol(
    fasta_path: Path,
    out_dir: Path,
    log_path: Path,
    *,
    wrapper_script: Path,
    python_bin: str = "python3",
    extra_args: Optional[list[str]] = None,
) -> str:
    """
    Runs Protein-Sol prediction wrapper.
    Returns a shell command string (so you can use your existing _launch()).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    args = [
        python_bin,
        str(wrapper_script),
        "--input", str(fasta_path),
        "--output", str(out_dir / "proteinsol"),
    ]
    if extra_args:
        args += extra_args

    cmd = " ".join(shlex.quote(a) for a in args)
    return cmd

def parse_summary(out_dir: Path) -> Dict[str, Any]:
    """
    Best-effort: read the CSV produced by wrapper, return a small summary for UI.
    (Exact columns depend on the wrapper; keep it defensive.)
    """
    import csv

    # wrapper in protein_sol_mcp typically writes: <prefix>_solubility_results.csv
    # We used prefix = out_dir/"proteinsol" so expected:
    # proteinsol_solubility_results.csv
    csv_path = out_dir / "proteinsol_solubility_results.csv"
    if not csv_path.exists():
        # fall back: find any *_solubility_results.csv
        matches = list(out_dir.glob("*_solubility_results.csv"))
        if matches:
            csv_path = matches[0]
        else:
            return {"note": "No solubility_results.csv found"}

    with csv_path.open("r", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return {"note": "Empty solubility_results.csv"}

    # Usually single sequence → single row
    row0 = rows[0]
    # Return a small stable subset (don’t assume exact column names)
    return {
        "file": csv_path.name,
        "row": row0,
        "n_sequences": len(rows),
    }
