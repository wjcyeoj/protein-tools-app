from pathlib import Path

AF_DB = Path("/data/af_download_data")
AF_IMAGE = "alphafold:cuda12jax"

BASE_INPUT  = Path("/data/appjobs/inputs")
BASE_OUTPUT = Path("/data/appjobs/outputs")
BASE_LOGS   = Path("/data/appjobs/logs")

MPNN_ROOT    = Path("/data/tools/proteinmpnn_official")
MPNN_PY      = MPNN_ROOT / ".venv" / "bin" / "python"
MPNN_SCRIPT  = MPNN_ROOT / "protein_mpnn_run.py"
MPNN_WEIGHTS = MPNN_ROOT / "vanilla_model_weights"

for d in (BASE_INPUT, BASE_OUTPUT, BASE_LOGS):
    d.mkdir(parents=True, exist_ok=True)
