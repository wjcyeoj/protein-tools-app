import os
from pathlib import Path

# === AlphaFold config ===
AF_IMAGE = os.environ.get("AF_IMAGE", "alphafold:cuda12jax")
AF_DB_DIR = Path(os.environ.get("AF_DB_DIR", "/data/datasets/af_download_data")).resolve()
AF_OUTPUT_BASE = Path(os.environ.get("AF_OUTPUT_BASE", "/data/output/alphafold")).resolve()

# === ProteinMPNN config ===
# Official runner path & weights (adjust if you used different locations)
MPNN_PY = Path(os.environ.get(
    "MPNN_PY", "/data/tools/proteinmpnn_official/protein_mpnn_run.py"
)).resolve()
MPNN_WEIGHTS = Path(os.environ.get(
    "MPNN_WEIGHTS_DIR", "/data/tools/proteinmpnn/vanilla_model_weights"
)).resolve()
MPNN_OUT_BASE = Path(os.environ.get(
    "MPNN_OUT_BASE", "/data/output/proteinmpnn"
)).resolve()
MPNN_PYTHON = os.environ.get(
    "MPNN_PYTHON", "python3"
)

# === Jobs scratch ===
JOBS_DIR = Path(os.environ.get("JOBS_DIR", "/data/app/jobs")).resolve()
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# Common
SHM_SIZE = os.environ.get("SHM_SIZE", "16g")  # docker --shm-size
