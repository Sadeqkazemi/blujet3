# Offer/Pricing process boundary

## Decision

BluJet extracts Offer/Pricing as a separately runnable NestJS process before
extracting Order or Inventory. The process is stateless and read-only: it may
search authoritative availability, calculate the current IRR price, and issue
or reprice a seller-bound HMAC Offer with a maximum lifetime of 15 minutes.

The process does **not** expose Hold, create an Order, reserve a seat, write an
outbox event, or run TypeORM migrations. `POST /internal/v1/offers/:offerId/hold`
remains in Core, where inventory rows are locked and the price is verified in
the same ACID transaction. The shared Offer signing secret lets Core verify an
Offer without calling the read process during that transaction.

## Runtime contract

- Entrypoint: `dist/offer-worker.main.js`
- Health: `GET /health/live` and `GET /health/ready`
- Internal API: `POST /internal/v1/offers/search` and
  `POST /internal/v1/offers/:offerId/reprice`
- Authentication: constant-time comparison of `X-Internal-Token` with
  `OFFER_INTERNAL_TOKEN`
- Database: `OFFER_DATABASE_URL`, using a non-owner LOGIN role with exact
  `SELECT` grants and `default_transaction_read_only=on`
- Offer signing: the existing `CORE_OFFER_SIGNING_SECRET` and
  `CORE_OFFER_TTL_SECONDS` (60–900 seconds; production target 900)
- The process never uses `DATABASE_URL` and never starts a writer/expiry worker.

The read role needs only the relations reached by the quote path in the
`inventory`, `orders`, `agency`, and the registered-price relation in `ops`.
Provisioning is an operator action,
not a TypeORM migration. Its verification must prove no ownership, DDL, write,
sequence, Identity, Payment, Loyalty, Notify, Experience, Reporting, or Audit
access.

## Cutover and rollback

The existing public path `/api/v1/search/offers` is unchanged. Its independent
exposure gate remains `CORE_OFFER_PUBLIC_ENABLED`. Once exposed, Core chooses
the implementation with `OFFER_SERVICE_ENABLED`:

- `false` or absent: calculate locally in Core (rollback/default path);
- `true`: call `OFFER_SERVICE_URL` with `OFFER_INTERNAL_TOKEN` and the bounded
  `OFFER_REQUEST_TIMEOUT_MS`.

An enabled remote path fails closed. It must not silently fall back to a local
quote after timeout/error because that would hide divergence during cutover.
Rollback is the explicit flag change. Before production enablement, run shadow
parity for representative USER/AGENCY, ancillary, connection, depleted-pool,
expired-Offer, and changed-price cases.

## Acceptance

- [x] Preserve public and Core Hold routes.
- [x] Add a separately runnable, authenticated, read-only Offer process.
- [x] Add explicit default-off Core HTTP cutover and rollback.
- [x] Add a least-privilege PostgreSQL reader provisioner/verifier.
- [x] Prove shared search/reprice behaviour and prove that writes are rejected.
- [ ] Build the opt-in container without deploying it.
- [ ] Merge only after review and explicit approval.
