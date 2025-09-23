# backend/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, jobs

def create_app() -> FastAPI:
    app = FastAPI(title="Protein Tools API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:8080", "http://127.0.0.1:8080",
            "http://localhost:3000", "http://127.0.0.1:3000"
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # mount routers
    app.include_router(health.router, tags=["health"])
    app.include_router(jobs.router, tags=["jobs"])

    return app

app = create_app()
