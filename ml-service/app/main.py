import logging

from fastapi import FastAPI

from .core.config import settings

logging.basicConfig(level=settings.log_level.upper())

app = FastAPI(
    title="blujet ML service",
    description="Internal-only: price suggestion & flight recommendations. "
    "Never exposed to the internet or the frontend — called exclusively by the NestJS backend.",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


from .api.pricing import router as pricing_router  # noqa: E402

app.include_router(pricing_router)
