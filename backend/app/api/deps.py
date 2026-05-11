from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.security import verify_supabase_token, extract_user_id

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_supabase_token(credentials.credentials)
    return {
        "id": extract_user_id(payload),
        "email": payload.get("email", ""),
        "payload": payload,
    }


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    if not credentials:
        return None
    try:
        payload = verify_supabase_token(credentials.credentials)
        return {"id": extract_user_id(payload), "email": payload.get("email", "")}
    except HTTPException:
        return None
