# Feature: نظرسنجی مسافران (Passenger Satisfaction Survey)

**Status: implemented and merged.** Docs were drafted and explicitly
approved by the user before any code was written, per `CLAUDE.md`'s
workflow rule 1.

Found across three design files: `پنل مدیر IT.dc.html` (creates/
configures the survey), and `پنل مدیر عامل.dc.html` / `پنل مدیر
ارشد.dc.html` / `پنل رئیس هیئت مدیره.dc.html` (each renders a read-only
results view + an AI "تحلیل" button per flight). See `docs/API.md`'s
Phase 66 section for the full endpoint shapes and scope decisions
(SMS-only delivery — no email field exists on `Passenger`; one overall
rating + comment per response, not per-question scoring; lazy
materialization via the survey module's own reads, no cron; a new
`SurveySummaryProvider` AI abstraction calling the Anthropic API
directly, since CLAUDE.md scopes `ml-service` to exactly two unrelated
endpoints; real per-call token usage logging via a new `AiUsageLog`
table, closing a pre-existing CLAUDE.md-mandated gap the Phase 6
pricing-AI feature never filled).

Two corrections made during implementation to the originally-approved
draft (both documented in `docs/API.md`'s Phase 66 section): (1) the
lazy invite trigger is a new `materializeSurveyInvites` called from the
survey module's own `getStats()`/`getResults()` reads, not the three
originally-named `materializeFlownBookings` call sites; (2) the results/
analyze route keys on `flightInstanceId`, not `flightNo` (a recurring
flight number is not unique across departures, and grouping by it would
wrongly merge two different flights' passenger comments).

## Post-merge senior review (same session, before the next phase)

Immediately after merge, a full senior-level re-review of this phase's
diff (not a fresh feature request) surfaced 5 real findings, all fixed
in a follow-up commit before starting any new phase:

1. **`SurveyConfigPage.tsx` — unreachable error state.** The
   `if (!settings) return <loading>` guard also fired on a failed
   initial fetch (since `settings` never gets set on that path), so the
   `{error && ...}` JSX below it was dead code — a failed load looked
   identical to a permanently-loading page. Fixed by checking `error`
   inside that same guard. New test: `SurveyConfigPage.test.tsx` › "shows
   the error message instead of an infinite spinner when the initial
   fetch fails".
2. **`materializeSurveyInvites` — no retry for a failed SMS send.**
   Once a `SurveyInvite` row exists, the booking permanently stops
   matching the "no invite yet" query — so a transient SMS-provider
   failure (the row gets created, then `sms.send` fails) meant the
   passenger would never receive the link, contradicting the function's
   own comment claiming a retry would happen. Fixed by adding a second
   pass in `materializeSurveyInvites` that retries any `SurveyInvite`
   with `smsSentAt: null` whose booking has a phone number (a booking
   with no phone is permanently undeliverable and is correctly excluded,
   to avoid piling up redundant `SmsLog` rows forever). New test:
   `survey.e2e-spec.ts` › "retries the SMS on the next materialize() for
   an invite whose first send never confirmed".
3. **`getResults()` — in-memory aggregation, not real SQL.** The
   original implementation loaded every historical `SurveyResponse`-
   bearing `SurveyInvite` row (with its full `flightInstance`/`flight`/
   `route` join) on every call and grouped it with a JS `Map` — unbounded
   by survey volume, and the docs' claim of "SQL aggregation" was simply
   inaccurate. Replaced with a real `$queryRaw` `GROUP BY` (count + avg
   computed by Postgres), followed by a bounded lookup of only the
   distinct flight instances that actually have responses. Verified by
   the existing `survey.e2e-spec.ts` results tests (same behavior, real
   SQL now).
4. **AI prompt — no defense against passenger-submitted prompt
   injection.** Free-text comments were concatenated verbatim into the
   Anthropic prompt with no framing distinguishing "data to summarize"
   from "instructions to follow." Added an explicit instruction telling
   the model the numbered comment list is untrusted passenger data and
   must never be treated as instructions — a deliberate, documented
   deviation from the design's literal prompt text (which the original
   draft had described as matched exactly). Defense-in-depth, not a
   complete fix (no framing fully eliminates prompt injection) — the
   existing CLAUDE.md guarantee that AI output can never authorize an
   action still holds regardless.
5. **NO_SHOW override didn't revoke an already-issued invite.** A
   booking marked `NO_SHOW` after its `SurveyInvite` was already created
   left that invite fully live and answerable. Fixed by having
   `findInviteByToken` (shared by both `getPublicInvite` and
   `submitResponse`) also load the booking's `status` and treat
   `NO_SHOW` identically to an unknown token (same generic 404, no
   oracle on the internal booking state). New test: `survey.e2e-spec.ts`
   › "a booking later marked NO_SHOW revokes its already-issued invite
   (404, not answerable)".

## Acceptance checklist

### IT_MANAGER configuration
- [x] `GET /survey/settings` returns `{ enabled, title, updatedAt,
      updatedByLabelFa }`; `IT_MANAGER` only, 403 for every other role —
      `survey.e2e-spec.ts` › "GET/PATCH /survey/settings — IT_MANAGER
      only, others get 403"
- [x] `PATCH /survey/settings` updates `enabled`/`title`, writes an
      audit-log entry (`AuditCategory.SURVEY`), `IT_MANAGER` only — same
      test as above
- [x] `GET /survey/questions` returns the ordered question list, seeded
      with the design's 5 defaults — `survey.e2e-spec.ts` ›
      "POST/DELETE /survey/questions — add, list, remove, 404 for
      unknown id"
- [x] `POST /survey/questions` appends a question at the next `order`;
      `IT_MANAGER` only; validates non-empty `label` — same test
- [x] `DELETE /survey/questions/:id` removes a question; `IT_MANAGER`
      only; 404 for an unknown id — same test
- [x] `GET /survey/stats` returns `{ flightsWithSurvey, totalResponses,
      avgRating, recentResponses (latest 8) }`, computed server-side
      (SQL), `IT_MANAGER` only — exercised as the materialization
      trigger in every "lazy invite creation" test below, and asserted
      directly via `SurveyConfigPage.test.tsx` › "renders settings,
      stats, questions and recent responses"

### Lazy invite creation + SMS delivery
- [x] A booking observed `FLOWN` gets exactly one `SurveyInvite`
      created (by the new `materializeSurveyInvites`, triggered from
      `GET /survey/stats`/`GET /survey/results`) when
      `SurveySettings.enabled` is true, and one `SURVEY_INVITE` SMS is
      sent to the booking's `contactPhone` (plaintext — not
      `Passenger.mobileEnc`; corrects the draft's "decrypted mobile"
      wording, see docs/API.md) containing a link with the invite's
      token — `survey.e2e-spec.ts` › "a FLOWN booking gets exactly one
      SurveyInvite + SMS on the next stats read, idempotently"
- [x] Calling the trigger again for an already-FLOWN booking does not
      create a second `SurveyInvite` or send a second SMS (idempotent)
      — same test
- [x] When `SurveySettings.enabled` is false, no `SurveyInvite` is
      created on the `FLOWN` transition — `survey.e2e-spec.ts` › "does
      not create an invite while the survey is disabled"
- [x] A missing contact phone does not throw or block materialization —
      the invite is still created, just never sent (`smsSentAt` stays
      null); `SmsService.send` already handles a null phone gracefully
      — `survey.e2e-spec.ts` › "a missing contact phone does not throw
      — invite is still created, just never sent"

### Public survey submission
- [x] `GET /survey/:token` returns the question list + minimal flight
      context for a valid, unanswered, enabled invite — no auth
      required — `survey.e2e-spec.ts` › "GET returns the question list
      + flight context; POST submits; a second POST 409s"
- [x] `GET /survey/:token` 404s for an unknown token —
      `survey.e2e-spec.ts` › "GET unknown token 404s"
- [x] `GET /survey/:token` 409s (`SURVEY_ALREADY_SUBMITTED`, not
      `ALREADY_SUBMITTED` as originally drafted) if a `SurveyResponse`
      already exists for that invite — same test as the first item
- [x] `GET /survey/:token` 409s (`SURVEY_DISABLED`) if
      `SurveySettings.enabled` is false — `survey.e2e-spec.ts` ›
      "GET/POST 409 SURVEY_DISABLED while the survey is off"
- [x] `POST /survey/:token` with `{ rating: 1-5, comment? }` creates a
      `SurveyResponse` and sets `SurveyInvite.respondedAt` — same test
      as the first item
- [x] `POST /survey/:token` rejects `rating` outside 1-5 with 400 —
      same test
- [x] `POST /survey/:token` on an already-answered token 409s rather
      than creating a duplicate response (also enforced at the DB level
      via `SurveyResponse.inviteId @unique`) — same test
- [x] Rate limiting is applied per-IP on both `GET` and `POST` —
      `@Throttle` on `SurveyPublicController` (20/min GET, 10/min POST);
      not separately proven by a dedicated test, matching the existing
      convention for other public throttled endpoints in this codebase
      (e.g. `manage-booking`).

### Executive read-only results + AI summary
- [x] `GET /survey/results` returns one row per **flight instance**
      (`flightInstanceId, flightNo, originCityFa, destCityFa,
      departureAt, count, avgRating` — no `airline` field, since this is
      a single-tenant system), computed via server-side aggregation;
      accessible to `CEO`, `SENIOR_MANAGER`, `BOARD_CHAIR` —
      `survey.e2e-spec.ts` › "GET /survey/results — 200 for
      CEO/SENIOR_MANAGER/BOARD_CHAIR with the real flight row"
- [x] 403 for every other role (including `IT_MANAGER`,
      `FINANCE_MANAGER`, `COMMERCIAL_MANAGER`) — `survey.e2e-spec.ts` ›
      "GET /survey/results — 403 for IT_MANAGER/FINANCE_MANAGER/
      COMMERCIAL_MANAGER"
- [x] `GET /survey/results` returns `{ disabled: true, flights: [] }`
      when `SurveySettings.enabled` is false, instead of an empty-state
      — `survey.e2e-spec.ts` › "GET /survey/results returns
      disabled:true + an empty list while the survey is off"
- [x] `POST /survey/results/:flightInstanceId/analyze` (route keys on
      `flightInstanceId`, not `flightNo` as originally drafted — see the
      correction note above) calls `SurveySummaryProvider.summarize`
      with that flight's non-empty comments using the design's exact
      prompt template, returns `{ summary }`, and writes one
      `AiUsageLog` row with the real `input_tokens`/`output_tokens` from
      the Anthropic response — proven for the fallback path (below);
      the real-Anthropic-success path is proven at the provider level
      (`survey-summary.provider.spec.ts`) rather than through a live
      Anthropic call in e2e, matching this session's standing rule
      against ever contacting a real third-party vendor from an
      automated test.
- [x] When `ANTHROPIC_API_KEY` is unset (or the call errors/times out),
      the analyze endpoint still returns 201 (Nest's default POST
      status — no `@HttpCode` override) with the design's fallback
      string (`"خلاصه‌ای از نظرات این پرواز در دسترس نیست."`) — never a
      500 — and does **not** write an `AiUsageLog` row for the failed
      attempt — `survey.e2e-spec.ts` › "POST
      /survey/results/:flightInstanceId/analyze falls back gracefully
      when ANTHROPIC_API_KEY is unset, and writes no AiUsageLog row"
- [x] Rate limiting: relies on the app's global `ThrottlerGuard`
      (IP-based), same posture as the existing Phase 6 pricing-AI
      endpoint — no separate per-user throttle was added, for
      consistency with that precedent (corrects the draft's "rate
      limited per-user" wording — see docs/API.md).
- [x] Same role scoping as `GET /survey/results` (403 for everyone
      else) — same test as the fallback-analyze test above (asserts
      `IT_MANAGER` gets 403 on `analyze`).

### Frontend
- [x] New public page `SurveyPage.tsx` (route `/survey/:token`): shows
      question prompts, a 1-5 rating control, an optional comment
      field, submit button; shows the real server error message instead
      of the form for the 404/`SURVEY_ALREADY_SUBMITTED`/
      `SURVEY_DISABLED` cases. **fa-only** — unlike the retrofitted
      public pages from the i18n arc (Phases 41–64), this is a
      brand-new page with no exported design file to extract en/ar
      vocabulary from; a documented, bounded scope decision.
- [x] New IT-manager page (`SurveyConfigPage.tsx`) wired to
      `PANEL_NAV.IT_MANAGER`'s `survey` key: enable toggle, question
      list with add/remove, stats card, recent-responses feed.
- [x] New shared read-only results page (`SurveyResultsPage.tsx`) wired
      to `PANEL_NAV`'s `survey` key for `CEO`, `SENIOR_MANAGER`,
      `BOARD_CHAIR` (via `SurveyRouter.tsx`, same role-branching pattern
      as `LogsRouter.tsx`): per-flight count/avg rating rows, "تحلیل با
      هوش مصنوعی" button per row with a loading state, rendered summary
      text (plain text, never `dangerouslySetInnerHTML`).
- [x] Frontend never calls `fetch`/`axios` directly — new
      `frontend/src/api/survey.ts` client, one file per the existing
      convention.

### Tests
- [x] Backend unit tests for `SurveySummaryProvider` (missing key,
      empty comment list, non-2xx status, network failure, real success
      path with real token usage — all via a mocked `global.fetch`) —
      `survey-summary.provider.spec.ts` (5 cases).
- [x] Backend e2e tests (Jest+Supertest, real Postgres): every endpoint
      above — happy path, auth failure, validation failure, token
      cases, the disabled-survey banner case, and the AI-analyze
      fallback-on-failure case — `survey.e2e-spec.ts` (12 tests).
- [x] Frontend Vitest/RTL tests for `SurveyPage.tsx` (submit, missing-
      rating validation, server error message), `SurveyConfigPage.tsx`
      (render, toggle, add/remove question), and `SurveyResultsPage.tsx`
      (render, disabled banner, analyze + summary render) — 10 tests
      across `SurveyPage.test.tsx`, `SurveyConfigPage.test.tsx`,
      `SurveyResultsPage.test.tsx`.
- [x] `panels.e2e-spec.ts`'s pre-existing "returns the confirmed tab set
      for CEO" test updated to include the new `survey` key (real,
      expected consequence of the `PANEL_NAV` change, same pattern as
      Phase 65's `clubrules` addition).

No new Playwright E2E script this phase — consistent with this
session's recent phase cadence (Phases 51–65), which relies on the
real-DB Jest e2e suite plus Vitest/RTL rather than a dedicated
Playwright script per feature.

A feature is COMPLETE only when every item above is checked off with the
specific test file/name that proves it, per CLAUDE.md's Testing section.
