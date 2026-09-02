# Microservices architecture v1.1 — phase 5 domain schemas

Status: implementation and local rehearsal complete; merge and deployment are
not approved.

This phase implements architecture phase 4 from
`docs/architecture/blujet-architecture-v1.1.md`: physical table ownership is
made explicit with PostgreSQL schemas while every domain still uses the same
PostgreSQL 16 primary. It does not extract another process and it does not
split the transactional Core Platform.

## Compatibility contract

- Public HTTP routes, DTOs, response envelopes, authentication and monetary
  wire values do not change.
- `inventory`, `orders` and `payments` stay in one Core Platform transaction
  boundary and may retain database foreign keys across those three schemas.
- Existing foreign keys, indexes, defaults, sequences, row data and enum types
  are preserved by `ALTER TABLE ... SET SCHEMA`; tables are not copied and
  there is no dual-write.
- A simple updatable compatibility view with the old table name is created in
  `public` for every moved table. This protects unqualified legacy reads and
  ordinary inserts/updates during the rollout window.
- PostgreSQL enum types and the TypeORM migration-history table remain in
  `public` in this expand step. Moving or replacing them requires a later
  contract migration after all old binaries are retired.
- Raw runtime SQL in the new release must use the owning schema explicitly.
  The application must not set a broad `search_path` as a substitute for
  ownership.
- Rollback order is database migration revert first, then application rollback.
  Revert drops compatibility views and moves the same physical tables back to
  `public`, so it does not copy or discard business data.

`INSERT ... ON CONFLICT` cannot rely on a compatibility view's constraints.
During a mixed-version rollout, jobs/endpoints in the previous binary that use
raw unqualified upserts must be quiesced until the new binary is active. A
failed rollout is reverted at the database before the previous binary resumes.

## Ownership map

| Schema | Owner | Tables |
| --- | --- | --- |
| `identity` | Identity | `users`, `refresh_tokens`, `two_factor_challenges`, `password_reset_events`, `security_policy`, `customer_identity_verifications` |
| `inventory` | Core Platform | `aircraft_cabins`, `aircraft_definitions`, `aircraft_seat_maps`, `aircraft_seats`, `airports`, `ancillary_services`, `cabin_fares`, `charter_commitments`, `fare_rules`, `flight_charge_rules`, `flight_instances`, `flight_schedule_templates`, `flights`, `routes`, `schedules`, `seat_locks`, `travel_extra_settings` |
| `orders` | Core Platform | `bookings`, `passengers`, `saved_flights`, `saved_passengers` |
| `payments` | Core Platform | `bank_loan_applications`, `bank_loan_customer_profiles`, `bank_loan_wallet_credits`, `bank_loan_webhook_events`, `ledger_entries`, `pay_idempotency_records`, `payment_reconciliations`, `promo_codes`, `promo_redemptions`, `refund_penalty_rules`, `refund_requests`, `saved_bank_accounts`, `wallet_entries` |
| `loyalty` | Loyalty | `club_card_requests`, `club_members`, `club_points_entries`, `club_tier_rules`, `customer_referrals`, `price_locks` |
| `agency` | Agency | `agency_allotments`, `agency_api_keys`, `agency_credit_lines`, `agency_credit_requests`, `agency_documents`, `agency_invoices`, `agency_membership_requests`, `agency_messages`, `agency_profiles`, `agency_request_otps`, `agency_seat_commitments`, `agency_seat_request_flights`, `agency_seat_requests`, `agency_webservice_requests` |
| `notify` | Notify | `notifications`, `sms_logs` |
| `experience` | Experience | `blog_posts`, `careers_settings`, `contact_messages`, `job_applications`, `job_postings`, `site_content_blocks`, `site_destination_highlights`, `site_media_assets`, `site_route_highlights`, `stored_files`, `support_tickets`, `survey_invites`, `survey_questions`, `survey_responses`, `survey_settings` |
| `ops` | Core operations | `backup_records`, `cartable_tasks`, `chair_report_permissions`, `employee_permissions`, `external_service_configs`, `fare_pricing_proposals`, `flight_reviews`, `internal_services`, `manager_messages`, `manager_referral_recipients`, `manager_referral_reports`, `manager_referrals`, `notify_outbox_events`, `panel_access_flags`, `permissions`, `system_settings` |
| `audit` | Audit | `ai_usage_logs`, `audit_logs` |

`notify_outbox_events` remains Core-owned infrastructure: producers insert it
in the same transaction as business state, while Notify only claims delivery.
It therefore belongs to `ops`, not to the Notify writer schema.

## Migration and rollout

1. Take and verify a database backup; record row counts and the deployed SHA.
2. Stop old raw-upsert workers, then run the single transactional migration.
3. Verify every mapped object is a base table in its owner schema and a view in
   `public`; verify unmapped business tables are zero.
4. Start the schema-qualified release and run auth, search, hold/booking,
   payment/refund, agency, loyalty, Experience and Notify smoke tests.
5. Exercise one Core transaction that crosses inventory/orders/payments and
   verify rollback leaves no partial rows.
6. Keep the compatibility views for at least one approved release window.
   Removing them is a separate contract phase and migration.

## Acceptance checklist

- [x] Documentation and the complete table ownership inventory are reviewed.
- [x] Migration `up` creates schemas, moves every table once and creates every
      compatibility view without copying rows.
- [x] Migration `down` restores every table to `public` without data loss.
- [x] Backend, Experience and Notify TypeORM metadata points to owner schemas.
- [x] Runtime raw SQL is schema-qualified and no new cross-service ORM join is
      introduced.
- [x] Unit contract tests prove migration symmetry and metadata parity.
- [x] A disposable PostgreSQL rehearsal proves migration up/down, view DML,
      foreign keys, row counts and schema parity.
- [x] Typecheck, tests, production builds, changed-file read-only lint and diff
      checks pass. The repository-wide backend lint still reports pre-existing
      line-ending/style findings outside this phase's changed lines.
- [ ] No merge or deployment occurs without separate explicit owner approval.

## Local evidence (2026-09-02)

- 95 owner-schema base tables, 95 `public` compatibility views, zero unmapped
  public business base tables and 95 preserved cross-schema foreign keys.
- A row written before migration survived `up` and `down`; compatibility-view
  insert/update/delete reached the owner table.
- A deliberately rolled-back transaction spanning `inventory`, `orders` and
  `payments` left zero partial rows.
- Backend: 407 unit tests and 78 focused schema/domain E2E tests passed.
- Notify: 13 unit tests and 4 E2E tests passed.
- Experience: 12 unit tests and 20 E2E tests passed.
- All three packages passed typecheck and production build; changed-file lint
  and `git diff --check` passed.
