# Destinations page — CMS highlights wiring (Phase H)

Completes the Phase E deferral for wiring destination highlights to the
public مقاصد page (design: cards shown on home **and** destinations page).

## Scope

- Destination **prices** and **cover images** from CMS override matching
  static catalog entries by airport code.
- **Popular routes** section reads CMS route highlights when available.
- Duration, badges, map pins, and the full 12-destination catalog remain
  static presentational copy (no full destinations CMS in this phase).

## Acceptance checklist

- [x] Page fetches `GET /site-content/home` on mount —
      `DestinationsPage.test.tsx` › CMS tests
- [x] Matching destination cards show CMS price — same test
- [x] Popular routes section shows CMS route prices — same test
- [x] Fetch failure keeps static fallbacks — implicit via mock + hero test

## Explicit deferrals

- Full per-destination CMS (duration, badge, region, map pins)
- Static site pages list CMS
- CMS-only destinations not in the static catalog
