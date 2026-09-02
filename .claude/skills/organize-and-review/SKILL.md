---
name: organize-and-review
description: Use this skill whenever the user wants to tidy up, clean, or organize messy/disorganized files in the blujet repo before or as a lead-in to code review — phrases like "مرتب کن", "فایل‌های کثیف", "پروژه بهم ریخته‌ست", "سرو سامان بده", "clean up my project", "organize the repo", "tidy up these files". It runs two phases: (1) map the repo against CLAUDE.md's Repository Structure, find misplaced/duplicate/orphaned/temp files, propose a plan, and only move or delete after explicit confirmation; (2) once the tree is clean, kick off a code review scoped to this repo's own CLAUDE.md rules (money-as-integer, RBAC, panel no-mock-data, testing-per-feature, etc.). Trigger it even if the user asks for only one of the two phases — e.g. "just organize my files" or "شروع کنم کد ریویو" on its own.
---

# Organize & Review — blujet

Two-phase workflow for this repo: get the file tree back to matching
`CLAUDE.md`'s intended structure, then use that clean state as the
starting line for a code review grounded in this project's own rules
(not generic best practices).

The user primarily communicates in Persian about this project — reply in
Persian unless they've been writing in English.

## Before starting either phase

Re-read the "Repository Structure" section of `/home/user/blujet2/CLAUDE.md`
in this turn — it is the ground truth for where things belong. Don't work
from memory of a previous read; the structure section is short and cheap
to re-check, and treating it as authoritative is the whole point of this
skill (a generic "delete anything that looks old" pass would be actively
wrong here — e.g. `design-reference-v2/` is a second, still-referenced
design bundle per CLAUDE.md, not clutter).

## Phase 1 — Organize

### 1. Scan, don't assume

Look for these categories across the repo (skip `node_modules`, `.git`,
build output dirs already covered by `.gitignore`):

- **Naming smells** — files/dirs with `copy`, `old`, `backup`, `bak`,
  `tmp`, `temp`, `draft`, `final`, `v2`, `new`, a trailing number, etc.
  in the name.
- **Structural drift** — files that don't live where CLAUDE.md's tree
  says they should (e.g. a component sitting loose in `frontend/src/`
  instead of under `features/` or `components/`, a script in the repo
  root instead of `scripts/`, a doc that isn't under `docs/`).
- **Possible dead files** — before flagging anything as orphaned, grep
  the rest of the repo for imports/references to it. Zero hits makes it
  a *candidate* to ask about, not a verdict to act on — a file can be
  legitimately unreferenced-yet-intentional (a WIP feature doc, a
  reference asset).
- **OS/editor junk** — `.DS_Store`, editor swap files, anything that
  should be in `.gitignore` but isn't.

Do NOT flag `design-reference/` vs `design-reference-v2/` as duplicates
to merge — CLAUDE.md treats the v2 bundle as the current design source
for the public site / user panel / agency panel pages it covers, with
the original `design-reference/` still authoritative for pages it
doesn't. If in doubt which bundle governs a given page, ask rather than
picking one.

### 2. Present a plan before touching anything

Show a table: path, what's wrong with it, proposed action
(move / rename / delete / leave alone — needs a decision), and why.
Group by confidence — "clearly a stray temp file" is a different
conversation than "might be dead code, couldn't find any references."

### 3. Confirm, then act

This project's own risk rules apply here like anywhere else in the repo:
deletions and moves are hard to reverse, so list every affected path and
get an explicit go-ahead before running anything destructive. Prefer
`git mv` over `mv` for tracked files so history survives the move. Never
batch-approve "everything in the plan" on the user's behalf — if they
say yes to the plan as shown, that's fine, but don't silently expand
scope beyond what was shown.

### 4. Show the result, don't commit it for them

After executing approved changes, run `git status` (and `git diff
--stat` for renames) so the user can see exactly what moved. Committing
and pushing are separate, visible actions the user should explicitly ask
for — this skill's job ends at "the tree is clean and here's the diff,"
not "and I pushed it."

## Phase 2 — Start the code review

Once the tree is organized (or the user says to skip straight to this
phase), the review should be scored against this repo's *own* rules, not
generic ones — CLAUDE.md is unusually specific about what "correct"
means here. Before reviewing, pull the relevant slice of CLAUDE.md into
context and use it as the checklist, e.g.:

- Money: integer IRR, never a float, only through the shared money
  utility; balance changes go through the double-entry ledger, never a
  direct `UPDATE`.
- Every endpoint: class-validator DTOs, auth guard, per-resource
  authorization (not just UI hiding), `@nestjs/swagger` decorators.
- TypeScript strict, no `any`; API responses use the one
  `{ success, data?, error? }` envelope; error codes come from
  `common/errors.ts`, user-facing text is Persian.
- Management panels: real data only — no seeded/demo arrays copied into
  frontend code, no fabricated rows when the DB is empty (design empty
  state instead).
- Booking/seat logic: state machine transitions transactional and
  idempotent, seat locking via `FOR UPDATE`/optimistic locking, HELD
  10-minute TTL respected.
- i18n/locale: staff panels stay Persian/RTL only; public+user+agency
  respect the fa/en/ar switch and `localStorage`-first preference read;
  Jalali dates for fa; LTR spans for flight/airport codes and Latin
  names.
- Security/observability: no `console.log`, no secrets/PII in logs,
  Pino structured logging, rate limiting on auth/OTP/money endpoints,
  argon2/bcrypt + 2FA for staff.
- Testing: a feature isn't "done" without its
  `docs/features/<name>.md` checklist backed by passing tests — flag
  code changes that aren't.

For the actual review mechanics (walking the diff, reporting findings),
hand off to this environment's own review tooling rather than
reinventing it:
- Reviewing local/uncommitted changes → use `/code-review`.
- Reviewing an open PR → use `/review`, or `subscribe_pr_activity` if the
  user wants ongoing monitoring.

This skill's contribution to phase 2 is making sure the review is framed
around blujet's actual rules above, not a generic pass — feed that list
in as context when invoking the review rather than treating it as a
separate deliverable.

Before calling anything reviewed and done, remind the user of this
repo's own gate: `npm run lint && npm run typecheck` clean in both
`frontend/` and `backend/`, relevant tests passing — CLAUDE.md is
explicit that "looks like it works" is not a finished feature.
