import os

os.environ.setdefault("INTERNAL_TOKEN", "test-internal-token")

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.pricing import PriceSuggestionItem
from app.services.pricing import MODEL_VERSION, suggest_price

client = TestClient(app)

AUTH = {"X-Internal-Token": "test-internal-token"}


def make_item(**overrides) -> dict:
    base = {
        "proposal_id": "p1",
        "origin_code": "THR",
        "dest_code": "DXB",
        "departure_at": "2026-08-10T08:30:00Z",
        "base_price_irr": 38_000_000,
        "competitor_price_irr": 39_000_000,
        "proposed_price_irr": 38_500_000,
        "capacity": 180,
        "charter_seats": 60,
    }
    base.update(overrides)
    return base


def test_rejects_missing_or_wrong_token():
    assert client.post("/internal/v1/price-suggestion", json={"items": [make_item()]}).status_code == 401
    assert (
        client.post(
            "/internal/v1/price-suggestion",
            json={"items": [make_item()]},
            headers={"X-Internal-Token": "wrong"},
        ).status_code
        == 401
    )


def test_health_is_public():
    assert client.get("/health").status_code == 200


def test_suggestion_response_shape_and_model_version():
    res = client.post("/internal/v1/price-suggestion", json={"items": [make_item()]}, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == MODEL_VERSION
    (s,) = body["suggestions"]
    assert s["proposal_id"] == "p1"
    assert s["price_irr"] > 0
    assert s["price_irr"] % 100_000 == 0  # rounded to presentable steps
    assert 0 <= s["confidence"] <= 1
    assert s["reason_fa"] and s["factors_fa"] and s["season_fa"] and s["occasion_fa"]


def test_never_more_than_5pct_above_competitors():
    item = PriceSuggestionItem(
        **make_item(base_price_irr=90_000_000, competitor_price_irr=40_000_000)
    )
    s = suggest_price(item)
    assert s.price_irr <= 40_000_000 * 1.05


def test_extreme_low_prices_stay_positive():
    item = PriceSuggestionItem(
        **make_item(base_price_irr=1, competitor_price_irr=1, proposed_price_irr=1)
    )
    s = suggest_price(item)
    assert s.price_irr >= 100_000


def test_heavy_charter_share_flags_the_factor():
    item = PriceSuggestionItem(**make_item(charter_seats=90, capacity=180))
    s = suggest_price(item)
    assert any("چارتری" in f for f in s.factors_fa)


def test_validation_rejects_bad_payloads():
    assert (
        client.post(
            "/internal/v1/price-suggestion",
            json={"items": [make_item(base_price_irr=-5)]},
            headers=AUTH,
        ).status_code
        == 422
    )
    assert (
        client.post("/internal/v1/price-suggestion", json={"items": []}, headers=AUTH).status_code
        == 422
    )


def test_deterministic_for_same_input():
    item = PriceSuggestionItem(**make_item())
    assert suggest_price(item) == suggest_price(item)


@pytest.mark.parametrize("month,expected_season", [(3, "نوروز و بهار"), (7, "اوج سفرهای تابستانی"), (12, "فصل کم‌تقاضا")])
def test_season_mapping(month, expected_season):
    item = PriceSuggestionItem(
        **make_item(departure_at=datetime(2026, month, 15, tzinfo=timezone.utc).isoformat())
    )
    assert suggest_price(item).season_fa == expected_season
