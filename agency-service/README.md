# BluJet Agency — A6.4 read boundary

Independent NestJS/TypeORM service over the existing PostgreSQL `agency` schema.
This slice returns minimized profile and invoice projections, not the complete
portal. The current backend remains the only business writer and public request handler.
No public route is switched to this service; no migration or production grant
is applied, and no invoice/credit/reservation/payment command exists here.

## Internal contract

All data routes require `X-Internal-Token` and `X-Agency-Id` equal to the path
agency UUID. The tenant assertion must originate from an authenticated AGENCY
session in the trusted backend, never a browser-selectable header. It is not a
cryptographic proof of an end-user session. Compromise of the trusted caller
or its service credential is outside this header-matching isolation guarantee.
Only internal network callers may reach the service; never add a public proxy.

- `GET /internal/v1/agencies/:agencyId/profile`: agencyId, city, tier, joinedAt,
  suspendedAt. No manager name, address, contacts, license or suspension reason.
- `GET /internal/v1/agencies/:agencyId/invoices?page=1`: `{items,total,page,pageSize}`,
  ten rows per page, page 1..1000, issuedAt DESC/id DESC. Total is a decimal
  string scoped to the same tenant and snapshot as the returned items.
- `GET /internal/v1/agencies/:agencyId/invoices/:invoiceId`: owned invoice only.
  Fields: id, invoiceNo, amountIrr, status, issuedAt, dueAt, paidAt. No free text,
  issuer identity, booking data, passenger data or payment ledger is selected.
- `GET /health` and `/ready`: safe service/version/commit and column-readiness.

Agency identity remains `agency_profiles.userId` (one account per agency).
All data routes check the owner assertion before DB access. Missing profiles
return 404; foreign and absent invoice IDs use the same 404. Existing empty
profiles yield empty pages. Invalid input: 400; service token: 401; owner: 403;
safe driver failures: 500; readiness: 503. Data responses are `no-store` with
the standard success/error envelope and X-Request-Id.

Money remains exact integer IRR strings, including beyond JS safe integer.
UTC timestamps are formatted from the existing timestamp-without-time-zone
columns. Suspension metadata does not authorize login/sales/Partner API use.
Temporary UAT accounts without profiles return 404; the existing public backend
retains its own UAT compatibility behavior. This is not a drop-in public API.

## Local validation

Use Node 22 and the lockfile; dependencies match the existing Loyalty service.
Prepare an isolated `_test` database with the backend's existing migrations.
No seed is required: tests create and clean only their own fixture rows and
an ephemeral restricted LOGIN role. The fixture writer needs role-creation
privileges; the real application test connection receives only column SELECT.
Tests never run migrations or change production data themselves.

```sh
npm ci
npm run lint:check
npm run typecheck
npm run build
npm run openapi:export
npm test
npm run test:e2e
```

E2E defaults to the repository's local `blujet_test` credentials. Set
`AGENCY_DATABASE_URL` to another explicitly named `_test` database if needed.
`openapi:export` creates `docs/openapi.json` from the built module without any
DB/network connection; the placeholder data source exists only in this dev
schema-generation script, not in runtime code. No Swagger UI is published.

For manual runtime, copy `.env.example` to `.env`, supply a separately approved
reader credential and random service token, build and run `npm run start:prod`.
The optional `docker-compose.agency.yml` is local-only, opt-in and exposes no
host ports. It is not included by default startup or production deployment.

## Reader provisioning gate

Before a separately approved deployment, provision a dedicated non-superuser,
non-owner, non-inheriting role with no memberships, CREATE, write or other-domain
privileges. Audit effective PUBLIC privileges and executable SECURITY DEFINER
routines as well; column grants alone are not a complete cluster security audit.
Give only schema USAGE on `agency` and SELECT on:

- `agency_profiles`: userId, city, tier, joinedAt, suspendedAt.
- `agency_invoices`: id, agencyId, invoiceNo, amountIrr, status, issuedAt, dueAt,
  paidAt.

Set `default_transaction_read_only=on`. The service also sets read-only mode
and UTC per connection, with two-second statement/connection timeouts and a
four-connection pool. Every data read uses a READ ONLY / REPEATABLE READ
transaction; schema sync and automatic migrations are disabled. This does not
replace proper ACLs. E2E proves forbidden writes/PII reads still fail even when
session read-only is off. Shared-reader tenant isolation is enforced by SQL
predicates, not PostgreSQL RLS. Grant provisioning is not automated by this code.

Representative parity against current backend projections, production credential
review, owner-approved public integration, and deployment remain separate gates.
Stopping this unused internal reader does not affect the current public portal.
