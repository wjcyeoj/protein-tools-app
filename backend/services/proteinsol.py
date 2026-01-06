# backend/services/proteinsol.py
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

# Read-only mount in container (compose.yaml has /data/tools:/data/tools:ro)
PROTEINSOL_REPO = Path("/data/tools/protein_sol_mcp/repo/protein-sol")

# If you created a venv specifically for proteinsol under /data/appjobs/venvs/proteinsol
# you can keep using it. Otherwise, default to "python3".
DEFAULT_PY = Path("/data/appjobs/venvs/proteinsol/bin/python")


def _append_log(log_path: Path, msg: str):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as lf:
        lf.write(msg.rstrip() + "\n")


def _copy_pipeline_to_workdir(work_dir: Path, log_path: Path):
    """
    Copy the protein-sol perl pipeline directory into a writable job workdir.
    We copy (not symlink) because some Perl scripts use relative file access
    and may create intermediate files alongside scripts.
    """
    if not PROTEINSOL_REPO.exists():
        raise FileNotFoundError(f"ProteinSol pipeline directory not found: {PROTEINSOL_REPO}")

    # Ensure workdir is clean
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    _append_log(log_path, f"[proteinsol] Copying pipeline from {PROTEINSOL_REPO} -> {work_dir}")
    shutil.copytree(PROTEINSOL_REPO, work_dir, dirs_exist_ok=True)


def _run(cmd: List[str], cwd: Path, log_path: Path) -> subprocess.CompletedProcess:
    _append_log(log_path, f"[proteinsol] CWD: {cwd}")
    _append_log(log_path, f"[proteinsol] CMD: {' '.join(cmd)}")
    p = subprocess.run(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if p.stdout:
        _append_log(log_path, p.stdout)
    _append_log(log_path, f"[proteinsol] return_code={p.returncode}")
    return p


def _find_outputs(work_dir: Path) -> List[Path]:
    """
    Protein-sol pipeline commonly generates:
      *.fasta-protein_sol.csv
      *.fasta-protein_sol_prediction.txt
      *.fasta-protein_sol_composition.txt
      *.log
    We'll collect anything that looks like protein_sol outputs.
    """
    out = []
    out += sorted(work_dir.glob("*.fasta-protein_sol*.csv"))
    out += sorted(work_dir.glob("*.fasta-protein_sol*_prediction*.txt"))
    out += sorted(work_dir.glob("*.fasta-protein_sol*_composition*.txt"))
    out += sorted(work_dir.glob("*.fasta-protein_sol*.txt"))
    out += sorted(work_dir.glob("*.log"))
    # De-dupe while preserving order
    seen = set()
    uniq = []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


def _standardize_outputs(produced: List[Path], out_prefix: Path, log_path: Path) -> Dict[str, str]:
    """
    Copy produced files into out_prefix.parent using stable names:
      <prefix>_solubility_results.csv
      <prefix>_detailed_prediction.txt
      <prefix>_composition.txt
      <prefix>_prediction.log
    """
    out_dir = out_prefix.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    mapped: Dict[str, str] = {}
    for f in produced:
        name = f.name

        if name.endswith("-protein_sol.csv") or name.endswith("_protein_sol.csv") or name.endswith("protein_sol.csv"):
            dst = out_dir / f"{out_prefix.name}_solubility_results.csv"
            key = "results_csv"
        elif "composition" in name and name.endswith(".txt"):
            dst = out_dir / f"{out_prefix.name}_composition.txt"
            key = "composition_txt"
        elif ("prediction" in name or "detailed" in name) and name.endswith(".txt"):
            dst = out_dir / f"{out_prefix.name}_detailed_prediction.txt"
            key = "detailed_txt"
        elif name.endswith(".log"):
            dst = out_dir / f"{out_prefix.name}_prediction.log"
            key = "prediction_log"
        else:
            # keep any extras with original name
            dst = out_dir / name
            key = f"extra:{name}"

        shutil.copy2(f, dst)
        mapped[key] = str(dst)
        _append_log(log_path, f"[proteinsol] wrote: {dst}")

    return mapped


def run_proteinsol(
    job_id: str,
    input_fasta: Path,
    output_dir: Path,
    log_path: Path,
    python_bin: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Execute protein-sol perl pipeline in a writable per-job workdir
    and return a structured result dict.

    This is intended to be called from your backend job handler.
    """
    if not input_fasta.exists():
        return {"tool": "proteinsol", "ok": False, "error": f"Input FASTA not found: {input_fasta}"}

    if input_fasta.suffix.lower() not in (".fa", ".fasta"):
        return {"tool": "proteinsol", "ok": False, "error": "ProteinSol expects a .fa or .fasta file."}

    output_dir.mkdir(parents=True, exist_ok=True)
    out_prefix = output_dir / "proteinsol"

    # Workdir must be writable -> use job output area
    work_dir = output_dir / "proteinsol_work"

    try:
        _copy_pipeline_to_workdir(work_dir, log_path)

        perl_script = work_dir / "server_prediction_seq_export.pl"
        if not perl_script.exists():
            return {
                "tool": "proteinsol",
                "ok": False,
                "error": f"Missing Perl script in pipeline dir: {perl_script}",
            }

        # Run Perl pipeline directly (most reliable)
        # NOTE: It often writes outputs relative to cwd, so cwd=work_dir is critical.
        p = _run(["perl", str(perl_script), str(input_fasta)], cwd=work_dir, log_path=log_path)

        produced = _find_outputs(work_dir)
        mapping = _standardize_outputs(produced, out_prefix, log_path)

        results_csv = Path(mapping.get("results_csv", ""))
        ok = results_csv.exists()

        # Parse CSV rows lightly (optional). Keep empty if you want fast.
        rows: List[Dict[str, Any]] = []
        summary: Dict[str, Any] = {}

        if ok:
            # Minimal CSV parse without pandas (safe/fast)
            import csv
            with open(results_csv, newline="") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    rows.append(r)
            summary = {"n_sequences": len(rows)}

        result = {
            "tool": "proteinsol",
            "ok": ok,
            "return_code": p.returncode,
            "output_prefix": str(out_prefix),
            "files": list(mapping.values()),
            "rows": rows,
            "summary": summary,
        }

        if not ok:
            result["error"] = (
                "ProteinSol ran but results CSV not found. "
                "Most likely the perl pipeline failed to generate outputs; see logs."
            )

        # Save a machine-readable result JSON
        (output_dir / "proteinsol_result.json").write_text(json.dumps(result, indent=2))

        return result

    except Exception as e:
        _append_log(log_path, f"[proteinsol] ERROR: {e}")
        result = {
            "tool": "proteinsol",
            "ok": False,
            "error": str(e),
            "output_prefix": str(out_prefix),
            "files": [],
            "rows": [],
            "summary": {},
        }
        (output_dir / "proteinsol_result.json").write_text(json.dumps(result, indent=2))
        return result
