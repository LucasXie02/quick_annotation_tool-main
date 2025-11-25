from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
FRONTEND_DIST.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Quick Annotation Tool", version="0.1.0")

# Allow browser clients served from the same host/port and during local dev (Vite dev server).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"]
    ,
    allow_headers=["*"],
)

# Health check endpoint.
@app.get("/api/health", response_model=Dict[str, Any])
async def health_check() -> Dict[str, Any]:
    """Basic health probe so containers/orchestrators can verify readiness."""
    return {"status": "ok"}


@app.post("/api/annotations/echo")
async def echo_annotation(payload: Dict[str, Any]) -> JSONResponse:
    """Placeholder endpoint; echoes payload to demonstrate JSON round-trip."""
    if "shapes" not in payload:
        raise HTTPException(status_code=422, detail="Expected Labelme-style annotation JSON")
    return JSONResponse(content=payload)


# Serve the built frontend bundle if it exists; this keeps the MVP deployable from a single container.
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
