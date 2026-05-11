"""
ChromaDB vector store with hybrid BM25 + semantic retrieval.

Architecture
------------
Retrieval is two-stage:

  Stage 1 — Semantic (ChromaDB cosine similarity)
    Embed the query with sentence-transformers, retrieve top_k * OVERSAMPLE
    candidates from ChromaDB.  The oversampling factor ensures the BM25
    re-ranker has enough candidates to choose from after score pruning.

  Stage 2 — BM25 re-rank (rank-bm25)
    Score each candidate against the raw query tokens using BM25Okapi.
    Combine: hybrid_score = semantic_weight * cosine + bm25_weight * bm25_norm.
    Re-sort and truncate to top_k.

Why hybrid?
  Cosine similarity on dense vectors captures semantic meaning but struggles
  with exact legal terms ("indemnification", "force majeure", "governing law")
  that appear infrequently in the embedding training corpus.  BM25 excels at
  exact-term matching and compensates for this gap.  The weighted combination
  consistently outperforms either method alone on legal retrieval benchmarks.

Other improvements
------------------
- Diversity pruning: at most _MAX_CHUNKS_PER_PAGE (3) chunks per (doc, page).
- Embedding model is lazy-loaded on first use (not at startup) to keep Railway
  container boot time and memory footprint low.
- Embedding model consistency check warns if the model changed since last index.
- All embedding work runs in a thread-pool executor so the async event loop is
  never blocked by CPU-bound sentence-transformer inference.
"""

import asyncio
import re
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from loguru import logger
from sentence_transformers import SentenceTransformer

from app.core.config import get_settings

_settings = get_settings()

COLLECTION_NAME      = "legal_documents"
_MAX_CHUNKS_PER_PAGE = 3     # raised from 2 — more diversity within a page
_OVERSAMPLE          = 4     # fetch top_k * OVERSAMPLE before BM25 re-rank


# ── Embedding model consistency check ─────────────────────────────────────────────

def _check_embedding_consistency() -> None:
    """
    Warn if the configured embedding model differs from the one used when the
    current ChromaDB index was built.  Mismatched embeddings silently return
    wrong results — this guard surfaces the problem early.
    """
    meta_path = _settings.chroma_db_path / ".embedding_model"
    current   = _settings.embedding_model

    if meta_path.exists():
        stored = meta_path.read_text(encoding="utf-8").strip()
        if stored != current:
            logger.warning(
                f"Embedding model mismatch: index built with '{stored}', "
                f"but config specifies '{current}'. "
                "Delete backend/chroma_db/ and re-upload all PDFs to rebuild the index."
            )
    else:
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(current, encoding="utf-8")


# ── Singletons ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    logger.info(f"Loading embedding model '{_settings.embedding_model}'")
    model = SentenceTransformer(_settings.embedding_model)
    logger.success(
        f"Embedding model ready — dim={model.get_sentence_embedding_dimension()}"
    )
    return model


@lru_cache(maxsize=1)
def _get_chroma() -> chromadb.PersistentClient:
    _settings.chroma_db_path.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=str(_settings.chroma_db_path),
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def _get_collection() -> chromadb.Collection:
    return _get_chroma().get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


# ── Startup pre-warm ──────────────────────────────────────────────────────────────

def prewarm() -> None:
    """Initialise ChromaDB at process start. Embedding model loads lazily on first use."""
    _check_embedding_consistency()
    _get_collection()
    logger.info("Vector store ready (embedding model loads on first use)")


# ── Embedding helpers ─────────────────────────────────────────────────────────────

def _encode_batch(texts: list[str]) -> list[list[float]]:
    """Synchronous encoding — always run inside a thread pool, never on the event loop."""
    model = _get_model()
    vecs  = model.encode(
        texts,
        batch_size         = _settings.embedding_batch_size,
        show_progress_bar  = False,
        normalize_embeddings = True,
        convert_to_numpy   = True,
    )
    return vecs.tolist()


async def embed_texts_async(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts without blocking the event loop.
    Splits into batches of embedding_batch_size.
    """
    loop       = asyncio.get_running_loop()
    batch_size = _settings.embedding_batch_size
    results: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch      = texts[start : start + batch_size]
        batch_vecs = await loop.run_in_executor(None, _encode_batch, batch)
        results.extend(batch_vecs)

    return results


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Synchronous convenience wrapper — only safe from non-async contexts."""
    return _encode_batch(texts)


# ── Ingestion ─────────────────────────────────────────────────────────────────────

async def add_document_chunks(
    document_id: str,
    user_id: str,
    chunks: list[dict],
    document_name: str,
) -> int:
    """Embed and store document chunks in ChromaDB."""
    if not chunks:
        return 0

    collection = _get_collection()
    texts      = [c["text"] for c in chunks]
    embeddings = await embed_texts_async(texts)

    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas: list[dict[str, Any]] = [
        {
            "document_id":    document_id,
            "user_id":        user_id,
            "document_name":  document_name,
            "page":           c["page"],
            "chunk_index":    c["chunk_index"],
            "section_title":  c.get("section_title", ""),
            "section_type":   c.get("section_type", "body"),
            "clause_numbers": ",".join(c.get("clause_numbers", [])),
            "source":         c.get("source", document_name),
        }
        for c in chunks
    ]

    collection.upsert(
        ids        = ids,
        embeddings = embeddings,
        documents  = texts,
        metadatas  = metadatas,
    )

    logger.success(f"Stored {len(chunks)} chunks for '{document_name}' (id={document_id})")
    return len(chunks)


# ── BM25 hybrid re-ranking ────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """
    Lowercase, strip punctuation, preserve hyphenated legal compounds.
    Produces tokens suitable for BM25 matching.
    """
    return re.findall(r"\b[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*\b", text.lower())


def _bm25_rerank(
    query: str,
    hits: list[dict],
    top_k: int,
) -> list[dict]:
    """
    Re-rank ChromaDB hits by combining cosine similarity with BM25 keyword scores.

    Falls back silently to semantic-only ranking if rank-bm25 is unavailable
    or the corpus / query tokenizes to empty (both safe failure modes).
    """
    if len(hits) <= top_k:
        return hits

    if not _settings.hybrid_search_enabled:
        return hits[:top_k]

    try:
        from rank_bm25 import BM25Okapi

        query_tokens  = _tokenize(query)
        corpus_tokens = [_tokenize(h["chunk_text"]) for h in hits]

        if not query_tokens or not any(corpus_tokens):
            return hits[:top_k]

        bm25        = BM25Okapi(corpus_tokens)
        bm25_scores = bm25.get_scores(query_tokens)
        max_bm25    = float(max(bm25_scores)) if float(max(bm25_scores)) > 0 else 1.0

        sem_w  = _settings.semantic_weight
        bm25_w = _settings.bm25_weight

        for i, hit in enumerate(hits):
            norm_bm25 = float(bm25_scores[i]) / max_bm25
            hit["hybrid_score"] = sem_w * hit["relevance_score"] + bm25_w * norm_bm25

        hits.sort(key=lambda h: h["hybrid_score"], reverse=True)

    except Exception as exc:
        logger.debug(f"BM25 re-rank skipped ({exc}), using semantic ranking")

    return hits[:top_k]


# ── Retrieval ─────────────────────────────────────────────────────────────────────

async def similarity_search(
    query: str,
    user_id: str,
    document_ids: list[str] | None = None,
    top_k: int | None = None,
    score_threshold: float | None = None,
) -> list[dict]:
    """
    Hybrid semantic + BM25 similarity search scoped to a user's documents.

    1. Embed query → ChromaDB cosine search (top_k * OVERSAMPLE candidates).
    2. Apply score threshold and diversity pruning.
    3. BM25 re-rank the candidates and truncate to top_k.
    """
    collection = _get_collection()
    n_stored   = collection.count()
    if n_stored == 0:
        return []

    top_k     = top_k     or _settings.retrieval_top_k
    threshold = score_threshold if score_threshold is not None \
                else _settings.retrieval_score_threshold

    query_vec       = await embed_texts_async([query])
    query_embedding = query_vec[0]

    where     = _build_where(user_id, document_ids)
    n_results = min(top_k * _OVERSAMPLE, n_stored)

    raw = collection.query(
        query_embeddings = [query_embedding],
        n_results        = n_results,
        where            = where,
        include          = ["documents", "metadatas", "distances"],
    )

    if not raw["ids"] or not raw["ids"][0]:
        return []

    hits: list[dict] = []
    for i, _ in enumerate(raw["ids"][0]):
        meta  = raw["metadatas"][0][i]
        score = round(1.0 - raw["distances"][0][i], 4)

        if score < threshold:
            continue

        hits.append({
            "chunk_text":     raw["documents"][0][i],
            "document_id":    meta["document_id"],
            "document_name":  meta["document_name"],
            "page":           meta["page"],
            "relevance_score": score,
            "section_title":  meta.get("section_title", ""),
            "section_type":   meta.get("section_type", ""),
            "clause_numbers": meta.get("clause_numbers", ""),
            "metadata":       meta,
        })

    hits.sort(key=lambda h: h["relevance_score"], reverse=True)
    hits = _prune_for_diversity(hits, top_k * _OVERSAMPLE)
    hits = _bm25_rerank(query, hits, top_k)
    return hits


async def multi_query_search(
    queries: list[str],
    user_id: str,
    document_ids: list[str] | None = None,
    top_k: int | None = None,
    score_threshold: float | None = None,
) -> list[dict]:
    """
    Multi-query hybrid search.

    Embeds all queries in one batched call, retrieves candidates for each,
    deduplicates by chunk ID (keeping max score), then BM25 re-ranks the
    merged pool using the first / primary query.
    """
    top_k = top_k or _settings.retrieval_top_k

    all_vecs = await embed_texts_async(queries)

    collection = _get_collection()
    n_stored   = collection.count()
    if n_stored == 0:
        return []

    threshold = score_threshold if score_threshold is not None \
                else _settings.retrieval_score_threshold
    where     = _build_where(user_id, document_ids)
    n_results = min(top_k * _OVERSAMPLE, n_stored)

    best: dict[str, dict] = {}

    for vec in all_vecs:
        raw = collection.query(
            query_embeddings = [vec],
            n_results        = n_results,
            where            = where,
            include          = ["documents", "metadatas", "distances"],
        )
        if not raw["ids"] or not raw["ids"][0]:
            continue

        for i, chunk_id in enumerate(raw["ids"][0]):
            score = round(1.0 - raw["distances"][0][i], 4)
            if score < threshold:
                continue
            if chunk_id not in best or score > best[chunk_id]["relevance_score"]:
                meta = raw["metadatas"][0][i]
                best[chunk_id] = {
                    "chunk_text":     raw["documents"][0][i],
                    "document_id":    meta["document_id"],
                    "document_name":  meta["document_name"],
                    "page":           meta["page"],
                    "relevance_score": score,
                    "section_title":  meta.get("section_title", ""),
                    "section_type":   meta.get("section_type", ""),
                    "clause_numbers": meta.get("clause_numbers", ""),
                    "metadata":       meta,
                }

    hits = sorted(best.values(), key=lambda h: h["relevance_score"], reverse=True)
    hits = _prune_for_diversity(hits, top_k * _OVERSAMPLE)
    # BM25 re-rank against the primary (first) query for coherent relevance signal
    hits = _bm25_rerank(queries[0], hits, top_k)
    return hits


def delete_document_vectors(document_id: str) -> None:
    collection = _get_collection()
    collection.delete(where={"document_id": document_id})
    logger.info(f"Deleted vectors for document {document_id}")


# ── Internal helpers ──────────────────────────────────────────────────────────────

def _build_where(user_id: str, document_ids: list[str] | None) -> dict:
    if not document_ids:
        return {"user_id": user_id}
    if len(document_ids) == 1:
        return {"$and": [{"user_id": user_id}, {"document_id": document_ids[0]}]}
    return {"$and": [{"user_id": user_id}, {"document_id": {"$in": document_ids}}]}


def _prune_for_diversity(hits: list[dict], top_k: int) -> list[dict]:
    """Cap at _MAX_CHUNKS_PER_PAGE per (document_id, page), maintain score order."""
    page_counts: dict[tuple[str, int], int] = {}
    pruned: list[dict] = []

    for hit in hits:
        key   = (hit["document_id"], hit["page"])
        count = page_counts.get(key, 0)
        if count < _MAX_CHUNKS_PER_PAGE:
            pruned.append(hit)
            page_counts[key] = count + 1
        if len(pruned) >= top_k:
            break

    return pruned
