from fastapi import Header, HTTPException, status

from .config import settings


async def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    """Every /internal/v1/* route depends on this — rejects anything without
    the shared token the NestJS backend sends. This service is never reachable
    from the internet or the frontend directly (Docker-internal network only)."""
    if x_internal_token != settings.internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal token")
