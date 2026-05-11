from supabase import create_client, Client
from functools import lru_cache
from app.core.config import get_settings

settings = get_settings()


@lru_cache
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)


# ── Document helpers ────────────────────────────────────────────────────────────

async def create_document_record(
    user_id: str,
    name: str,
    file_path: str,
    file_size: int,
) -> dict:
    client = get_supabase()
    result = (
        client.table("documents")
        .insert(
            {
                "user_id": user_id,
                "name": name,
                "file_path": file_path,
                "file_size": file_size,
                "status": "processing",
                "page_count": 0,
                "chunk_count": 0,
            }
        )
        .execute()
    )
    return result.data[0]


async def update_document_status(
    document_id: str,
    status: str,
    page_count: int = 0,
    chunk_count: int = 0,
) -> None:
    client = get_supabase()
    client.table("documents").update(
        {"status": status, "page_count": page_count, "chunk_count": chunk_count}
    ).eq("id", document_id).execute()


async def get_documents_for_user(user_id: str) -> list[dict]:
    client = get_supabase()
    result = (
        client.table("documents")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


async def get_document_by_id(document_id: str, user_id: str) -> dict | None:
    client = get_supabase()
    result = (
        client.table("documents")
        .select("*")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return result.data


async def delete_document_record(document_id: str, user_id: str) -> bool:
    client = get_supabase()
    result = (
        client.table("documents")
        .delete()
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


# ── Chat history helpers ────────────────────────────────────────────────────────

async def save_chat_message(
    user_id: str,
    conversation_id: str,
    role: str,
    content: str,
    citations: list[dict] | None = None,
) -> dict:
    client = get_supabase()
    result = (
        client.table("chat_messages")
        .insert(
            {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "citations": citations or [],
            }
        )
        .execute()
    )
    return result.data[0]


async def get_conversation_messages(
    conversation_id: str, user_id: str
) -> list[dict]:
    client = get_supabase()
    result = (
        client.table("chat_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data
