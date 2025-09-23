from fastapi import APIRouter
import time

router = APIRouter()

@router.get("/health")
def health():
    return {"ok": True, "time": time.time()}
