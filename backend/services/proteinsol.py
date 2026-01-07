# backend/services/proteinsol.py
import csv
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

# Read-only mount in container (compose.yaml has /data/tools:/data/tools:ro)
PROTEINSOL_REPO = Path("/data/tools/protein_sol_mcp/repo/protein-sol")

# If you created a venv specifically for proteinsol under /data/appjobs/venvs/proteinsol
DEFAULT_PY = Path("/data/appjobs/venvs/proteinsol/bin/python")

def _read_fasta_map(fasta_path: Path) -> Dict[str, str]:
    """Return {ID: SEQUENCE} from a FASTA file (ID is first token after '>')."""
    seqs: Dict[str, List[str]] = {}
    current_id = None
    for line in fasta_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            current_id = line[1:].strip().split()[0]
            seqs[current_id] = []
        else:
            if current_id is None:
                continue
            seqs[current_id].append(line.strip())
    return {k: "".join(v) for k, v in seqs.items()}

def _parse_seq_prediction_txt(pred_txt: Path) -> List[Dict[str, Any]]:
    """
    Extract only the prediction rows.
    ProteinSol format:
      SEQUENCE PREDICTIONS,>ID,percent-sol,scaled-sol,population-sol,pI
    """
    out = []
    for line in pred_txt.read_text(errors="ignore").splitlines():
        line = line.strip()
        if not line.startswith("SEQUENCE PREDICTIONS,"):
            continue
        parts = [p.strip() for p in line.split(",")]
        # parts: ["SEQUENCE PREDICTIONS", ">VERI-000", "43.684", "0.356", "0.446", "5.830"]
        if len(parts) < 6:
            continue
        raw_id = parts[1]
        seq_id = raw_id.lstrip(">").strip()
        try:
            out.append({
                "ID": seq_id,
                "percent-sol": float(parts[2]),
                "scaled-sol": float(parts[3]),
                "population-sol": float(parts[4]),
                "pI": float(parts[5]),
            })
        except ValueError:
            # skip malformed numeric lines
            continue
    return out

def _append_log(log_path: Path, msg: str):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as lf:
        lf.write(msg.rstrip() + "\n")


def _clean_bundled_examples(work_dir: Path, log_path: Path):
    patterns = [
        "example.fasta",
        "example.fasta_*",
        "example.fasta-*",
        "*protein_sol*.csv",
        "*protein_sol*.txt",
        "*protein_sol*.log",
    ]
    removed = 0
    for pat in patterns:
        for p in work_dir.glob(pat):
            try:
                p.unlink()
                removed += 1
            except Exception:
                pass
    _append_log(log_path, f"[proteinsol] cleaned bundled example outputs (removed {removed} files)")


def _copy_pipeline_to_workdir(work_dir: Path, log_path: Path):
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


def _guess_delimiter(line: str) -> str:
    # protein-sol outputs vary; sometimes tab, sometimes multiple spaces.
    if "\t" in line:
        return "\t"
    if "," in line:
        return ","
    return " "


def _parse_seq_prediction(seq_pred_path: Path) -> List[Dict[str, Any]]:
    """
    Parse protein-sol's seq_prediction.txt into a list of dicts.
    This file is the real result from the perl pipeline (wrapper).
    """
    lines = seq_pred_path.read_text(errors="ignore").splitlines()
    # drop empty lines
    lines = [ln for ln in lines if ln.strip()]
    if not lines:
        return []

    # Find a header line if present
    header_idx = None
    for i, ln in enumerate(lines[:30]):
        low = ln.lower()
        if ("percent" in low and "sol" in low) and ("scaled" in low or "population" in low or "pi" in low):
            header_idx = i
            break

    data_lines = lines
    header = None

    if header_idx is not None:
        header = lines[header_idx].strip()
        data_lines = lines[header_idx + 1 :]

    rows: List[Dict[str, Any]] = []

    # If we have a recognizable header, try structured parse
    if header:
        delim = _guess_delimiter(header)
        if delim == " ":
            header_fields = header.split()
        else:
            header_fields = [h.strip() for h in header.split(delim) if h.strip()]

        # Normalize likely column names
        norm = []
        for h in header_fields:
            h2 = h.strip().lower()
            h2 = h2.replace("%", "percent").replace("_", "-")
            norm.append(h2)

        for ln in data_lines:
            delim2 = _guess_delimiter(ln)
            if delim2 == " ":
                parts = ln.split()
            else:
                parts = [p.strip() for p in ln.split(delim2)]
            if len(parts) < 4:
                continue

            # Best-effort mapping
            record = {}
            for j, key in enumerate(norm[: len(parts)]):
                record[key] = parts[j]

            # Make your app’s expected keys
            out = {
                "ID": record.get("id") or record.get("protein") or record.get("name") or parts[0],
                "sequence": record.get("sequence") or (parts[1] if len(parts) > 1 else ""),
                "percent-sol": record.get("percent-sol") or record.get("percent-solubility") or record.get("percent-sol:") or "",
                "scaled-sol": record.get("scaled-sol") or "",
                "population-sol": record.get("population-sol") or "",
                "pI": record.get("pi") or record.get("pI") or record.get("p-i") or "",
            }
            rows.append(out)

        if rows:
            return rows

    # Fallback: very common simple format:
    # ID  SEQUENCE  percent-sol  scaled-sol  population-sol  pI
    for ln in data_lines:
        parts = ln.split()
        if len(parts) >= 6 and all(x.replace(".", "", 1).isdigit() for x in parts[-4:]):
            out = {
                "ID": parts[0],
                "sequence": parts[1],
                "percent-sol": parts[2],
                "scaled-sol": parts[3],
                "population-sol": parts[4],
                "pI": parts[5],
            }
            rows.append(out)

    return rows


def run_proteinsol(
    job_id: str,
    input_fasta: Path,
    output_dir: Path,
    log_path: Path,
    python_bin: Optional[Path] = None,
) -> Dict[str, Any]:
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
        _clean_bundled_examples(work_dir, log_path)

        # Copy input FASTA into the workdir
        local_fasta = work_dir / input_fasta.name
        shutil.copy2(input_fasta, local_fasta)
        _append_log(log_path, f"[proteinsol] Copied input FASTA -> {local_fasta}")

        # Some pipeline scripts assume the input is example.fasta; make it our input
        example_fasta = work_dir / "example.fasta"
        shutil.copy2(input_fasta, example_fasta)
        _append_log(log_path, f"[proteinsol] Copied input FASTA -> {example_fasta}")

        wrapper = work_dir / "multiple_prediction_wrapper_export.sh"
        wrapper_log = work_dir / "wrapper_stdout_stderr.log"

        cmd = [
            "bash",
            "-lc",
            (
                "set -euo pipefail; "
                f"chmod +x {wrapper.name}; "
                f"./{wrapper.name} {example_fasta.name} "
                f"> {wrapper_log.name} 2>&1; "
                "ls -la; "
            ),
        ]
        p = _run(cmd, cwd=work_dir, log_path=log_path)

        # Wrapper should produce seq_prediction.txt and seq_composition.txt
        seq_pred = work_dir / "seq_prediction.txt"
        seq_comp = work_dir / "seq_composition.txt"

        if not seq_pred.exists() or not seq_comp.exists():
            tail = ""
            if wrapper_log.exists():
                tail_lines = wrapper_log.read_text(errors="ignore").splitlines()[-120:]
                tail = "\n".join(tail_lines)
            _append_log(log_path, "[proteinsol] Missing expected wrapper outputs.")
            if tail:
                _append_log(log_path, "[proteinsol] wrapper log tail:\n" + tail)

            return {
                "tool": "proteinsol",
                "ok": False,
                "return_code": p.returncode,
                "error": "ProteinSol wrapper did not generate expected intermediate files (seq_prediction.txt / seq_composition.txt). See logs.",
                "output_prefix": str(out_prefix),
                "files": [],
                "rows": [],
                "summary": {},
            }

        fasta_map = _read_fasta_map(input_fasta)

        rows = _parse_seq_prediction_txt(work_dir / "seq_prediction.txt")  # or whatever file you mapped to protein_sol_prediction.txt

        for r in rows:
            r["sequence"] = fasta_map.get(r["ID"], "")

        results_csv_path = output_dir / f"{out_prefix.name}_solubility_results.csv"
        detailed_txt_path = output_dir / f"{out_prefix.name}_detailed_prediction.txt"
        composition_txt_path = output_dir / f"{out_prefix.name}_composition.txt"
        prediction_log_path = output_dir / f"{out_prefix.name}_prediction.log"

        fieldnames = ["ID", "sequence", "percent-sol", "scaled-sol", "population-sol", "pI"]
        with results_csv_path.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in fieldnames})

        # Copy raw text outputs for transparency/debugging
        shutil.copy2(seq_pred, detailed_txt_path)
        shutil.copy2(seq_comp, composition_txt_path)

        # Save logs: wrapper_stdout + run.log if present
        with open(prediction_log_path, "w") as f:
            if wrapper_log.exists():
                f.write(wrapper_log.read_text(errors="ignore"))
                f.write("\n")
            run_log = work_dir / "run.log"
            if run_log.exists():
                f.write(run_log.read_text(errors="ignore"))

        _append_log(log_path, f"[proteinsol] wrote: {results_csv_path}")
        _append_log(log_path, f"[proteinsol] wrote: {detailed_txt_path}")
        _append_log(log_path, f"[proteinsol] wrote: {composition_txt_path}")
        _append_log(log_path, f"[proteinsol] wrote: {prediction_log_path}")

        ok = results_csv_path.exists()

        summary = {
            "n_sequences": len(rows),
        }

        result = {
            "tool": "proteinsol",
            "ok": ok,
            "return_code": p.returncode,
            "output_prefix": str(out_prefix),
            "files": [
                str(results_csv_path),
                str(detailed_txt_path),
                str(composition_txt_path),
                str(prediction_log_path),
            ],
            "rows": rows,
            "summary": summary,
        }

        if not ok:
            result["error"] = "ProteinSol ran but results CSV could not be written; see logs."

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
