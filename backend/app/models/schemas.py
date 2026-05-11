from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


# ── Document schemas ────────────────────────────────────────────────────────────

class DocumentBase(BaseModel):
    name: str
    file_size: int
    page_count: int = 0


class DocumentResponse(DocumentBase):
    id: str
    user_id: str
    status: DocumentStatus
    created_at: datetime
    chunk_count: int = 0

    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    document_id: str
    message: str
    status: DocumentStatus


# ── Chat schemas ────────────────────────────────────────────────────────────────

class Citation(BaseModel):
    document_id: str
    document_name: str
    page: int
    chunk_text: str
    relevance_score: float


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    citations: list[Citation] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    document_ids: list[str] = Field(default=[], description="Filter to specific docs")
    conversation_history: list[dict[str, str]] = Field(default=[])


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    conversation_id: str | None = None


# ── Search schemas ──────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    document_ids: list[str] = Field(default=[])
    top_k: int = Field(default=10, ge=1, le=50)


class SearchResult(BaseModel):
    chunk_text: str
    document_id: str
    document_name: str
    page: int
    relevance_score: float
    metadata: dict[str, Any] = {}


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total: int


# ── Summary schemas ─────────────────────────────────────────────────────────────

class SummaryRequest(BaseModel):
    document_id: str
    focus: str | None = Field(default=None, description="Optional focus area")


class SummaryResponse(BaseModel):
    document_id: str
    document_name: str
    summary: str
    key_points: list[str]
    document_type: str


# ── Generic ─────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
