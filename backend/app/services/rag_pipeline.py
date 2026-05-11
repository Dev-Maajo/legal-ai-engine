"""
RAG pipeline — three-tier model strategy.

Model tiers (all on NVIDIA NIM, same API key)
----------------------------------------------
analysis_llm  meta/llama-3.1-70b-instruct (123 B)
  • Used for: full document analysis, structured JSON extraction, summarization
  • Why Mistral Large 2:
    - 123 B parameters vs 70 B for Llama-3.1 — significantly more reasoning capacity
    - Mistral's training emphasises instruction adherence and structured output;
      JSON schema compliance is materially more reliable than Llama on complex schemas
    - Scores ~82 % on LSAT (Llama-3.1-70B: ~73 %), competitive on Bar Exam tasks
    - Available on NVIDIA NIM with the same API key — zero infrastructure change

chat_llm      meta/llama-3.1-8b-instruct (70 B, NVIDIA RLHF-tuned)
  • Used for: streaming conversational RAG, Q&A
  • Why Nemotron: NVIDIA fine-tuned with reinforcement learning from human feedback,
    ~8 pp better than base Llama-3.1-70B on MT-Bench and instruction-following tasks;
    low latency matters most for live streaming

fast_llm      meta/llama-3.1-8b-instruct (8 B)
  • Used for: sub-query expansion only (2 alternative phrasings per query)
  • Latency >> quality for this task; 8 B is fast enough and free on NIM
"""

from __future__ import annotations

import json
import re
import time
from typing import AsyncGenerator

from langchain.schema import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.models.schemas import ChatResponse, Citation
from app.services.vector_store import multi_query_search, similarity_search

_settings = get_settings()

# Schema version — bump whenever the analysis output shape changes so stale
# cached analyses in documents.json are automatically invalidated on startup.
ANALYSIS_SCHEMA_VERSION = "3.1"


# ── LLM singletons (lazy) ─────────────────────────────────────────────────────────

_analysis_llm: ChatOpenAI | None = None   # Mistral Large 2 — heavy JSON extraction
_chat_llm:     ChatOpenAI | None = None   # Nemotron 70B    — streaming conversation
_fast_llm:     ChatOpenAI | None = None   # Llama 8B        — query expansion


def _get_analysis_llm() -> ChatOpenAI:
    """Mistral Large 2 — 123 B, low temperature for deterministic structured JSON."""
    global _analysis_llm
    if _analysis_llm is None:
        _analysis_llm = ChatOpenAI(
            api_key    = _settings.nvidia_api_key or "no-key-configured",
            base_url   = _settings.nvidia_base_url,
            model      = _settings.effective_analysis_model,
            temperature= 0.05,    # near-zero → highly deterministic JSON
            max_tokens = 6000,    # analysis JSON is typically 2–4 K tokens
        )
    return _analysis_llm


def _get_chat_llm() -> ChatOpenAI:
    """Nemotron 70B — RLHF-tuned for instruction following and conversational quality."""
    global _chat_llm
    if _chat_llm is None:
        _chat_llm = ChatOpenAI(
            api_key    = _settings.nvidia_api_key or "no-key-configured",
            base_url   = _settings.nvidia_base_url,
            model      = _settings.nvidia_chat_model,
            temperature= 0.15,   # slightly warmer for natural conversational tone
            max_tokens = 4096,
        )
    return _chat_llm


def _get_fast_llm() -> ChatOpenAI:
    """Llama 3.1 8B — fast query expansion; latency >> quality for this task."""
    global _fast_llm
    if _fast_llm is None:
        _fast_llm = ChatOpenAI(
            api_key    = _settings.nvidia_api_key or "no-key-configured",
            base_url   = _settings.nvidia_base_url,
            model      = _settings.nvidia_fast_model,
            temperature= 0.0,
            max_tokens = 256,
        )
    return _fast_llm


# ── Coverage queries ──────────────────────────────────────────────────────────────
# Ten semantically distinct queries ensure broad coverage — each retrieves the
# chunks most similar to a different legal topic so the merged pool samples the
# whole document rather than over-indexing on the intro.

_COVERAGE_QUERIES = [
    "parties names entities agreement purpose scope effective date",
    "obligations duties responsibilities covenants performance requirements",
    "payment fees compensation consideration amount price schedule milestones",
    "termination expiry cancellation notice period renewal extension options",
    "confidentiality non-disclosure trade secrets proprietary information restrictions",
    "indemnification liability limitation cap damages insurance hold harmless",
    "intellectual property ownership assignment license copyright patent",
    "governing law jurisdiction venue arbitration dispute resolution",
    "representations warranties conditions precedent guarantees covenants",
    "penalties default breach remedies liquidated damages consequences enforcement",
]


# ── Prompts ───────────────────────────────────────────────────────────────────────

_LEGAL_SYSTEM = """\
You are a senior AI legal research assistant with expertise in contract law, \
employment law, real estate, IP, and commercial agreements.

Answer questions using ONLY the provided document excerpts. Follow these rules:

1. Cite every factual claim: [Doc: <filename>, Page <n>].
2. When quoting, use > blockquote format.
3. Use precise legal terminology; flag any ambiguity or vagueness explicitly.
4. If context is insufficient, say so clearly — never fabricate law or facts.
5. Structure complex answers with ## headings and bullet points.
6. End with a one-sentence disclaimer when the answer touches on specific legal advice.\
"""

_EXPAND_QUERIES_SYSTEM = """\
You are a legal search query optimizer. Given a user question, generate 2 alternative \
search queries that would retrieve the same information using different legal terminology \
or phrasing. Respond with a JSON array of exactly 2 strings, nothing else.\
"""

_FULL_ANALYSIS_SYSTEM = """\
You are a senior legal analyst AI with 20+ years of experience reviewing contracts, \
NDAs, leases, employment agreements, and commercial documents.

Analyze the provided legal document excerpts and output a comprehensive structured \
analysis. Adapt the depth and focus to the document type you identify.

CRITICAL OUTPUT RULES:
- Respond ONLY with a single valid JSON object.
- No markdown code fences, no prose, no text before or after the JSON.
- All strings must use double-quoted JSON encoding.
- confidence values are decimals between 0.0 (uncertain) and 1.0 (certain).
- verbatim values must be character-for-character quotes from the provided context.

JSON schema (all top-level keys are required):
{
  "document_type": "Precise classification (e.g. Non-Disclosure Agreement, Employment Agreement, Commercial Lease, Service Agreement, Loan Agreement, Settlement Agreement)",
  "parties": ["Party Name (Role)", "Party Name (Role)"],
  "governing_law": "State or Country or null",
  "effective_date": "Date string or null",
  "summary": "Executive summary in 4-5 paragraphs: (1) purpose and parties, (2) key rights and obligations of each party, (3) financial and payment terms, (4) term, termination, and renewal, (5) most critical risks or missing provisions",
  "key_points": [
    "8-10 specific, document-grounded key legal points — each must name a party, clause, or page"
  ],
  "clauses": [
    {
      "type": "Clause category",
      "description": "2-3 sentences: what this clause means and its practical implications for both parties",
      "verbatim": "Exact quote from the document demonstrating this clause (max 250 chars)",
      "page": 1,
      "risk_level": "low | medium | high",
      "confidence": 0.0
    }
  ],
  "risks": [
    {
      "title": "Short descriptive risk title",
      "severity": "low | medium | high | critical",
      "description": "2-3 sentences: what is risky, why it matters, which scenarios trigger it",
      "recommendation": "Specific, actionable mitigation or renegotiation strategy",
      "affected_party": "Which party bears this risk",
      "confidence": 0.0
    }
  ],
  "obligations": [
    {
      "party": "Party responsible",
      "obligation": "Clear, specific description of what must be done",
      "deadline": "Date, duration, or triggering event ('ongoing' if continuous)",
      "consequence": "What happens if not fulfilled",
      "page": 1,
      "confidence": 0.0
    }
  ],
  "key_dates": [
    {
      "label": "Date type (e.g. Effective Date, Expiry Date, Renewal Notice Deadline, Payment Due)",
      "date_value": "Exact date or duration",
      "significance": "One sentence on why this date is legally important",
      "page": 1
    }
  ],
  "penalties": [
    {
      "trigger": "Condition or event that triggers the penalty",
      "amount_or_remedy": "Dollar amount, percentage, or description of remedy",
      "party_liable": "Party who pays or suffers the consequence",
      "page": 1,
      "confidence": 0.0
    }
  ]
}

Document-type focus guidelines:
- NDA: confidentiality scope, permitted disclosures, duration, residuals clause, non-solicitation
- Employment: compensation, equity, IP assignment, non-compete/non-solicit, at-will vs. for-cause
- Lease: rent and escalation, security deposit, permitted use, maintenance, early termination fees
- Service Agreement: scope of work, payment milestones, acceptance criteria, IP ownership, liability cap
- Loan Agreement: interest rate, financial covenants, events of default, collateral, acceleration

Quantity minimums:
- clauses: 5-8 (cover meaningfully different legal topics)
- risks: 3-6 (ordered by descending severity)
- obligations: 2-8 (every explicit duty in the document)
- key_dates: 1-6 (every date or duration mentioned)
- penalties: 0-5 (only if explicitly stated; omit array entries that are inferred)

Output ONLY the JSON object.\
"""

_SUMMARY_SYSTEM = """\
You are a legal document analyst. Given excerpts from a legal document, produce:
1. An executive summary (2-3 paragraphs).
2. Exactly 5-7 key legal points as a JSON array under "key_points".
3. Document type classification under "document_type".

Respond in valid JSON only:
{"summary": "...", "key_points": [...], "document_type": "..."}\
"""


# ── Multi-query expansion ─────────────────────────────────────────────────────────

async def _expand_query(question: str) -> list[str]:
    """Return 2 alternative phrasings; falls back to [] on any error."""
    try:
        resp = await _get_fast_llm().ainvoke([
            SystemMessage(content=_EXPAND_QUERIES_SYSTEM),
            HumanMessage(content=question),
        ])
        raw   = resp.content.strip()
        match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if match:
            alts = json.loads(match.group())
            if isinstance(alts, list):
                return [str(q) for q in alts[:2]]
    except Exception as exc:
        logger.warning(f"Query expansion failed ({exc}); using original query only")
    return []


# ── Context packing ───────────────────────────────────────────────────────────────

def _pack_context(chunks: list[dict], max_chars: int) -> tuple[list[dict], str]:
    """Greedily pack chunks into a context string up to max_chars."""
    parts: list[str] = []
    used:  list[dict] = []
    total = 0

    for chunk in chunks:
        segment = (
            f"--- [{chunk['document_name']}, Page {chunk['page']}] ---\n"
            f"{chunk['chunk_text']}"
        )
        cost = len(segment) + 2
        if total + cost > max_chars and used:
            break
        parts.append(segment)
        used.append(chunk)
        total += cost

    return used, "\n\n".join(parts)


# ── Conversation history ──────────────────────────────────────────────────────────

def _format_history(history: list[dict[str, str]]) -> list:
    messages = []
    for msg in history[-8:]:
        role    = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content[:1200]))
    return messages


# ── Citation grounding ────────────────────────────────────────────────────────────

def _ground_citations(
    answer: str,
    chunks: list[dict],
    max_citations: int = 6,
) -> list[Citation]:
    """
    Return citations the answer actually references.

    Scoring (applied per unique doc+page pair):
      +2  if "Page N" appears in the answer
      +1  if the document name stem appears in the answer
      +0  for top-scoring chunks not explicitly referenced (fallback)

    Sorted by (explicit_score desc, relevance_score desc).
    """
    answer_lower = answer.lower()
    cited: list[Citation] = []
    seen:  set[tuple[str, int]] = set()

    scored: list[tuple[int, dict]] = []
    for chunk in chunks:
        key = (chunk["document_id"], chunk["page"])
        if key in seen:
            continue
        seen.add(key)

        name_stem = chunk["document_name"].replace(".pdf", "").replace("_", " ").lower()
        page_ref  = f"page {chunk['page']}"

        score = 0
        if page_ref in answer_lower:
            score += 2
        if name_stem[:20] in answer_lower:
            score += 1

        scored.append((score, chunk))

    scored.sort(key=lambda t: (t[0], t[1]["relevance_score"]), reverse=True)

    for _, chunk in scored:
        cited.append(Citation(
            document_id    = chunk["document_id"],
            document_name  = chunk["document_name"],
            page           = chunk["page"],
            chunk_text     = chunk["chunk_text"][:350],
            relevance_score= chunk["relevance_score"],
        ))
        if len(cited) >= max_citations:
            break

    return cited


# ── JSON parsing helpers ──────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict | None:
    """Robustly parse JSON from LLM output that may have markdown fences."""
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    try:
        result = json.loads(cleaned)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass

    return None


def _clamp(value: object, default: float = 0.75) -> float:
    try:
        return max(0.0, min(1.0, float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _clean_clauses(raw: list) -> list[dict]:
    valid = {"low", "medium", "high"}
    out   = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        out.append({
            "type":        str(c.get("type", "Unknown Clause")),
            "description": str(c.get("description", "")),
            "verbatim":    str(c.get("verbatim", ""))[:300],
            "page":        max(1, int(c.get("page", 1))),
            "risk_level":  c.get("risk_level", "medium") if c.get("risk_level") in valid else "medium",
            "confidence":  _clamp(c.get("confidence")),
        })
    return out


def _clean_risks(raw: list) -> list[dict]:
    valid = {"low", "medium", "high", "critical"}
    out   = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        out.append({
            "title":          str(r.get("title", "Risk")),
            "severity":       r.get("severity", "medium") if r.get("severity") in valid else "medium",
            "description":    str(r.get("description", "")),
            "recommendation": str(r.get("recommendation", "")),
            "affected_party": str(r.get("affected_party", "")),
            "confidence":     _clamp(r.get("confidence")),
        })
    return out


def _clean_obligations(raw: list) -> list[dict]:
    out = []
    for o in raw:
        if not isinstance(o, dict):
            continue
        out.append({
            "party":       str(o.get("party", "")),
            "obligation":  str(o.get("obligation", "")),
            "deadline":    str(o.get("deadline", "Not specified")),
            "consequence": str(o.get("consequence", "")),
            "page":        max(1, int(o.get("page", 1))),
            "confidence":  _clamp(o.get("confidence")),
        })
    return out


def _clean_key_dates(raw: list) -> list[dict]:
    out = []
    for d in raw:
        if not isinstance(d, dict):
            continue
        out.append({
            "label":        str(d.get("label", "Date")),
            "date_value":   str(d.get("date_value", "")),
            "significance": str(d.get("significance", "")),
            "page":         max(1, int(d.get("page", 1))),
        })
    return out


def _clean_penalties(raw: list) -> list[dict]:
    out = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        out.append({
            "trigger":          str(p.get("trigger", "")),
            "amount_or_remedy": str(p.get("amount_or_remedy", "")),
            "party_liable":     str(p.get("party_liable", "")),
            "page":             max(1, int(p.get("page", 1))),
            "confidence":       _clamp(p.get("confidence")),
        })
    return out


def _empty_analysis(document_id: str, document_name: str) -> dict:
    return {
        "_schema_version": ANALYSIS_SCHEMA_VERSION,
        "document_id":     document_id,
        "document_name":   document_name,
        "document_type":   "Unknown",
        "parties":         [],
        "governing_law":   None,
        "effective_date":  None,
        "summary":         "No text content could be extracted from this document.",
        "key_points":      [],
        "clauses":         [],
        "risks":           [],
        "obligations":     [],
        "key_dates":       [],
        "penalties":       [],
    }


# ── Main RAG query (non-streaming) ────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
async def run_rag_query(
    question: str,
    user_id: str,
    document_ids: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> ChatResponse:
    """
    Full RAG pipeline using Nemotron 70B for conversational responses:
      1. Expand question into sub-queries
      2. Hybrid semantic+BM25 retrieval from ChromaDB
      3. Pack context to max_context_chars
      4. Generate answer with citation format enforced
      5. Ground citations to referenced pages/documents
    """
    t0 = time.monotonic()
    logger.info(f"RAG query | user={user_id} | q='{question[:72]}'")

    if _settings.multi_query_enabled:
        alternatives = await _expand_query(question)
        chunks = await multi_query_search(
            queries      = [question] + alternatives,
            user_id      = user_id,
            document_ids = document_ids,
        )
        logger.debug(f"Multi-query ({1 + len(alternatives)} queries) → {len(chunks)} chunks")
    else:
        chunks = await similarity_search(
            query        = question,
            user_id      = user_id,
            document_ids = document_ids,
        )

    if not chunks:
        return ChatResponse(
            answer=(
                "I could not find relevant information in your uploaded documents "
                "to answer this question. Please ensure the relevant PDFs are uploaded "
                "and finished processing (status: ready)."
            ),
            citations=[],
        )

    used_chunks, context = _pack_context(chunks, _settings.max_context_chars)
    logger.debug(f"Context: {len(used_chunks)} chunks, {len(context)} chars")

    messages = [SystemMessage(content=_LEGAL_SYSTEM)]
    if conversation_history:
        messages.extend(_format_history(conversation_history))
    messages.append(HumanMessage(
        content=f"Legal Document Context:\n\n{context}\n\nQuestion: {question}"
    ))

    response  = await _get_chat_llm().ainvoke(messages)
    answer: str = response.content
    citations   = _ground_citations(answer, used_chunks)

    elapsed = round((time.monotonic() - t0) * 1000)
    logger.success(f"RAG complete | {elapsed} ms | {len(citations)} citations")
    return ChatResponse(answer=answer, citations=citations)


# ── Streaming RAG (SSE) ───────────────────────────────────────────────────────────

async def stream_rag_query(
    question: str,
    user_id: str,
    document_ids: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> AsyncGenerator[str, None]:
    """
    SSE-compatible async generator (Nemotron 70B for streaming quality).

    Yields newline-terminated JSON:
      {"type": "token",    "data": "<token>"}
      {"type": "citation", "data": {Citation}}
      {"type": "done",     "data": null}
      {"type": "error",    "data": "<message>"}
    """
    try:
        if _settings.multi_query_enabled:
            alternatives = await _expand_query(question)
            chunks = await multi_query_search(
                queries      = [question] + alternatives,
                user_id      = user_id,
                document_ids = document_ids,
            )
        else:
            chunks = await similarity_search(
                query        = question,
                user_id      = user_id,
                document_ids = document_ids,
            )

        if not chunks:
            yield _sse("token", "I could not find relevant information in your uploaded documents.")
            yield _sse("done", None)
            return

        used_chunks, context = _pack_context(chunks, _settings.max_context_chars)

        messages = [SystemMessage(content=_LEGAL_SYSTEM)]
        if conversation_history:
            messages.extend(_format_history(conversation_history))
        messages.append(HumanMessage(
            content=f"Legal Document Context:\n\n{context}\n\nQuestion: {question}"
        ))

        full_answer = ""
        async for token_chunk in _get_chat_llm().astream(messages):
            token        = token_chunk.content
            full_answer += token
            yield _sse("token", token)

        citations = _ground_citations(full_answer, used_chunks)
        for c in citations:
            yield _sse("citation", c.model_dump())

        yield _sse("done", None)

    except Exception as exc:
        logger.error(f"stream_rag_query error: {exc}", exc_info=True)
        yield _sse("error", str(exc))


def _sse(event_type: str, data: object) -> str:
    return json.dumps({"type": event_type, "data": data}) + "\n"


# ── Full legal analysis (Mistral Large 2) ─────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
async def analyze_document_full(
    document_id: str,
    document_name: str,
    user_id: str,
) -> dict:
    """
    Comprehensive legal analysis using Mistral Large 2 (123 B).

    10 coverage queries sample the full document breadth; the packed context
    (up to 24 000 chars) feeds a single LLM call that returns a structured JSON
    with all extraction fields including confidence scores and verbatim citations.
    """
    t0 = time.monotonic()
    logger.info(f"Starting analysis for '{document_name}' with {_settings.effective_analysis_model}")

    chunks = await multi_query_search(
        queries      = _COVERAGE_QUERIES,
        user_id      = user_id,
        document_ids = [document_id],
        top_k        = 25,
    )

    if not chunks:
        logger.warning(f"No chunks found for '{document_name}'")
        return _empty_analysis(document_id, document_name)

    _, context = _pack_context(chunks, max_chars=_settings.max_context_chars)
    logger.debug(f"Analysis context: {len(chunks)} chunks, {len(context)} chars")

    response = await _get_analysis_llm().ainvoke([
        SystemMessage(content=_FULL_ANALYSIS_SYSTEM),
        HumanMessage(content=f"Document name: {document_name}\n\n{context}"),
    ])

    parsed = _parse_json(response.content)
    if not parsed:
        logger.error(f"JSON parse failed for '{document_name}' — returning raw summary")
        result = _empty_analysis(document_id, document_name)
        result["summary"] = response.content.strip()
        return result

    result = {
        "_schema_version": ANALYSIS_SCHEMA_VERSION,
        "document_id":     document_id,
        "document_name":   document_name,
        "document_type":   str(parsed.get("document_type", "Legal Document")),
        "parties":         [str(p) for p in parsed.get("parties", []) if p],
        "governing_law":   parsed.get("governing_law") or None,
        "effective_date":  parsed.get("effective_date") or None,
        "summary":         str(parsed.get("summary", "")),
        "key_points":      [str(k) for k in parsed.get("key_points", []) if k],
        "clauses":         _clean_clauses(parsed.get("clauses", [])),
        "risks":           _clean_risks(parsed.get("risks", [])),
        "obligations":     _clean_obligations(parsed.get("obligations", [])),
        "key_dates":       _clean_key_dates(parsed.get("key_dates", [])),
        "penalties":       _clean_penalties(parsed.get("penalties", [])),
    }

    elapsed = round((time.monotonic() - t0) * 1000)
    logger.success(
        f"Analysis complete | {elapsed} ms | model={_settings.effective_analysis_model} | "
        f"{len(result['clauses'])} clauses, {len(result['risks'])} risks, "
        f"{len(result['obligations'])} obligations, {len(result['penalties'])} penalties"
    )
    return result


# ── Lightweight summary ───────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8), reraise=True)
async def generate_document_summary(
    document_id: str,
    document_name: str,
    user_id: str,
) -> dict:
    """Summary endpoint — smaller context, faster turnaround than full analysis."""
    coverage_queries = [
        "purpose scope parties overview introduction",
        "obligations duties covenants representations warranties",
        "definitions terms conditions termination governing law",
    ]

    chunks = await multi_query_search(
        queries      = coverage_queries,
        user_id      = user_id,
        document_ids = [document_id],
        top_k        = 15,
    )

    if not chunks:
        return {
            "document_id":   document_id,
            "document_name": document_name,
            "summary":       "No text content could be extracted from this document.",
            "key_points":    [],
            "document_type": "Unknown",
        }

    _, context = _pack_context(chunks, max_chars=12000)

    response = await _get_analysis_llm().ainvoke([
        SystemMessage(content=_SUMMARY_SYSTEM),
        HumanMessage(content=f"Document: {document_name}\n\n{context}"),
    ])

    parsed = _parse_json(response.content)
    if parsed:
        return {
            "document_id":   document_id,
            "document_name": document_name,
            "summary":       str(parsed.get("summary", response.content.strip())),
            "key_points":    [str(k) for k in parsed.get("key_points", []) if k],
            "document_type": str(parsed.get("document_type", "Legal Document")),
        }

    return {
        "document_id":   document_id,
        "document_name": document_name,
        "summary":       response.content.strip(),
        "key_points":    [],
        "document_type": "Legal Document",
    }
