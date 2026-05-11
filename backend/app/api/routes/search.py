from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.schemas import SearchRequest, SearchResponse, SearchResult
from app.services.vector_store import similarity_search

router = APIRouter(prefix="/search", tags=["Search"])


@router.post("/", response_model=SearchResponse)
async def semantic_search(
    request: SearchRequest,
    user: dict = Depends(get_current_user),
):
    # similarity_search is async — must be awaited
    raw = await similarity_search(
        query=request.query,
        user_id=user["id"],
        document_ids=request.document_ids or None,
        top_k=request.top_k,
    )

    results = [
        SearchResult(
            chunk_text=r["chunk_text"],
            document_id=r["document_id"],
            document_name=r["document_name"],
            page=r["page"],
            relevance_score=r["relevance_score"],
            metadata={
                **r.get("metadata", {}),
                "section_title": r.get("section_title", ""),
                "section_type":  r.get("section_type", ""),
            },
        )
        for r in raw
    ]

    return SearchResponse(results=results, query=request.query, total=len(results))
