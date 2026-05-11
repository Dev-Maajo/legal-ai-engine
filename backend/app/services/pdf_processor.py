"""
Legal PDF processor — clause-aware, position-tracked semantic chunking.

Key design decisions
--------------------
* Ligature / unicode normalization fixes garbled text from PDF extraction.
* De-hyphenation rejoins words split across lines ("obli-\\ngation" → "obligation").
* Legal section header detection creates hard chunk boundaries — no chunk ever
  spans two named sections (ARTICLE I text never mingles with ARTICLE II text).
* Paragraph-first chunking keeps related sentences together; when a paragraph
  exceeds chunk_size it is sub-split on sentence boundaries rather than chars.
* Overlap carries whole paragraphs so chunks never start mid-sentence.
* PAGE OFFSET BUG FIX: each paragraph's character position within the full
  document is tracked so every chunk gets the correct page number, not just
  the page of the section header.
* Clause numbers (e.g. "2.3.1", "§ 4.2") are stored as metadata so the
  retrieval layer can surface them in search results and citations.
"""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
from loguru import logger


# ── Data classes ──────────────────────────────────────────────────────────────────

@dataclass
class PageContent:
    page_num: int
    text: str
    is_scanned: bool = False


@dataclass
class ProcessedDocument:
    file_path: Path
    total_pages: int
    pages: list[PageContent]
    metadata: dict
    is_scanned: bool = False


# ── Unicode / ligature cleanup ────────────────────────────────────────────────────

_LIGATURE_MAP = str.maketrans({
    "ﬀ": "ff",  "ﬁ": "fi",  "ﬂ": "fl",
    "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
    "‘": "'",   "’": "'",   "“": '"',  "”": '"',
    "–": "-",   "—": "--",  "­": "",   # en/em dash, soft-hyphen
})


# ── Legal section header patterns ─────────────────────────────────────────────────

_SECTION_RE = re.compile(
    r"^(?:"
    r"ARTICLE\s+(?:[IVXLCDM]+|\d+)[\s.:]*\S|"        # ARTICLE I / ARTICLE 1
    r"(?:SECTION|SEC\.?)\s+\d[\d.]*[\s.:]*\S|"       # SECTION 1 / SECTION 1.2
    r"Section\s+\d[\d.]*[\s.:]*\S|"                  # Section 1.2
    r"§\s*\d[\d.]*|"                                  # § 1.2
    r"\d+\.\s{1,4}[A-Z][A-Z ]{3,40}(?:\n|$)|"        # 1. DEFINITIONS
    r"[IVXLCDM]{1,6}\.\s{1,4}[A-Z][A-Z ]{3,40}(?:\n|$)|"  # IV. GENERAL PROVISIONS
    r"WHEREAS[,\s]|"
    r"NOW,?\s+THEREFORE[,\s]|"
    r"IN WITNESS WHEREOF|"
    r"(?:SCHEDULE|EXHIBIT|ANNEX|APPENDIX)\s+[A-Z\d]"
    r")",
    re.MULTILINE,
)

_SECTION_TYPE_MAP = [
    ("ARTICLE",     "article"),
    ("SECTION",     "section"),
    ("SEC.",        "section"),
    ("Section",     "section"),
    ("§",           "section"),
    ("WHEREAS",     "recital"),
    ("NOW",         "recital"),
    ("IN WITNESS",  "signature"),
    ("SCHEDULE",    "schedule"),
    ("EXHIBIT",     "exhibit"),
    ("ANNEX",       "annex"),
    ("APPENDIX",    "appendix"),
]

# Matches sub-clause numbers like "2.3.1" or "(a)" at the start of a line —
# stored in chunk metadata to support precise citations.
_CLAUSE_NUM_RE = re.compile(
    r"^(\d+(?:\.\d+){1,4}|§\s*\d+(?:\.\d+)*|\([a-z]{1,3}\)|\([ivxlcdm]+\))\s",
    re.MULTILINE,
)

# Page header / footer patterns (stripped before chunking)
_HEADER_FOOTER_RE = re.compile(
    r"^[ \t]*(?:Page\s+\d+\s+of\s+\d+|\d+\s+of\s+\d+|\d+)\s*$",
    re.MULTILINE | re.IGNORECASE,
)

# Sentence splitter — fixed-width lookbehinds only (Python re requirement)
_SENT_RE = re.compile(
    r"(?<!Mr\.)(?<!Mrs\.)(?<!Ms\.)(?<!Dr\.)(?<!Prof\.)"
    r"(?<!Sr\.)(?<!Jr\.)(?<!vs\.)(?<!etc\.)(?<!No\.)"
    r"(?<!Art\.)(?<!Sec\.)(?<!Para\.)(?<!Vol\.)(?<!Cl\.)"
    r"(?<!Exh\.)(?<!App\.)(?<!Sch\.)"
    r"(?<=[.!?])\s+(?=[A-Z\(])"
)

_MIN_SCANNED_CHARS = 80
_MIN_CHUNK_CHARS   = 60   # raised slightly — very short chunks add noise


# ── Public API ────────────────────────────────────────────────────────────────────

def extract_pdf_content(file_path: Path) -> ProcessedDocument:
    """Extract and clean text from every page of a PDF."""
    if not file_path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")

    doc = fitz.open(str(file_path))
    pages: list[PageContent] = []
    scanned_count = 0

    try:
        for i in range(len(doc)):
            page = doc[i]
            raw = page.get_text("text", sort=True)
            is_scanned = len(raw.strip()) < _MIN_SCANNED_CHARS
            if is_scanned:
                scanned_count += 1
            cleaned = _clean_page_text(raw)
            pages.append(PageContent(page_num=i + 1, text=cleaned, is_scanned=is_scanned))

        metadata = _extract_metadata(doc)
    finally:
        doc.close()

    mostly_scanned = scanned_count > len(pages) * 0.5
    if mostly_scanned:
        logger.warning(
            f"'{file_path.name}' appears scanned "
            f"({scanned_count}/{len(pages)} pages have insufficient text). "
            "Text quality may be poor."
        )

    logger.info(f"Extracted {len(pages)} pages from '{file_path.name}'")
    return ProcessedDocument(
        file_path=file_path,
        total_pages=len(pages),
        pages=pages,
        metadata=metadata,
        is_scanned=mostly_scanned,
    )


def chunk_document(
    processed: ProcessedDocument,
    chunk_size: int = 1500,
    chunk_overlap: int = 300,
) -> list[dict]:
    """
    Clause-aware semantic chunking.

    1. Joins all page text into a single string, building a char-offset → page map.
    2. Detects legal section headers; text never crosses a section boundary.
    3. Within each section, paragraphs are packed up to chunk_size chars.
    4. Oversized paragraphs are split on sentence boundaries.
    5. Overlap carries whole paragraphs — chunks never start mid-sentence.
    6. Each paragraph's exact character offset is tracked so the correct page
       number is recorded per chunk (not just the section start page).
    7. Sub-clause numbers detected in chunk text are stored in metadata.
    """
    parts: list[str] = []
    page_offsets: list[tuple[int, int]] = []   # (char_start_in_full_text, page_num)
    pos = 0

    for page in processed.pages:
        if not page.text.strip():
            continue
        page_offsets.append((pos, page.page_num))
        parts.append(page.text)
        pos += len(page.text) + 2   # +2 for the "\n\n" join

    if not parts:
        logger.warning(f"No extractable text from '{processed.file_path.name}'")
        return []

    full_text = "\n\n".join(parts)
    sections   = _split_into_sections(full_text)

    all_chunks: list[dict] = []
    chunk_index = 0

    for sec_title, sec_type, sec_text, sec_offset in sections:
        section_chunks = _chunk_section(
            text          = sec_text,
            doc_offset    = sec_offset,
            page_offsets  = page_offsets,
            section_title = sec_title,
            section_type  = sec_type,
            source        = processed.file_path.name,
            chunk_size    = chunk_size,
            chunk_overlap = chunk_overlap,
            start_index   = chunk_index,
        )
        all_chunks.extend(section_chunks)
        chunk_index += len(section_chunks)

    logger.info(
        f"'{processed.file_path.name}' → {len(all_chunks)} chunks "
        f"from {len(sections)} sections, {processed.total_pages} pages"
    )
    return all_chunks


# ── Section splitting ─────────────────────────────────────────────────────────────

def _split_into_sections(
    full_text: str,
) -> list[tuple[str, str, str, int]]:
    """Split at legal section headers. Returns [(title, type, body, char_offset)]."""
    boundaries: list[int] = [0]
    titles: list[str]     = [""]   # preamble has no title

    for m in _SECTION_RE.finditer(full_text):
        boundaries.append(m.start())
        titles.append(m.group(0).strip())

    boundaries.append(len(full_text))

    sections: list[tuple[str, str, str, int]] = []
    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end   = boundaries[i + 1]
        body  = full_text[start:end].strip()
        if not body:
            continue
        title = titles[i]
        stype = _classify_section(title)
        sections.append((title, stype, body, start))

    return sections


def _classify_section(title: str) -> str:
    for prefix, stype in _SECTION_TYPE_MAP:
        if title.startswith(prefix):
            return stype
    return "preamble" if not title else "body"


# ── Clause number extraction ──────────────────────────────────────────────────────

def _extract_clause_numbers(text: str) -> list[str]:
    """Return unique sub-clause numbers found in the text (e.g. '2.3.1', '(a)')."""
    return list(dict.fromkeys(m.group(1) for m in _CLAUSE_NUM_RE.finditer(text)))


# ── Section → chunks ──────────────────────────────────────────────────────────────

# Each buffer entry is (offset_within_section, paragraph_text)
_BufEntry = tuple[int, str]


def _chunk_section(
    text: str,
    doc_offset: int,
    page_offsets: list[tuple[int, int]],
    section_title: str,
    section_type: str,
    source: str,
    chunk_size: int,
    chunk_overlap: int,
    start_index: int,
) -> list[dict]:
    """
    Pack paragraphs into variable-length chunks capped at chunk_size.

    PAGE-OFFSET FIX: instead of using the section's start offset for every
    chunk (old bug), we track each paragraph's character position within the
    section and add it to doc_offset, yielding per-chunk page accuracy.
    """
    # Split paragraphs and record their start offsets within the section text
    para_list: list[_BufEntry] = []
    pos = 0
    for raw_para in re.split(r"\n\n+", text):
        stripped = raw_para.strip()
        if stripped:
            para_list.append((pos, stripped))
        pos += len(raw_para) + 2   # +2 for the \n\n split point

    if not para_list:
        return []

    chunks: list[dict] = []
    chunk_index = start_index
    buf: list[_BufEntry] = []
    buf_len = 0
    prefix = f"[{section_title}]\n" if section_title else ""

    def _flush() -> None:
        nonlocal chunk_index
        if not buf:
            return
        texts     = [t for _, t in buf]
        body      = "\n\n".join(texts)
        chunk_txt = (prefix + body) if (not chunks and prefix) else body
        chunk_txt = chunk_txt.strip()
        if len(chunk_txt) < _MIN_CHUNK_CHARS:
            return
        # Use the FIRST buffered paragraph's offset → correct page number
        first_offset = buf[0][0]
        page = _page_for_offset(doc_offset + first_offset, page_offsets)
        clause_nums  = _extract_clause_numbers(chunk_txt)
        chunks.append({
            "text":          chunk_txt,
            "page":          page,
            "chunk_index":   chunk_index,
            "section_title": section_title,
            "section_type":  section_type,
            "clause_numbers": clause_nums,
            "source":        source,
        })
        chunk_index += 1

    def _overlap_tail(b: list[_BufEntry]) -> list[_BufEntry]:
        """Trailing entries that together fit within chunk_overlap chars."""
        selected: list[_BufEntry] = []
        total = 0
        for off, p in reversed(b):
            cost = len(p) + 2
            if total + cost > chunk_overlap:
                break
            selected.insert(0, (off, p))
            total += cost
        return selected

    for para_off, para in para_list:
        para_len = len(para) + 2

        if para_len > chunk_size:
            # Flush current buffer before sub-chunking the giant paragraph
            if buf:
                _flush()
                buf = _overlap_tail(buf)
                buf_len = sum(len(t) + 2 for _, t in buf)
            # Sub-chunk on sentence boundaries; all sub-chunks share para_off
            for sub in _sentence_chunks(para, chunk_size, chunk_overlap):
                buf = [(para_off, sub)]
                _flush()
            buf = []
            buf_len = 0

        elif buf_len + para_len > chunk_size and buf:
            _flush()
            buf = _overlap_tail(buf)
            buf_len = sum(len(t) + 2 for _, t in buf)
            buf.append((para_off, para))
            buf_len += para_len

        else:
            buf.append((para_off, para))
            buf_len += para_len

    if buf:
        _flush()

    return chunks


def _sentence_chunks(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Split a long paragraph on sentence boundaries into sub-chunks."""
    sentences   = _SENT_RE.split(text)
    sub_chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0

    for sent in sentences:
        sl = len(sent) + 1
        if buf_len + sl > chunk_size and buf:
            sub_chunks.append(" ".join(buf))
            overlap: list[str] = []
            overlap_len = 0
            for s in reversed(buf):
                if overlap_len + len(s) + 1 > chunk_overlap:
                    break
                overlap.insert(0, s)
                overlap_len += len(s) + 1
            buf     = overlap
            buf_len = overlap_len
        buf.append(sent)
        buf_len += sl

    if buf:
        sub_chunks.append(" ".join(buf))
    return sub_chunks


# ── Utilities ─────────────────────────────────────────────────────────────────────

def _page_for_offset(offset: int, page_offsets: list[tuple[int, int]]) -> int:
    """Return the page number that contains the given absolute character offset."""
    page = page_offsets[0][1] if page_offsets else 1
    for start, page_num in page_offsets:
        if offset >= start:
            page = page_num
        else:
            break
    return page


def _clean_page_text(text: str) -> str:
    text = text.translate(_LIGATURE_MAP)
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)   # de-hyphenate across lines
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _HEADER_FOOTER_RE.sub("", text)
    return text.strip()


def _extract_metadata(doc: fitz.Document) -> dict:
    meta = doc.metadata or {}
    return {
        "title":      meta.get("title", ""),
        "author":     meta.get("author", ""),
        "subject":    meta.get("subject", ""),
        "creator":    meta.get("creator", ""),
        "page_count": len(doc),
    }
