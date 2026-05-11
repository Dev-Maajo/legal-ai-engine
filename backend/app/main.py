import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.core.config import get_settings
from app.api.routes import chat, search, upload
from app.models.schemas import HealthResponse

_settings = get_settings()

# ── Logging ───────────────────────────────────────────────────────────────────────
Path("logs").mkdir(exist_ok=True)
logger.remove()
logger.add(
    sys.stderr,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{line}</cyan> — <level>{message}</level>"
    ),
    level="INFO",
)
logger.add("logs/app.log", rotation="10 MB", retention="14 days", level="DEBUG")

# ── App ───────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Legal AI Engine API",
    description="AI-powered legal research platform — RAG pipeline with Groq Llama 3",
    version="1.0.0",
    docs_url="/docs" if _settings.app_env == "development" else None,
    redoc_url="/redoc" if _settings.app_env == "development" else None,
)

# ── Middleware ────────────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────────
app.include_router(upload.router, prefix="/api/v1")
app.include_router(chat.router,   prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")


# ── Lifecycle ─────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    _settings.upload_dir.mkdir(parents=True, exist_ok=True)
    _settings.chroma_db_path.mkdir(parents=True, exist_ok=True)

    # Pre-warm the embedding model and ChromaDB client in a thread so the first
    # user request doesn't pay the cold-start cost (~2–4 s on CPU).
    import asyncio
    from app.services.vector_store import prewarm
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, prewarm)

    logger.info(f"Legal AI Engine ready — env={_settings.app_env}")


# ── Global error handler ──────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def _global_exc_handler(request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
    )


# ── Health ────────────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")
