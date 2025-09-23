import shlex
from pathlib import Path
from ..utils.config import AF_DB, AF_IMAGE, AF_USE_GPU, JAX_PLATFORM
from ..utils.afdb import detect_af_databases

def build_af_cmd(fasta_host: Path, out_host_dir: Path, job_id: str,
                 model_preset="monomer", db_preset="full_dbs", max_template_date="2024-12-31") -> tuple[str,str]:
    af = detect_af_databases(AF_DB)
    db_ok = all([af["uniref90"], af["mgnify"], af["u30_prefix"],
                 af["bfd_prefix"], af["mmcif_dir"], af["obsolete"]])
    if model_preset == "multimer":
        db_ok = db_ok and af["uniprot"] and af["pdb_seqres"]
    if not db_ok:
        raise RuntimeError(f"AlphaFold DBs are incomplete under {AF_DB}")

    args = [
        f"--fasta_paths=/in/{fasta_host.name}",
        f"--data_dir=/db",
        f"--output_dir=/out/{fasta_host.stem}",
        f"--max_template_date={max_template_date}",
        f"--db_preset={db_preset}",
        f"--model_preset={model_preset}",
        f"--uniref90_database_path={af['uniref90']}",
        f"--mgnify_database_path={af['mgnify']}",
        f"--uniref30_database_path={af['u30_prefix']}",
        f"--bfd_database_path={af['bfd_prefix']}",
        f"--template_mmcif_dir={af['mmcif_dir']}",
        f"--obsolete_pdbs_path={af['obsolete']}",
        "--models_to_relax=none",
        "--use_gpu_relax=false",
    ]
    if model_preset == "multimer":
        args += [
            f"--uniprot_database_path={af['uniprot']}",
            f"--pdb_seqres_database_path={af['pdb_seqres']}",
        ]

    arg_str = " ".join(shlex.quote(a) for a in args)
    cont = f"af-{job_id}"
    docker = (
        f"docker run --rm --name {cont} "
        f"{'--gpus all ' if AF_USE_GPU else ''}"
        f"--shm-size=16g "
        f"-e JAX_PLATFORM_NAME={JAX_PLATFORM} "
        f"-e XLA_PYTHON_CLIENT_PREALLOCATE=false "
        f"-v {AF_DB}:/db -v {fasta_host.parent}:/in -v {out_host_dir}:/out "
        f"{AF_IMAGE} {arg_str}"
    )
    return docker, cont
