from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Protein Tools API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], allow_credentials=True
)

from af_routes import router as af_router
from mpnn_routes import router as mpnn_router
app.include_router(af_router, prefix="")
app.include_router(mpnn_router, prefix="/mpnn")

@app.get("/health")
def health():
    return {"ok": True}
