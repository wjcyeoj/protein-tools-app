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

    # ----------------------------
    # 1) Submit job
    # ----------------------------
    submit_url = f"{base_url}/RESTful/submit/userinput/"

    # A3D2 expects multipart with:
    # - inputfile: uploaded PDB
    # - json: options JSON string
    options = {
        "dynamic": bool(args.dynamic),
        "distance": int(args.distance),   # 5 or 10
        "foldx": bool(args.foldx),
        "hide": bool(args.hide),
    }

    try:
        with pdb_path.open("rb") as f:
            resp = requests.post(
                submit_url,
                files={
                    # IMPORTANT: field name must be "inputfile"
                    "inputfile": (pdb_path.name, f, "chemical/x-pdb"),
                    # IMPORTANT: field name must be "json"
                    "json": (None, json.dumps(options), "application/json"),
                },
                timeout=120,
            )
    except Exception as e:
        write_text(out_dir / "submit_error.txt", str(e))
        raise

    write_text(out_dir / "submit_response.txt", resp.text)
    if resp.status_code != 200:
        # Save whatever JSON exists too
        j = safe_json(resp)
        if j is not None:
            write_json(out_dir / "submit_response.json", j)
        resp.raise_for_status()

    data = resp.json()
    write_json(out_dir / "submit_response.json", data)

    jobid = data.get("jobid") or data.get("job_id") or data.get("id")
    if not jobid:
        raise RuntimeError(f"Could not parse jobid from submit response: {data}")

    write_text(out_dir / "a3d_jobid.txt", str(jobid))

    # ----------------------------
    # 2) Poll job status
    # ----------------------------
    status_url = f"{base_url}/RESTful/job/{jobid}/status/"
    start = time.time()
    last_status = None

    while True:
        if time.time() - start > args.timeout_s:
            raise TimeoutError(f"Aggrescan3D job timed out after {args.timeout_s}s")

        r = requests.get(status_url, timeout=60)
        write_text(out_dir / "status_response.txt", r.text)
        if r.status_code != 200:
            j = safe_json(r)
            if j is not None:
                write_json(out_dir / "status_response.json", j)
            r.raise_for_status()

        st = r.json()
        write_json(out_dir / "status_response.json", st)

        status = str(st.get("status", "")).lower()
        if status != last_status:
            last_status = status
            # lightweight status log file for debugging
            with (out_dir / "status_log.txt").open("a") as lf:
                lf.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {status}\n")

        # Documented done status is "done"
        if status == "done":
            break
        if status in ("error", "failed", "fail"):
            raise RuntimeError(f"Aggrescan3D returned failure status: {st}")

        time.sleep(max(1, int(args.poll_s)))

    # ----------------------------
    # 3) Download results
    # ----------------------------
    # Full job info JSON
    info_url = f"{base_url}/RESTful/job/{jobid}/"
    info = requests.get(info_url, timeout=120)
    write_text(out_dir / "job_response.txt", info.text)
    info.raise_for_status()
    # store as JSON if possible
    jinfo = safe_json(info)
    if jinfo is not None:
        write_json(out_dir / "a3d_result.json", jinfo)
    else:
        write_text(out_dir / "a3d_result.json", info.text)

    # Scored structure (PDB with A3D values embedded)
    structure_url = f"{base_url}/RESTful/job/{jobid}/structure/"
    spdb = requests.get(structure_url, timeout=120)
    write_text(out_dir / "a3d_scored.pdb", spdb.text)
    spdb.raise_for_status()

    # small summary for your frontend (optional)
    write_json(out_dir / "summary.json", {
        "tool": "aggrescan3d",
        "jobid": jobid,
        "files": [p.name for p in sorted(out_dir.glob("*"))],
    })


if __name__ == "__main__":
    main()
