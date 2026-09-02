"""Request/response contracts for /internal/v1/price-suggestion.

Data-minimized per CLAUDE.md's ML rules: route codes, dates, prices and
capacity only — never passenger PII, passport numbers or payment data.
Amounts are integer IRR everywhere (never floats, never toman).
"""

from datetime import datetime

from pydantic import BaseModel, Field


class PriceSuggestionItem(BaseModel):
    proposal_id: str = Field(description="Opaque id echoed back so NestJS can match results")
    origin_code: str = Field(min_length=3, max_length=3, description="IATA origin, e.g. THR")
    dest_code: str = Field(min_length=3, max_length=3, description="IATA destination, e.g. DXB")
    departure_at: datetime
    base_price_irr: int = Field(gt=0)
    competitor_price_irr: int = Field(gt=0)
    proposed_price_irr: int = Field(gt=0)
    capacity: int = Field(gt=0)
    charter_seats: int = Field(ge=0)


class PriceSuggestionRequest(BaseModel):
    items: list[PriceSuggestionItem] = Field(min_length=1, max_length=100)


class PriceSuggestion(BaseModel):
    proposal_id: str
    price_irr: int
    reason_fa: str
    factors_fa: list[str]
    season_fa: str
    occasion_fa: str
    confidence: float = Field(ge=0, le=1)


class PriceSuggestionResponse(BaseModel):
    model_version: str
    suggestions: list[PriceSuggestion]
