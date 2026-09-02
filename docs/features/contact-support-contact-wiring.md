# Contact page — support contact wiring (Phase G)

Completes the Phase F follow-up: the public contact page reads support
phone and email from `GET /settings/support-contact` (edited in the
SITE_ADMIN settings tab). Office address and hours stay static page copy.

## Acceptance checklist

- [x] Contact page fetches `GET /settings/support-contact` on mount —
      `ContactPage.test.tsx` › "shows support phone and email from GET
      /settings/support-contact"
- [x] Phone and email channel cards reflect API values when present —
      same test
- [x] Fetch failure keeps static fallbacks (no broken page) — implicit
      via default mock + existing channel tests
- [x] Phone digits localized (fa/ar) via shared format helpers —
      `ContactPage.test.tsx` (existing fa/en/ar channel tests)
- [x] Pre-existing contact form tests unchanged — `ContactPage.test.tsx`

## Explicit deferrals

- Office address / hours from CMS (still static copy on this page)
- `contactAddress` from settings tab (separate key, not in support-contact)
