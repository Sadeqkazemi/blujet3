"""Versioned heuristic price-suggestion model.

Mirrors the factor structure of the approved design's analysis panel
(season, occasion, competitor position, charter share) so the NestJS side
can render the same chips/bullets. ADVISORY ONLY: the authoritative price
is always computed by the NestJS pricing module; this service never sets
a bookable price.
"""

from datetime import datetime

from ..schemas.pricing import PriceSuggestion, PriceSuggestionItem

MODEL_VERSION = "heuristic-v1.0.0"

# Jalali high seasons approximated in Gregorian terms: Nowruz (late March),
# summer holidays (July-August), and the late-September Arbaeen window for
# NJF. Kept deliberately simple and fully deterministic for v1.
_HIGH_SEASON_MONTHS = {3, 7, 8}
_PILGRIMAGE_DESTS = {"NJF"}
_INTERNATIONAL_DESTS = {"DXB", "IST", "NJF"}


def _season_fa(departure: datetime) -> tuple[str, float]:
    month = departure.month
    if month in (3, 4):
        return "نوروز و بهار", 1.06
    if month in (7, 8):
        return "اوج سفرهای تابستانی", 1.05
    if month in (11, 12, 1):
        return "فصل کم‌تقاضا", 0.97
    return "فصل عادی", 1.0


def _occasion_fa(item: PriceSuggestionItem) -> tuple[str, float]:
    if item.dest_code in _PILGRIMAGE_DESTS and item.departure_at.month in (8, 9):
        return "ایام زیارتی اربعین", 1.08
    if item.departure_at.weekday() in (2, 3):  # چهارشنبه/پنجشنبه
        return "پیک آخر هفته", 1.02
    return "بدون مناسبت خاص", 1.0


def suggest_price(item: PriceSuggestionItem) -> PriceSuggestion:
    season_label, season_factor = _season_fa(item.departure_at)
    occasion_label, occasion_factor = _occasion_fa(item)

    factors: list[str] = [f"فصل: {season_label}", f"مناسبت: {occasion_label}"]

    # Anchor between competitor and base, then apply demand factors.
    anchor = (item.competitor_price_irr + item.base_price_irr) / 2
    target = anchor * season_factor * occasion_factor

    charter_share = item.charter_seats / item.capacity
    if charter_share >= 0.4:
        # Heavy charter commitment: push seat fill over margin.
        target *= 0.98
        factors.append("تعهد چارتری بالا — اولویت با پر شدن صندلی‌ها")
    if item.dest_code in _INTERNATIONAL_DESTS or item.origin_code in _INTERNATIONAL_DESTS:
        factors.append("مسیر بین‌المللی — حساسیت قیمتی کمتر")
        target *= 1.01

    # Never suggest more than 5% above competitors — matches the design's
    # "slightly under/around competitors" behavior.
    ceiling = item.competitor_price_irr * 1.05
    target = min(target, ceiling)
    # Round to the nearest 100,000 IRR (10,000 toman) for presentable prices.
    price = max(int(round(target / 100_000) * 100_000), 100_000)

    delta_pct = (price - item.competitor_price_irr) / item.competitor_price_irr * 100
    if delta_pct <= -1:
        position = f"حدود {abs(round(delta_pct))}٪ پایین‌تر از رقبا برای جذب تقاضا"
    elif delta_pct >= 1:
        position = f"حدود {round(delta_pct)}٪ بالاتر از رقبا به پشتوانه تقاضای فصلی"
    else:
        position = "هم‌تراز با میانگین رقبا"
    factors.append(f"موقعیت رقابتی: {position}")

    # Confidence drops when base and competitor disagree strongly (thin signal).
    spread = abs(item.competitor_price_irr - item.base_price_irr) / max(item.base_price_irr, 1)
    confidence = round(max(0.55, min(0.92, 0.9 - spread * 0.5)), 2)

    return PriceSuggestion(
        proposal_id=item.proposal_id,
        price_irr=price,
        reason_fa=(
            f"با توجه به {season_label}، {occasion_label.lower() if occasion_label else ''} "
            f"و قیمت رقبا، نرخ پیشنهادی مدل {position} است."
        ),
        factors_fa=factors,
        season_fa=season_label,
        occasion_fa=occasion_label,
        confidence=confidence,
    )
