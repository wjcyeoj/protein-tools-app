from pathlib import Path
from typing import Optional, Dict

def _first(db: Path, pattern: str) -> Optional[Path]:
    matches = sorted(db.glob(pattern))
    return matches[0] if matches else None

def detect_af_databases(AF_DB: Path) -> Dict[str, str | None]:
    uniref90   = _first(AF_DB, "uniref90/*.fa*")
    mgnify     = _first(AF_DB, "mgnify/*.fa*")
    uniprot    = _first(AF_DB, "uniprot/*")
    pdb_seqres = _first(AF_DB, "pdb_seqres/*")
    obsolete   = AF_DB / "pdb_mmcif" / "obsolete.dat"

    def hh_prefix(globpat: str) -> Optional[str]:
        ff = _first(AF_DB, globpat)
        if not ff: return None
        return ff.name.replace("_hhm.ffindex","")

    return {
        "uniref90":   f"/db/uniref90/{uniref90.name}" if uniref90 else None,
        "mgnify":     f"/db/mgnify/{mgnify.name}" if mgnify else None,
        "u30_prefix": f"/db/uniref30/{hh_prefix('uniref30/*_hhm.ffindex')}" if hh_prefix('uniref30/*_hhm.ffindex') else None,
        "bfd_prefix": f"/db/bfd/{hh_prefix('bfd/*_hhm.ffindex')}" if hh_prefix('bfd/*_hhm.ffindex') else None,
        "pdb70_prefix": f"/db/pdb70/{hh_prefix('pdb70/*_hhm.ffindex')}" if hh_prefix('pdb70/*_hhm.ffindex') else None,
        "uniprot":    f"/db/uniprot/{uniprot.name}" if uniprot else None,
        "pdb_seqres": f"/db/pdb_seqres/{pdb_seqres.name}" if pdb_seqres else None,
        "mmcif_dir":  "/db/pdb_mmcif/mmcif_files" if (AF_DB/"pdb_mmcif"/"mmcif_files").exists() else None,
        "obsolete":   "/db/pdb_mmcif/obsolete.dat" if obsolete.exists() else None,
    }
