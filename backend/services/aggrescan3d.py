#!/usr/bin/env python3
"""
Aggrescan3D runner for Protein Tools app.

This script is designed to be launched via backend/main.py using _launch(),
so it should:
- run non-interactively
- write useful debug artifacts in out_dir
- exit with code != 0 on error

It uses Aggrescan3D 2.0 public REST API.
"""

import argparse
import json
import os
import time
from pathlib import Path

import requests


DEFAULT_BASE_URL = os.getenv("A3D_BASE_URL", "https://biocomp.chem.uw.edu.pl/A3D2")

def sanitize_pdb_for_foldx(src: Path, dst: Path):
    """
    Minimal PDB sanitization that often prevents FoldX failures:
    - Keep only first MODEL (if present)
    - Keep only ATOM records (+ TER/END)
    - Drop altlocs except blank or 'A'
    - Ensure chainID exists (blank -> 'A')
    """
    dst.parent.mkdir(parents=True, exist_ok=True)

    seen_model = False
    in_first_model = False

    with src.open("r", errors="ignore") as fin, dst.open("w") as fout:
        for line in fin:
            if line.startswith("MODEL"):
                if seen_model:
                    # second MODEL -> stop
                    break
                seen_model = True
                in_first_model = True
                continue
            if line.startswith("ENDMDL") and in_first_model:
                break

            if line.startswith("ATOM"):
                # altLoc at column 17 (0-based index 16)
                altloc = line[16:17]
                if altloc not in (" ", "A"):
                    continue

                # chainID at column 22 (0-based index 21)
                chain = line[21:22]
                if chain.strip() == "":
                    line = line[:21] + "A" + line[22:]

                fout.write(line)
            elif line.startswith("TER") or line.startswith("END"):
                fout.write(line)

        # ensure END
        fout.write("END\n")

def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2))


def safe_json(resp: requests.Response):
    try:
        return resp.json()
    except Exception:
        return None

def run_a3d_once(
    *,
    base_url: str,
    pdb_path: Path,
    out_dir: Path,
    distance: int,
    dynamic: bool,
    foldx: bool,
    hide: bool,
    poll_s: int,
    timeout_s: int,
    tag: str,
):
    """
    One attempt at running A3D. Writes attempt-tagged debug files.
    Returns (jobid, status_dict).
    Raises RuntimeError/TimeoutError on failure.
    """
    base_url = base_url.rstrip("/")
    submit_url = f"{base_url}/RESTful/submit/userinput/"

    options = {
        "dynamic": bool(dynamic),
        "distance": int(distance),
        "foldx": bool(foldx),
        "hide": bool(hide),
    }

    # ---- Submit ----
    with pdb_path.open("rb") as f:
        resp = requests.post(
            submit_url,
            files={
                "inputfile": (pdb_path.name, f, "chemical/x-pdb"),
                "json": (None, json.dumps(options), "application/json"),
            },
            timeout=120,
        )

    write_text(out_dir / f"{tag}_submit_response.txt", resp.text)
    if resp.status_code != 200:
        j = safe_json(resp)
        if j is not None:
            write_json(out_dir / f"{tag}_submit_response.json", j)
        resp.raise_for_status()

    data = resp.json()
    write_json(out_dir / f"{tag}_submit_response.json", data)

    jobid = data.get("jobid") or data.get("job_id") or data.get("id")
    if not jobid:
        raise RuntimeError(f"[{tag}] Could not parse jobid from submit response: {data}")

    write_text(out_dir / f"{tag}_jobid.txt", str(jobid))

    # ---- Poll ----
    status_url = f"{base_url}/RESTful/job/{jobid}/status/"
    start = time.time()
    last_status = None

    while True:
        if time.time() - start > timeout_s:
            raise TimeoutError(f"[{tag}] Timed out after {timeout_s}s while polling job {jobid}")

        r = requests.get(status_url, timeout=60)
        write_text(out_dir / f"{tag}_status_response.txt", r.text)
        if r.status_code != 200:
            j = safe_json(r)
            if j is not None:
                write_json(out_dir / f"{tag}_status_response.json", j)
            r.raise_for_status()

        st = r.json()
        write_json(out_dir / f"{tag}_status_response.json", st)

        status = str(st.get("status", "")).lower()
        if status != last_status:
            last_status = status
            with (out_dir / f"{tag}_status_log.txt").open("a") as lf:
                lf.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {status}\n")

        if status == "done":
            break

        if status in ("error", "failed", "fail"):
            # Fetch detailed job info (usually contains actual error)
            info_url = f"{base_url}/RESTful/job/{jobid}/"
            info = requests.get(info_url, timeout=120)
            write_text(out_dir / f"{tag}_job_response_on_error.txt", info.text)
            jinfo = safe_json(info)
            if jinfo is not None:
                write_json(out_dir / f"{tag}_job_response_on_error.json", jinfo)

                msg = (
                    jinfo.get("message")
                    or jinfo.get("error")
                    or jinfo.get("details")
                    or jinfo.get("log")
                    or jinfo.get("stderr")
                )
                raise RuntimeError(f"[{tag}] A3D job error: {msg or jinfo}")
            else:
                raise RuntimeError(f"[{tag}] A3D job error (non-JSON): {info.text[:2000]}")

        time.sleep(max(1, int(poll_s)))

    # ---- Download ----
    info_url = f"{base_url}/RESTful/job/{jobid}/"
    info = requests.get(info_url, timeout=120)
    write_text(out_dir / f"{tag}_job_response.txt", info.text)
    info.raise_for_status()
    jinfo = safe_json(info)
    if jinfo is not None:
        write_json(out_dir / f"{tag}_a3d_result.json", jinfo)
    else:
        write_text(out_dir / f"{tag}_a3d_result.json", info.text)

    structure_url = f"{base_url}/RESTful/job/{jobid}/structure/"
    spdb = requests.get(structure_url, timeout=120)
    write_text(out_dir / f"{tag}_a3d_scored.pdb", spdb.text)
    spdb.raise_for_status()

    return jobid, options

def main():
    ap = argparse.ArgumentParser(description="Run Aggrescan3D via REST API.")
    ap.add_argument("--pdb", required=True, help="Path to input .pdb file")
    ap.add_argument("--out_dir", required=True, help="Directory to write outputs")
    ap.add_argument("--base_url", default=DEFAULT_BASE_URL, help="Aggrescan3D base URL (A3D2)")
    ap.add_argument("--distance", type=int, default=10, choices=[5, 10], help="5 or 10 Angstrom radius")
    ap.add_argument("--dynamic", action="store_true", help="Enable dynamic mode")
    ap.add_argument("--foldx", action="store_true", help="Enable FoldX refinement")
    ap.add_argument("--hide", action="store_true", help="Hide structure on server (if supported)")
    ap.add_argument("--poll_s", type=int, default=10, help="Polling interval seconds")
    ap.add_argument("--timeout_s", type=int, default=1800, help="Timeout seconds")
    args = ap.parse_args()

    pdb_path = Path(args.pdb).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pdb_path.exists():
        raise FileNotFoundError(f"Input PDB not found: {pdb_path}")
    if pdb_path.suffix.lower() != ".pdb":
        raise ValueError("Aggrescan3D expects a .pdb file")

    base_url = args.base_url.rstrip("/")

    # Record run config for reproducibility/debugging
    write_json(out_dir / "a3d_request.json", {
        "base_url": base_url,
        "pdb": str(pdb_path),
        "distance": args.distance,
        "dynamic": bool(args.dynamic),
        "foldx": bool(args.foldx),
        "hide": bool(args.hide),
        "poll_s": args.poll_s,
        "timeout_s": args.timeout_s,
    })

    # Choose PDB for attempt 1 (sanitize if foldx requested)
    pdb_for_attempt1 = pdb_path
    if args.foldx:
        cleaned = out_dir / "input_foldx_cleaned.pdb"
        sanitize_pdb_for_foldx(pdb_path, cleaned)
        pdb_for_attempt1 = cleaned

    attempts = []

    try:
        jobid, used_options = run_a3d_once(
            base_url=base_url,
            pdb_path=pdb_for_attempt1,
            out_dir=out_dir,
            distance=args.distance,
            dynamic=args.dynamic,
            foldx=args.foldx,
            hide=args.hide,
            poll_s=args.poll_s,
            timeout_s=args.timeout_s,
            tag="foldx_on" if args.foldx else "foldx_off",
        )
        attempts.append({"attempt": 1, "foldx": bool(args.foldx), "jobid": jobid})
        final_tag = "foldx_on" if args.foldx else "foldx_off"

    except Exception as e:
        # If FoldX was requested, retry once with FoldX off
        if args.foldx:
            write_text(out_dir / "foldx_fallback_notice.txt", f"FoldX attempt failed; retrying without FoldX.\nError: {e}\n")

            jobid, used_options = run_a3d_once(
                base_url=base_url,
                pdb_path=pdb_path,  # use original (or you could also use cleaned)
                out_dir=out_dir,
                distance=args.distance,
                dynamic=args.dynamic,
                foldx=False,
                hide=args.hide,
                poll_s=args.poll_s,
                timeout_s=args.timeout_s,
                tag="fallback_no_foldx",
            )
            attempts.append({"attempt": 2, "foldx": False, "jobid": jobid})
            final_tag = "fallback_no_foldx"
        else:
            raise

    # Make “canonical” outputs for your app regardless of attempt tag
    # (so DownloadPanel users always see the same filenames)
    # Copy the winning attempt’s outputs to stable names:
    result_json = out_dir / f"{final_tag}_a3d_result.json"
    scored_pdb = out_dir / f"{final_tag}_a3d_scored.pdb"

    write_text(out_dir / "a3d_result.json", result_json.read_text())
    write_text(out_dir / "a3d_scored.pdb", scored_pdb.read_text())

    write_json(out_dir / "summary.json", {
        "tool": "aggrescan3d",
        "foldx_requested": bool(args.foldx),
        "foldx_used": (final_tag == "foldx_on"),
        "fallback_used": (final_tag == "fallback_no_foldx"),
        "final_tag": final_tag,
        "attempts": attempts,
        "files": [p.name for p in sorted(out_dir.glob("*"))],
    })

if __name__ == "__main__":
    main()
