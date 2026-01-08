# backend/services/rfdiffusion.py
import shlex
from pathlib import Path
from typing import Optional, Literal

def build_rfdiffusion_cmd(
    *,
    job_id: str,
    in_dir: Path,
    out_dir: Path,
    rf_mode: Literal["free","motif"],
    rf_len: int,
    rf_num_designs: int,
    rf_contigs: Optional[str],
    rf_num_steps: Optional[int],
    rf_temperature: Optional[float],
    rf_guidance_scale: Optional[float],
    rf_recycle: Optional[int],
    rf_seed: Optional[int],
    rf_deterministic: bool,
    rf_symmetry_type: Optional[str],
    rf_symmetry_order: Optional[int],
    rf_min_plddt: Optional[float],     # (not used yet; leave hook)
    rf_checkpoint: Optional[str],
    rf_extra_overrides: Optional[str],
    src_path: Optional[Path],
) -> str:
    RF_ROOT = Path("/data/tools/rfdiffusion").resolve()
    RF_MODELS = RF_ROOT / "models"
    if not RF_MODELS.exists():
        raise RuntimeError("Missing /data/tools/rfdiffusion/models with .pt weights")

    # contigs + input flag
    if rf_mode == "motif":
        if src_path is None or src_path.suffix.lower() != ".pdb":
            raise RuntimeError("Upload a .pdb file for RFdiffusion motif mode")
        if not rf_contigs or not rf_contigs.strip():
            raise RuntimeError("Provide rf_contigs for motif mode")
        hydra_contigs = f"'contigmap.contigs=[{rf_contigs.strip()}]'"
        input_flag = f"inference.input_pdb=/in/{src_path.name}"
    else:
        L = max(10, int(rf_len))
        hydra_contigs = f"'contigmap.contigs=[{L}-{L}]'"
        input_flag = ""

    out_prefix = f"rf_{job_id}"

    # symmetry
    symmetry_config = ""
    symmetry_override = ""
    if rf_symmetry_type:
        symmetry_config = "--config-name symmetry"
        st = rf_symmetry_type.lower()
        if st in ("cyclic","dihedral"):
            if not rf_symmetry_order or int(rf_symmetry_order) < 2:
                raise RuntimeError("For cyclic/dihedral symmetry, provide rf_symmetry_order ≥ 2")
            N = int(rf_symmetry_order)
            symid = f"{'c' if st=='cyclic' else 'd'}{N}"
            symmetry_override = f"inference.symmetry={symid}"
        elif st in ("tetrahedral","octahedral","icosahedral"):
            symmetry_override = f"inference.symmetry={st}"
        else:
            raise RuntimeError(f"Unsupported symmetry type: {rf_symmetry_type}")

    base_cmd = (
        "docker run --rm --gpus all --shm-size=16g "
        f"-v {shlex.quote(str(RF_MODELS))}:/models "
        f"-v {shlex.quote(str(in_dir))}:/in "
        f"-v {shlex.quote(str(out_dir))}:/out "
        "rosettacommons/rfdiffusion:latest "
    )

    hydra_core = " ".join(filter(None, [
        symmetry_config,
        hydra_contigs,
        input_flag,
        "inference.model_directory_path=/models",
        f"inference.output_prefix=/out/{out_prefix}",
        f"inference.num_designs={int(rf_num_designs)}",
        symmetry_override
    ]))

    extra = []
    if rf_num_steps is not None:
        extra.append(f"diffuser.T={int(rf_num_steps)}")
    if rf_deterministic:
        extra.append("inference.deterministic=true")
    if rf_checkpoint:
        extra.append(f"inference.ckpt={shlex.quote(rf_checkpoint)}")
    if rf_temperature is not None:
        extra.append(f"inference.temperature={float(rf_temperature)}")
    if rf_guidance_scale is not None:
        extra.append(f"potentials.guide_scale={float(rf_guidance_scale)}")
    if rf_recycle is not None:
        extra.append(f"inference.recycle={int(rf_recycle)}")
    if rf_seed is not None:
        extra.append(f"inference.seed={int(rf_seed)}")
    if rf_extra_overrides:
        for line in rf_extra_overrides.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                extra.append(line)

    return base_cmd + hydra_core + (" " + " ".join(extra) if extra else "")
