from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────────
    app_name: str = "Legal AI Engine"
    app_env: str = Field(default="development", alias="APP_ENV")
    secret_key: str = Field(default="dev-secret-key", alias="SECRET_KEY")
    allowed_origins: list[str] = Field(
        default=[
            "https://legalai.hayatech.dev",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        alias="ALLOWED_ORIGINS",
    )

    # ── NVIDIA NIM — three-tier model strategy ────────────────────────────────
    #
    # analysis_model  : heavy structured-JSON extraction (analysis, summary)
    #                   → mistralai/mistral-large-2-instruct (123 B)
    #                   Mistral Large 2 consistently outperforms Llama-3.1-70B
    #                   on structured JSON output, legal-benchmark accuracy,
    #                   and instruction adherence — all on the same NVIDIA NIM
    #                   endpoint with the same API key.
    #
    # chat_model      : conversational RAG (streaming answers, Q&A)
    #                   → meta/llama-3.1-nemotron-70b-instruct
    #                   NVIDIA-fine-tuned Llama with reinforcement learning from
    #                   human feedback, ~8 pp better on MT-Bench and instruction
    #                   tasks versus the base Llama-3.1-70B.
    #
    # fast_model      : sub-query expansion only (speed > quality)
    #                   → meta/llama-3.1-8b-instruct (8 B, very low latency)
    #
    nvidia_api_key: str = Field(default="", alias="NVIDIA_API_KEY")
    nvidia_base_url: str = Field(
        default="https://integrate.api.nvidia.com/v1",
        alias="NVIDIA_BASE_URL",
    )
    nvidia_analysis_model: str = Field(
        default="mistralai/mistral-large-2-instruct",
        alias="NVIDIA_ANALYSIS_MODEL",
    )
    nvidia_chat_model: str = Field(
        default="meta/llama-3.1-nemotron-70b-instruct",
        alias="NVIDIA_CHAT_MODEL",
    )
    nvidia_fast_model: str = Field(
        default="meta/llama-3.1-8b-instruct",
        alias="NVIDIA_FAST_MODEL",
    )

    # Legacy alias kept so existing .env files that set NVIDIA_MODEL still work.
    # The analysis model takes precedence; this acts as a fallback.
    nvidia_model: str = Field(
        default="mistralai/mistral-large-2-instruct",
        alias="NVIDIA_MODEL",
    )

    # ── Groq (optional) ───────────────────────────────────────────────────────
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_MODEL")

    # ── Supabase (optional) ───────────────────────────────────────────────────
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")

    # ── Storage ───────────────────────────────────────────────────────────────
    upload_dir: Path = Field(default=Path("./uploads"), alias="UPLOAD_DIR")
    chroma_db_path: Path = Field(default=Path("./chroma_db"), alias="CHROMA_DB_PATH")
    max_file_size_mb: int = Field(default=50, alias="MAX_FILE_SIZE_MB")

    # ── Embeddings ────────────────────────────────────────────────────────────
    # sentence-transformers/all-MiniLM-L6-v2 (335 M params, 1024-dim) is far superior to
    # all-MiniLM-L6-v2 for legal retrieval.  It ranks #1 on MTEB for
    # open-weight models and captures dense legal semantics much better.
    #
    # IMPORTANT: changing this after documents are already indexed requires
    # clearing ChromaDB (delete backend/chroma_db/) and re-uploading all PDFs.
    # The system will warn on startup if the stored model name doesn't match.
    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="EMBEDDING_MODEL",
    )
    embedding_batch_size: int = Field(default=32, alias="EMBEDDING_BATCH_SIZE")

    # ── Chunking ──────────────────────────────────────────────────────────────
    # 1500-char chunks give 3–4 paragraphs per chunk on average, preserving
    # clause context better than the old 1000-char default.
    # 300-char overlap ensures that clauses split across chunk boundaries still
    # appear in full in at least one chunk.
    chunk_size: int = Field(default=1500, alias="CHUNK_SIZE")
    chunk_overlap: int = Field(default=300, alias="CHUNK_OVERLAP")

    # ── Retrieval ─────────────────────────────────────────────────────────────
    retrieval_top_k: int = Field(default=12, alias="RETRIEVAL_TOP_K")
    # 0.20 threshold (down from 0.25) improves recall on uncommon legal terms
    # like "force majeure" or "indemnitor" that score lower on cosine similarity
    # even when contextually relevant.
    retrieval_score_threshold: float = Field(
        default=0.20, alias="RETRIEVAL_SCORE_THRESHOLD"
    )
    # 24 000 chars ≈ 20 avg-sized chunks — well within Mistral Large 2's 128 K
    # context window and leaves comfortable room for the system prompt + output.
    max_context_chars: int = Field(default=24000, alias="MAX_CONTEXT_CHARS")
    multi_query_enabled: bool = Field(default=True, alias="MULTI_QUERY_ENABLED")

    # ── Hybrid retrieval (semantic + BM25 keyword) ────────────────────────────
    # BM25 excels on exact legal terms ("indemnification", "force majeure",
    # "governing law") that score poorly on cosine similarity despite being
    # highly relevant. Combining the two consistently outperforms either alone.
    hybrid_search_enabled: bool = Field(default=True, alias="HYBRID_SEARCH_ENABLED")
    # Weights must sum to 1.0
    bm25_weight: float = Field(default=0.30, alias="BM25_WEIGHT")
    semantic_weight: float = Field(default=0.70, alias="SEMANTIC_WEIGHT")

    model_config = {"env_file": ".env", "populate_by_name": True}

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def effective_analysis_model(self) -> str:
        """Returns analysis model; falls back to legacy nvidia_model if unset."""
        return self.nvidia_analysis_model or self.nvidia_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
