"""
Legal AI Engine — standalone development server.

Stack
-----
  Analysis LLM : NVIDIA NIM — mistralai/mistral-large-2-instruct (123 B)
  Chat LLM     : NVIDIA NIM — meta/llama-3.1-nemotron-70b-instruct (RLHF-tuned)
  Fast LLM     : NVIDIA NIM — meta/llama-3.1-8b-instruct (query expansion)
  Embeddings   : BAAI/bge-large-en-v1.5 (local, free, 1024-dim)
  Vector DB    : ChromaDB + BM25 hybrid retrieval (local, free)
  PDF          : PyMuPDF (local, free)
  Persistence  : documents.json + backend/uploads/  (no Supabase required)
  Auth         : none — single-user dev mode

Run from the backend/ directory:
    py -3.11 -m uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

# Load backend/.env BEFORE importing app modules so pydantic-settings sees all
# env vars (NVIDIA_API_KEY, model names, etc.) on first access.
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.services.pdf_processor import chunk_document, extract_pdf_content
from app.services.rag_pipeline import (
    ANALYSIS_SCHEMA_VERSION,
    analyze_document_full,
    generate_document_summary,
    run_rag_query,
    stream_rag_query,
)
from app.services.vector_store import (
    add_document_chunks,
    delete_document_vectors,
    prewarm,
    similarity_search,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

_settings = get_settings()

# ── Paths & constants ──────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
DOCS_FILE  = BASE_DIR / "documents.json"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = _settings.max_file_size_bytes
ALLOWED_MIME        = {"application/pdf"}

LOCAL_USER_ID = "local-user"


# ── Document persistence ───────────────────────────────────────────────────────────

def _load_docs() -> dict[str, dict]:
    if not DOCS_FILE.exists():
        return {}
    try:
        docs: dict[str, dict] = json.loads(DOCS_FILE.read_text(encoding="utf-8"))
        for doc in docs.values():
            if doc.get("status") == "processing":
                doc["status"] = "error"
        return docs
    except Exception:
        return {}


def _save_docs() -> None:
    DOCS_FILE.write_text(
        json.dumps(documents_db, indent=2, default=str),
        encoding="utf-8",
    )


documents_db: dict[str, dict] = _load_docs()

# Invalidate cached analyses whose schema version no longer matches.
# This runs once at startup so stale analyses are never served to the frontend.
_stale = [
    doc_id
    for doc_id, doc in documents_db.items()
    if doc.get("analysis")
    and doc["analysis"].get("_schema_version") != ANALYSIS_SCHEMA_VERSION
]
if _stale:
    for doc_id in _stale:
        documents_db[doc_id].pop("analysis", None)
    _save_docs()
    logger.info(
        f"Invalidated {len(_stale)} stale analysis cache(s) "
        f"(schema version → {ANALYSIS_SCHEMA_VERSION})"
    )


# ── App ────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Legal AI Engine",
    description=(
        "Production-grade legal RAG API — "
        "Mistral Large 2 analysis · Nemotron 70B chat · "
        "BGE-Large embeddings · ChromaDB + BM25 hybrid retrieval"
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = _settings.allowed_origins,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, prewarm)

    if _settings.nvidia_api_key:
        logger.info(
            f"NVIDIA NIM ready — "
            f"analysis={_settings.effective_analysis_model} | "
            f"chat={_settings.nvidia_chat_model} | "
            f"fast={_settings.nvidia_fast_model}"
        )
    else:
        logger.warning(
            "NVIDIA_API_KEY is not set. "
            "PDF upload and search work, but AI features require a key. "
            "Add NVIDIA_API_KEY=<key> to backend/.env and restart."
        )
    logger.info("Legal AI Engine v2.0 ready")


# ── Health ─────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Legal AI Engine Running", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {
        "status":           "healthy",
        "ai_ready":         bool(_settings.nvidia_api_key),
        "analysis_model":   _settings.effective_analysis_model,
        "chat_model":       _settings.nvidia_chat_model,
        "embedding_model":  _settings.embedding_model,
        "hybrid_search":    _settings.hybrid_search_enabled,
        "documents":        len(documents_db),
        "schema_version":   ANALYSIS_SCHEMA_VERSION,
    }


# ── Documents ──────────────────────────────────────────────────────────────────────

@app.post("/api/v1/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...)):
    """
    Accept a PDF → persist → background: extract → chunk → embed → store in ChromaDB.
    Returns immediately with document_id; poll /documents/{id} for status.
    """
    is_pdf_by_ext = (file.filename or "").lower().endswith(".pdf")
    if file.content_type not in ALLOWED_MIME and not (
        file.content_type == "application/octet-stream" and is_pdf_by_ext
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted.",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {_settings.max_file_size_mb} MB limit.",
        )

    doc_id    = str(uuid.uuid4())
    safe_name = f"{doc_id}_{file.filename}"
    file_path = UPLOAD_DIR / safe_name
    file_path.write_bytes(content)

    logger.info(f"Saved '{file.filename}' ({len(content):,} bytes) → {file_path.name}")

    doc: dict = {
        "id":          doc_id,
        "user_id":     LOCAL_USER_ID,
        "name":        file.filename,
        "file_size":   len(content),
        "page_count":  0,
        "chunk_count": 0,
        "status":      "processing",
        "created_at":  datetime.now(timezone.utc).isoformat(),
        "file_path":   str(file_path),
    }
    documents_db[doc_id] = doc
    _save_docs()

    asyncio.create_task(_process_document(doc_id, file_path, file.filename))

    return {
        "document_id": doc_id,
        "message":     "Document uploaded — processing started in background.",
        "status":      "processing",
    }


async def _process_document(doc_id: str, file_path: Path, filename: str) -> None:
    """Background task: extract → chunk → embed → store in ChromaDB."""
    loop = asyncio.get_running_loop()
    try:
        processed = await loop.run_in_executor(None, extract_pdf_content, file_path)

        chunks = await loop.run_in_executor(
            None,
            partial(
                chunk_document,
                processed,
                chunk_size    = _settings.chunk_size,
                chunk_overlap = _settings.chunk_overlap,
            ),
        )

        if not chunks:
            raise ValueError("No extractable text found in this PDF.")

        chunk_count = await add_document_chunks(
            document_id   = doc_id,
            user_id       = LOCAL_USER_ID,
            chunks        = chunks,
            document_name = filename,
        )

        documents_db[doc_id].update({
            "status":      "ready",
            "page_count":  processed.total_pages,
            "chunk_count": chunk_count,
        })
        _save_docs()
        logger.info(
            f"Processed '{filename}': "
            f"{processed.total_pages} pages, {chunk_count} chunks — status=ready"
        )

    except Exception as exc:
        logger.error(f"Failed to process '{filename}': {exc}", exc_info=True)
        if doc_id in documents_db:
            documents_db[doc_id]["status"] = "error"
            _save_docs()


@app.get("/api/v1/documents/")
async def list_documents():
    return list(documents_db.values())


@app.get("/api/v1/documents/{document_id}")
async def get_document(document_id: str):
    doc = documents_db.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@app.post("/api/v1/upload/", status_code=status.HTTP_201_CREATED)
async def upload_document_alias(file: UploadFile = File(...)):
    """Alias for /api/v1/documents/upload — kept for REST-path compatibility."""
    return await upload_document(file)


@app.post("/api/v1/documents/{document_id}/analyze")
async def analyze_document(document_id: str):
    """
    Full legal analysis: document type, parties, governing law, summary,
    key points, clauses with verbatim quotes + confidence, risks, obligations,
    key dates, and penalties.

    Cached per-document (schema-version-aware).  Delete the cached analysis by
    calling DELETE /api/v1/documents/{id}/analysis to force a refresh.
    """
    _require_nvidia_key()

    doc = documents_db.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.get("status") != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Document is still '{doc.get('status')}'. Wait for processing.",
        )

    # Return cache only if schema version matches
    cached = doc.get("analysis")
    if cached and cached.get("_schema_version") == ANALYSIS_SCHEMA_VERSION:
        logger.info(f"Returning cached analysis for '{doc['name']}'")
        return cached

    result = await analyze_document_full(
        document_id   = document_id,
        document_name = doc["name"],
        user_id       = LOCAL_USER_ID,
    )

    documents_db[document_id]["analysis"] = result
    _save_docs()
    return result


@app.delete("/api/v1/documents/{document_id}/analysis", status_code=status.HTTP_204_NO_CONTENT)
async def invalidate_analysis_cache(document_id: str):
    """Force re-analysis on next call by clearing the cached result."""
    doc = documents_db.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    doc.pop("analysis", None)
    _save_docs()


@app.delete("/api/v1/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str):
    doc = documents_db.pop(document_id, None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    delete_document_vectors(document_id)

    fp = Path(doc["file_path"])
    if fp.exists():
        fp.unlink()

    _save_docs()
    logger.info(f"Deleted document {document_id} ('{doc['name']}')")


# ── Dashboard ──────────────────────────────────────────────────────────────────────

@app.get("/api/v1/dashboard/")
async def get_dashboard():
    docs  = list(documents_db.values())
    ready = [d for d in docs if d.get("status") == "ready"]
    return {
        "documents":        len(docs),
        "pages_indexed":    sum(d.get("page_count", 0)  for d in ready),
        "knowledge_chunks": sum(d.get("chunk_count", 0) for d in ready),
    }


# ── Chat ───────────────────────────────────────────────────────────────────────────

def _require_nvidia_key() -> None:
    if not _settings.nvidia_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI features require NVIDIA_API_KEY. "
                "Add NVIDIA_API_KEY=<key> to backend/.env and restart. "
                "Get a free key at https://build.nvidia.com"
            ),
        )


@app.post("/api/v1/chat/")
async def chat(request: Request):
    """Non-streaming RAG chat using Nemotron 70B."""
    _require_nvidia_key()

    body     = await request.json()
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="'question' must not be empty.")

    result = await run_rag_query(
        question             = question,
        user_id              = LOCAL_USER_ID,
        document_ids         = body.get("document_ids") or None,
        conversation_history = body.get("conversation_history") or [],
    )
    return result.model_dump()


@app.post("/api/v1/chat/stream")
async def chat_stream(request: Request):
    """
    Streaming RAG chat via Server-Sent Events (Nemotron 70B).
    Conversation ID is returned in the X-Conversation-Id response header.
    """
    _require_nvidia_key()

    body     = await request.json()
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="'question' must not be empty.")

    conversation_id = str(uuid.uuid4())

    async def _generate():
        async for line in stream_rag_query(
            question             = question,
            user_id              = LOCAL_USER_ID,
            document_ids         = body.get("document_ids") or None,
            conversation_history = body.get("conversation_history") or [],
        ):
            yield f"data: {line}\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "X-Conversation-Id": conversation_id,
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/chat/summarize")
async def summarize(request: Request):
    """Lightweight document summary using Mistral Large 2."""
    _require_nvidia_key()

    body   = await request.json()
    doc_id = (body.get("document_id") or "").strip()
    if not doc_id:
        raise HTTPException(status_code=422, detail="'document_id' must not be empty.")

    doc = documents_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.get("status") != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Document is still '{doc.get('status')}'. Wait for processing.",
        )

    return await generate_document_summary(
        document_id   = doc_id,
        document_name = doc["name"],
        user_id       = LOCAL_USER_ID,
    )


@app.get("/api/v1/chat/history/{conversation_id}")
async def get_chat_history(conversation_id: str):  # noqa: ARG001
    # History maintained client-side in this build
    return []


# ── Search ─────────────────────────────────────────────────────────────────────────

async def _run_search(
    query: str,
    document_ids: list[str] | None,
    top_k: int,
) -> dict:
    """Hybrid semantic + BM25 search shared by POST and GET endpoints."""
    chunks = await similarity_search(
        query        = query,
        user_id      = LOCAL_USER_ID,
        document_ids = document_ids,
        top_k        = top_k,
    )
    return {
        "results": [
            {
                "chunk_text":     c["chunk_text"],
                "document_id":    c["document_id"],
                "document_name":  c["document_name"],
                "page":           c["page"],
                "relevance_score": c["relevance_score"],
                "section_title":  c.get("section_title", ""),
                "section_type":   c.get("section_type", ""),
                "clause_numbers": c.get("clause_numbers", ""),
                "metadata":       c.get("metadata", {}),
            }
            for c in chunks
        ],
        "query": query,
        "total": len(chunks),
    }


@app.post("/api/v1/search/")
async def search_post(request: Request):
    body  = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="'query' must not be empty.")
    return await _run_search(
        query,
        body.get("document_ids") or None,
        int(body.get("top_k", 10)),
    )


@app.get("/api/v1/search/")
async def search_get(q: str = "", top_k: int = 10):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="'q' must not be empty.")
    return await _run_search(query, None, top_k)
