# TypeORM migration — Phase 5: auth, profile, it-manager

Phase 5 of the Prisma → TypeORM migration plan. The first phase touching
real session/token-issuance code paths: staff login + mandatory 2FA,
customer phone+OTP login, agency login, JWT issuance, refresh-token
rotation with reuse (theft) detection, step-up re-authentication, and
site-wide forced logout. Converts `auth`, `profile` (incl. PII —
national ID/passport/bank accounts — and identity-verification review
queue), and `it-manager` (incl. employee account creation, security
policy, external service config, backups).

## Modules converted

1. **`auth`** — `AuthService` (924 lines: staff/customer/agency login,
   OTP, email password-reset, refresh, logout, reuse-detection), plus
   `StepUpService` and `MySessionsService`. The refresh-token reuse
   detection path (`refresh()`: a revoked token being replayed → revoke
   the entire family + audit + reject) was ported line-for-line in the
   same order — find → check `revokedAt` → mass-revoke → audit → throw —
   since this is the single highest-value security invariant in the
   whole module.
2. **`profile`** — `ProfileService` (email verify, national-ID/passport
   PII), `IdentityVerificationService` (submission + SITE_ADMIN review
   queue, reads/writes `StoredFile` via the already-converted `files`
   module), `SavedPassengersService`, `BankAccountsService` (the only
   real DB transaction in this phase outside `auth` — "set as default"
   must atomically unset the old default and set the new one).
3. **`it-manager`** — `EmployeesService` (employee account creation is a
   transaction: create the `User` row + bulk-create its
   `EmployeePermission` grants atomically, mirroring Prisma's nested
   `employeePermissions: { create: [...] }` write), `SecurityService`
   (password policy singleton, site-wide logout-all), `ItServicesService`
   (internal/external service config, SMS log), `BackupsService` (real
   `pg_dump`), `ItDashboardService` (read-only KPI aggregation).

## New findings

- **`Repository.manager.transaction()` is the TypeORM equivalent of
  `prisma.$transaction()`.** Used for `BankAccountsService.create()`/
  `update()` (unset-old-default + set-new-default) and
  `EmployeesService.create()`/`resetPassword()` (User write +
  dependent-row write). Pattern: `this.someRepo.manager.transaction(async
  (tx) => { await tx.update(Entity, where, patch); await tx.save(tx.create(Entity, data)); })`
  — no separate `DataSource` injection needed, any repository's
  `.manager` exposes the same connection.
- **This project's `typeorm` build doesn't ship
  `loadRelationCountAndMap`** — confirmed again (first hit in Phase 4);
  not needed this phase, noted for future phases considering it.
- **The `AgencyProfile` ↔ `User` relation is `@ManyToOne` on the owning
  side with no inverse declared on `User`.** Rather than add a mismatched
  inverse (`@OneToOne` pointing at a `@ManyToOne` isn't a valid TypeORM
  pairing, and changing `AgencyProfile`'s own decorator risks an
  unreviewed schema-parity change this late in the migration), every
  call site that used Prisma's `include: { agencyProfile: true }`
  (`agencyLogin`, `requestAgencyPasswordReset`, `refresh()`'s AGENCY
  branch) was ported as two independent queries — fetch `User`, then
  fetch `AgencyProfile` by `userId` — matching what `refresh()` already
  did in the original Prisma code.
- **`verifyAgencyPasswordResetOtp`'s original `include` fetched
  `agencyProfile` but never read it** — confirmed by re-reading the
  method body; the TypeORM version drops the unused fetch entirely
  rather than reproducing dead data-fetching.
- **UUID-generation gap closed for 8 more entities**: `TwoFactorChallenge`,
  `CustomerIdentityVerification`, `SavedPassenger`, `SavedBankAccount`,
  `PasswordResetEvent`, `EmployeePermission` (`.create()` call sites, not
  just relation metadata this time), `ExternalServiceConfig`,
  `BackupRecord`. `User` also gained its `@BeforeInsert()` hook here —
  `EmployeesService.create()` is the second real production `User`
  write path through TypeORM (after `admins.create()` in Phase 4).
- **`SecurityPolicy` is a fixed-id (`id = 1`) singleton**, same
  find-or-create shape as Phase 3's `SiteContentBlock` — no UUID needed,
  just an explicit `updatedAt` on the synthesized first row.
- Same recurring conventions from Phases 3–4 applied throughout: manual
  `updatedAt: new Date()` on every write against an entity with Prisma's
  `@updatedAt` (plain `@Column`, not `@UpdateDateColumn`); `findOneOrThrow`
  for former `findUniqueOrThrow`/`findFirstOrThrow` call sites;
  `ILike`/`In`/`IsNull`/`MoreThan(OrEqual)`/`Not` operators replacing
  Prisma's `contains`/`in`/`null`/`gte`/`gt`/`not` filters.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every Phase 5 file (same 2 pre-existing
  errors / 13 pre-existing warnings elsewhere as Phases 2–4, unrelated;
  incidental `lint --fix` reformatting of unrelated files reverted with
  `git checkout --` before committing).
- `npm test` (unit) — 71/71 passing.
- `npm run test:e2e` — **465/465 passing** against a freshly reset +
  reseeded database, covering every login surface (staff+2FA,
  customer OTP, customer password, agency), refresh-token
  rotation/reuse-detection, step-up re-authentication, session listing/
  revocation, PII profile fields, identity-verification review, saved
  passengers/bank accounts, and every IT-manager surface (employee CRUD +
  permission grants, security policy, external services, backups).
- `git status` — touches only the 3 converted modules' service/module
  files, the 9 entities that gained `@BeforeInsert()`/hooks this phase,
  and this doc. Zero unrelated application files.

## What's next

Phase 6 (per the plan): staff operations — the next non-critical-path
batch. Prisma remains the active ORM for every module not yet converted;
nothing removed until Phase 14.
