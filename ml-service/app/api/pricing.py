import logging

from fastapi import APIRouter, Depends, Header

from ..core.auth import require_internal_token
from ..schemas.pricing import PriceSuggestionRequest, PriceSuggestionResponse
from ..services.pricing import MODEL_VERSION, suggest_price

logger = logging.getLogger("ml.pricing")

router = APIRouter(prefix="/internal/v1", dependencies=[Depends(require_internal_token)])


@router.post("/price-suggestion", response_model=PriceSuggestionResponse)
async def price_suggestion(
    body: PriceSuggestionRequest,
    x_request_id: str = Header(default="-"),
) -> PriceSuggestionResponse:
    suggestions = [suggest_price(item) for item in body.items]
    logger.info(
        '{"event":"price_suggestion","request_id":"%s","items":%d,"model":"%s"}',
        x_request_id,
        len(body.items),
        MODEL_VERSION,
    )
    return PriceSuggestionResponse(model_version=MODEL_VERSION, suggestions=suggestions)
