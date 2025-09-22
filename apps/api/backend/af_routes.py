from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import PlainTextResponse, FileResponse
from pathlib import Path
import shlex
import os
from .config import AF_IMAGE, AF_DB_DIR, AF_OUTPUT_BASE, JOBS_DIR, SHM_SIZE
from .utils import new_job, write_json, docker_inspect_status, docker_logs, tgz_dir

router = APIRouter()

@router.post("/jobs")
async def submit_af_job(
    fasta: UploadFile = File(...),
    model_preset: str = Form("monomer"),    # monomer | monomer_casp14 | multimer
    db_preset: str = Form("full_dbs"),      # full_dbs | reduced_dbs
    max_template_date: str = Form("2024-12-31"),
    models_to_relax: str = Form("none"),    # none | best | all
    use_gpu_relax: bool = Form(False),
    out_name: str = Form("job")
):
    # Prepare job folder
    jid, jdir = new_job("af", JOBS_DIR)
    work = jdir / "work"
    out_dir = AF_OUTPUT_BASE / out_name
    work.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save FASTA
    fasta_path = work / "input.fasta"
    content = await fasta.read()
    fasta_path.write_bytes(content)

    # Detect DB components (must exist)
    uniref90 = list((AF_DB_DIR/"uniref90").glob("*.fa*"))
    mgnify   = list((AF_DB_DIR/"mgnify").glob("*.fa*"))
    uniref30_prefix = next((p.with_suffix('').with_suffix('') for p in (AF_DB_DIR/"uniref30").glob("*_hhm.ffindex")), None)
    bfd_prefix     = next((p.with_suffix('').with_suffix('') for p in (AF_DB_DIR/"bfd").glob("*_hhm.ffindex")), None)

    if model_preset == "multimer":
        # multimer requires uniprot + pdb_seqres; should NOT set pdb70
        uniprot = list((AF_DB_DIR/"uniprot").glob("*"))
        pdb_seqres = list((AF_DB_DIR/"pdb_seqres").glob("*"))
        if not uniref90 or not mgnify or not uniref30_prefix or not bfd_prefix or not uniprot or not pdb_seqres:
            raise HTTPException(400, "Missing required multimer DBs (uniref90, mgnify, uniref30, bfd, uniprot, pdb_seqres)")
    else:
        # monomer uses pdb70
        pdb70_prefix = next((p.with_suffix('').with_suffix('') for p in (AF_DB_DIR/"pdb70").glob("*_hhm.ffindex")), None)
        if not uniref90 or not mgnify or not uniref30_prefix or not bfd_prefix or not pdb70_prefix:
            raise HTTPException(400, "Missing required monomer DBs (uniref90, mgnify, uniref30, bfd, pdb70)")

    # Build docker command
    name = f"af-{jid}"
    cmd = [
        "docker","run","--rm","--name",name,"--gpus","all",f"--shm-size={SHM_SIZE}",
        "-e","JAX_PLATFORM_NAME=cuda","-e","XLA_PYTHON_CLIENT_PREALLOCATE=false",
        "-v",f"{AF_DB_DIR}:/db",
        "-v",f"{work}:/in",
        "-v",f"{out_dir}:/out",
        AF_IMAGE,
        "--fasta_paths=/in/input.fasta",
        "--data_dir=/db",
        f"--output_dir=/out",
        f"--db_preset={db_preset}",
        f"--model_preset={model_preset}",
        f"--max_template_date={max_template_date}",
        f"--uniref90_database_path=/db/uniref90/{uniref90[0].name}",
        f"--mgnify_database_path=/db/mgnify/{mgnify[0].name}",
        f"--uniref30_database_path=/db/uniref30/{uniref30_prefix.name}",
        f"--bfd_database_path=/db/bfd/{bfd_prefix.name}",
        f"--models_to_relax={models_to_relax}",
        f"--use_gpu_relax={'true' if use_gpu_relax else 'false'}",
    ]
    if model_preset == "multimer":
        # multimer: do NOT set pdb70; instead set uniprot + pdb_seqres + mmcif
        uniprot = list((AF_DB_DIR/"uniprot").glob("*"))[0]
        pdb_seqres = list((AF_DB_DIR/"pdb_seqres").glob("*"))[0]
        cmd += [
            f"--uniprot_database_path=/db/uniprot/{uniprot.name}",
            f"--pdb_seqres_database_path=/db/pdb_seqres/{pdb_seqres.name}",
        ]
    else:
        # monomer: set pdb70
        pdb70_prefix = next((p.with_suffix('').with_suffix('') for p in (AF_DB_DIR/"pdb70").glob("*_hhm.ffindex")), None)
        cmd += [ f"--pdb70_database_path=/db/pdb70/{pdb70_prefix.name}" ]

    # common template mmcif + obsolete
    cmd += [
        "--template_mmcif_dir=/db/pdb_mmcif/mmcif_files",
        "--obsolete_pdbs_path=/db/pdb_mmcif/obsolete.dat"
    ]

    # launch detached via `docker run` (FastAPI returns immediately)
    log = jdir / "logs" / "docker.log"
    meta = {"job_id": jid, "name": name, "out_dir": str(out_dir), "work": str(work), "cmd": " ".join(shlex.quote(x) for x in cmd)}
    write_json(jdir / "meta.json", meta)

    # we don't need subprocess here because docker runs detached by default only if we add "-d"
    # but we want logs; so run attached in backend and let it stream to file in background:
    # use Popen to not block the HTTP request.
    import subprocess, threading
    with open(log, "ab", buffering=0) as lf:
        proc = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT)
    (jdir / "pid.txt").write_text(str(proc.pid))
    return {"job_id": jid}

@router.get("/jobs/{job_id}")
def af_status(job_id: str):
    jdir = (JOBS_DIR / "af" / job_id)
    meta = (jdir / "meta.json")
    if not meta.exists(): raise HTTPException(404, "job not found")
    name = read_json := __import__("json").loads(meta.read_text())["name"]
    status, code = docker_inspect_status(name)
    return {"status": status, "exit_code": code}

@router.get("/jobs/{job_id}/logs", response_class=PlainTextResponse)
def af_logs(job_id: str, tail: int = 200):
    jdir = (JOBS_DIR / "af" / job_id)
    meta = (jdir / "meta.json")
    if not meta.exists(): raise HTTPException(404, "job not found")
    name = __import__("json").loads(meta.read_text())["name"]
    return docker_logs(name, tail=tail)

@router.get("/jobs/{job_id}/download")
def af_download(job_id: str):
    jdir = (JOBS_DIR / "af" / job_id)
    meta = (jdir / "meta.json")
    if not meta.exists(): raise HTTPException(404, "job not found")
    out_dir = Path(__import__("json").loads(meta.read_text())["out_dir"])
    if not out_dir.exists(): raise HTTPException(404, "output not ready")
    tgz = jdir / f"{out_dir.name}.tgz"
    if not tgz.exists(): tgz_dir(out_dir, tgz)
    return FileResponse(tgz, filename=tgz.name)
