# backend/utils/af.py
from pathlib import Path
from typing import Optional, Dict, List
import shlex
from .config import AF_DB, AF_IMAGE

def _first(p: Path, pattern: str) -> Optional[Path]:
    matches = sorted((p / ".").glob(pattern))
    return matches[0] if matches else None

def detect_databases() -> Dict[str, Optional[str]]:
    """Return container paths (as strings) AlphaFold expects, or None if missing."""
    uniref90 = _first(AF_DB, "uniref90/*.fa*")
    mgnify   = _first(AF_DB, "mgnify/*.fa*")
    uniprot  = _first(AF_DB, "uniprot/*")
    pdb_seq  = _first(AF_DB, "pdb_seqres/*")
    obsolete = AF_DB / "pdb_mmcif" / "obsolete.dat"

    def hh_prefix(dir_glob: str) -> Optional[str]:
        ff = _first(AF_DB, dir_glob)
        if not ff: return None
        return ff.name.replace("_hhm.ffindex", "")

    u30_prefix  = hh_prefix("uniref30/*_hhm.ffindex")
    bfd_prefix  = hh_prefix("bfd/*_hhm.ffindex")
    pdb70_pref  = hh_prefix("pdb70/*_hhm.ffindex")
    mmcif_dir   = AF_DB / "pdb_mmcif" / "mmcif_files"

    return {
        "uniref90":   f"/db/uniref90/{uniref90.name}" if uniref90 else None,
        "mgnify":     f"/db/mgnify/{mgnify.name}"     if mgnify   else None,
        "u30_prefix": f"/db/uniref30/{u30_prefix}"    if u30_prefix else None,
        "bfd_prefix": f"/db/bfd/{bfd_prefix}"         if bfd_prefix else None,
        "pdb70_pref": f"/db/pdb70/{pdb70_pref}"       if pdb70_pref else None,
        "uniprot":    f"/db/uniprot/{uniprot.name}"   if uniprot  else None,
        "pdb_seqres": f"/db/pdb_seqres/{pdb_seq.name}"if pdb_seq  else None,
        "mmcif_dir":  "/db/pdb_mmcif/mmcif_files"     if mmcif_dir.exists() else None,
        "obsolete":   "/db/pdb_mmcif/obsolete.dat"    if obsolete.exists()  else None,
    }

def build_af_docker_cmd(
    fasta_host_path: Path,
    out_host_dir: Path,
    model_preset: str = "monomer",
    db_preset: str = "full_dbs",
    max_template_date: str = "2024-12-31",
) -> Optional[str]:
    """
    Returns a ready-to-run 'docker run ...' shell command string, or None if DBs incomplete.
    """
    db = detect_databases()

    # minimal set
    db_ok = all([db["uniref90"], db["mgnify"], db["u30_prefix"], db["bfd_prefix"], db["mmcif_dir"], db["obsolete"]])
    if model_preset == "multimer":
        db_ok = db_ok and db["uniprot"] and db["pdb_seqres"]
    if not db_ok:
        return None

    fasta_in_cont = f"/in/{fasta_host_path.name}"
    out_name      = fasta_host_path.stem
    out_cont_dir  = f"/out/{out_name}"

    args: List[str] = [
        f"--fasta_paths={fasta_in_cont}",
        f"--data_dir=/db",
        f"--output_dir={out_cont_dir}",
        f"--max_template_date={max_template_date}",
        f"--db_preset={db_preset}",
        f"--model_preset={model_preset}",
        f"--uniref90_database_path={db['uniref90']}",
        f"--mgnify_database_path={db['mgnify']}",
        f"--uniref30_database_path={db['u30_prefix']}",
        f"--bfd_database_path={db['bfd_prefix']}",
        f"--template_mmcif_dir={db['mmcif_dir']}",
        f"--obsolete_pdbs_path={db['obsolete']}",
        "--models_to_relax=none",
        "--use_gpu_relax=false",
    ]
    if model_preset == "multimer":
        args += [
            f"--uniprot_database_path={db['uniprot']}",
            f"--pdb_seqres_database_path={db['pdb_seqres']}",
        ]
    elif db.get("pdb70_pref"):
        args += [f"--pdb70_database_path={db['pdb70_pref']}"]

    arg_str = " ".join(shlex.quote(a) for a in args)
    # NOTE: we mount only what's needed
    docker_cmd = (
        "docker run --rm --name af-$(openssl rand -hex 4) --gpus all --shm-size=16g "
        "-e JAX_PLATFORM_NAME=cuda -e XLA_PYTHON_CLIENT_PREALLOCATE=false "
        f"-v {AF_DB}:/db -v {fasta_host_path.parent}:/in -v {out_host_dir}:/out "
        f"{AF_IMAGE} {arg_str}"
    )
    return docker_cmd
