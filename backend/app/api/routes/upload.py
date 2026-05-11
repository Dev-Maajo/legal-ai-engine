import uuid
import asyncio
from functools import partial
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from loguru import logger

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.supabase_client import (
    create_document_record,
    delete_document_record,
    get_document_by_id,
    get_documents_for_user,
    update_document_status,
)
from app.models.schemas import DocumentResponse, DocumentUploadResponse
from app.services.pdf_processor import chunk_document, extract_pdf_content
from app.services.vector_store import add_document_chunks, delete_document_vectors

router = APIRouter(prefix="/documents", tags=["Documents"])
_settings = get_settings()

ALLOWED_MIME = {"application/pdf"}


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted",
        )

    content = await file.read()
    if len(content) > _settings.max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {_settings.max_file_size_mb} MB limit",
        )

    # Persist file to disk
    _settings.upload_dir.mkdir(parents=True, exist_ok=True)
    doc_id = str(uuid.uuid4())
    safe_name = f"{doc_id}_{file.filename}"
    file_path = _settings.upload_dir / safe_name
    file_path.write_bytes(content)

    # Create DB record immediately so the client has an id to poll
    record = await create_document_record(
        user_id=user["id"],
        name=file.filename,
        file_path=str(file_path),
        file_size=len(content),
    )
    document_id = record["id"]

    # Schedule background processing — does not block the response
    asyncio.create_task(
        _process_document(document_id, file_path, user["id"], file.filename)
    )

    return DocumentUploadResponse(
        document_id=document_id,
        message="Document uploaded — processing started in background",
        status="processing",
    )


async def _process_document(
    document_id: str,
    file_path: Path,
    user_id: str,
    filename: str,
) -> None:
    """
    Background task: extract → chunk → embed → store.

    PDF extraction and chunking are CPU-bound (PyMuPDF + regex).  They run in
    the default thread-pool executor so the FastAPI event loop stays free.
    Embedding already uses run_in_executor internally (see vector_store.py).
    """
    loop = asyncio.get_running_loop()
    try:
        # CPU-bound work — offload to thread pool
        processed = await loop.run_in_executor(
            None, extract_pdf_content, file_path
        )
        chunks = await loop.run_in_executor(
            None,
            partial(
                chunk_document,
                processed,
                chunk_size=_settings.chunk_size,
                chunk_overlap=_settings.chunk_overlap,
            ),
        )

        if not chunks:
            raise ValueError("No text could be extracted from this PDF")

        # Embedding is already async-safe (uses run_in_executor internally)
        chunk_count = await add_document_chunks(
            document_id=document_id,
            user_id=user_id,
            chunks=chunks,
            document_name=filename,
        )

        await update_document_status(
            document_id=document_id,
            status="ready",
            page_count=processed.total_pages,
            chunk_count=chunk_count,
        )
        logger.success(
            f"Processed '{filename}' (id={document_id}): "
            f"{processed.total_pages} pages, {chunk_count} chunks"
        )

    except Exception as exc:
        logger.error(f"Failed to process '{filename}' (id={document_id}): {exc}", exc_info=True)
        await update_document_status(document_id=document_id, status="error")


@router.get("/", response_model=list[DocumentResponse])
async def list_documents(user: dict = Depends(get_current_user)):
    return await get_documents_for_user(user["id"])


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, user: dict = Depends(get_current_user)):
    doc = await get_document_by_id(document_id, user["id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, user: dict = Depends(get_current_user)):
    doc = await get_document_by_id(document_id, user["id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Vectors and file can be removed synchronously (fast ops)
    delete_document_vectors(document_id)

    fp = Path(doc["file_path"])
    if fp.exists():
        fp.unlink()

    await delete_document_record(document_id, user["id"])
