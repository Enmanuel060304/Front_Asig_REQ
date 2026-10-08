import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import planificador, procesos
from .config import settings
from .routers import auth, control, demo

logging.basicConfig(level=logging.INFO)
mimetypes.add_type("application/manifest+json", ".webmanifest")

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        procesos.recuperar_al_iniciar()
    except Exception:
        log.exception("No se pudieron recuperar los procesos interrumpidos")
    planificador.iniciar()
    yield
    planificador.detener()


app = FastAPI(title="Asignación REQ", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

app.include_router(auth.router)
app.include_router(control.router)
if settings.DEMO_MODE:
    app.include_router(demo.router)  # solo existe en la demo: en producción responde 404

# En producción FastAPI sirve el build del frontend (mismo origen → cookies sin CORS)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = (DIST / path).resolve()
        if path and file.is_file() and DIST in file.parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
