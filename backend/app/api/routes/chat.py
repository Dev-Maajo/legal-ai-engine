import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.db.supabase_client import get_document_by_id, get_conversation_messages, save_chat_message
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    SummaryRequest,
    SummaryResponse,
)
from app.services.rag_pipeline import (
    generate_document_summary,
    run_rag_query,
    stream_rag_query,
)

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, user: dict = Depends(get_current_user)):
    conversation_id = str(uuid.uuid4())

    await save_chat_message(
        user_id=user["id"],
        conversation_id=conversation_id,
        role="user",
        content=request.question,
    )

    response = await run_rag_query(
        question=request.question,
        user_id=user["id"],
        document_ids=request.document_ids or None,
        conversation_history=request.conversation_history,
    )

    await save_chat_message(
        user_id=user["id"],
        conversation_id=conversation_id,
        role="assistant",
        content=response.answer,
        citations=[c.model_dump() for c in response.citations],
    )

    return ChatResponse(
        answer=response.answer,
        citations=response.citations,
        conversation_id=conversation_id,
    )


@router.post("/stream")
async def chat_stream(request: ChatRequest, user: dict = Depends(get_current_user)):
    """
    Server-Sent Events endpoint for streaming token-by-token responses.

    Each line is a JSON object:
      {"type": "token",    "data": "<text>"}
      {"type": "citation", "data": {Citation}}
      {"type": "done",     "data": null}
      {"type": "error",    "data": "<message>"}
    """
    conversation_id = str(uuid.uuid4())

    await save_chat_message(
        user_id=user["id"],
        conversation_id=conversation_id,
        role="user",
        content=request.question,
    )

    async def _event_stream():
        full_answer = ""
        citations_received = []

        async for line in stream_rag_query(
            question=request.question,
            user_id=user["id"],
            document_ids=request.document_ids or None,
            conversation_history=request.conversation_history,
        ):
            try:
                event = json.loads(line)
            except Exception:
                yield f"data: {line}\n\n"
                continue

            if event["type"] == "token":
                full_answer += event["data"]
            elif event["type"] == "citation":
                citations_received.append(event["data"])
            elif event["type"] == "done":
                # Persist the complete assistant message
                await save_chat_message(
                    user_id=user["id"],
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_answer,
                    citations=citations_received,
                )

            yield f"data: {line}\n\n"

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx buffering
            "X-Conversation-Id": conversation_id,
        },
    )


@router.post("/summarize", response_model=SummaryResponse)
async def summarize(request: SummaryRequest, user: dict = Depends(get_current_user)):
    doc = await get_document_by_id(request.document_id, user["id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc["status"] != "ready":
        raise HTTPException(
            status_code=400,
            detail=f"Document not ready (status: {doc['status']})",
        )

    result = await generate_document_summary(
        document_id=request.document_id,
        document_name=doc["name"],
        user_id=user["id"],
    )
    return SummaryResponse(**result)


@router.get("/history/{conversation_id}")
async def get_history(conversation_id: str, user: dict = Depends(get_current_user)):
    messages = await get_conversation_messages(conversation_id, user["id"])
    return {"conversation_id": conversation_id, "messages": messages}
