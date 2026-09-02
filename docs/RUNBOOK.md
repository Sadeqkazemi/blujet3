# RUNBOOK

Operational guide for the blujet production stack (`docker-compose.prod.yml`,
running from `/opt/app` on the server). No domain is configured yet — the
site is served over plain HTTP on the server's IP, behind the frontend's
nginx (see `frontend/nginx.conf`); see `docs/DEPLOY_IP.md` for the full
IP-only deployment guide and how to add a domain + TLS later.

## Reading logs

```bash
cd /opt/app
docker compose -f docker-compose.prod.yml logs -f            # all services
docker compose -f docker-compose.prod.yml logs -f backend    # one service
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f ml-service
docker compose -f docker-compose.prod.yml logs -f db
```

## Checking health

```bash
curl -i http://SERVER_IP/health
```

Should return `200` with DB connectivity status and the build/commit
version. The backend's port 3000 is not published directly (Phase 2
traffic hardening — everything goes through nginx on :80); an external
uptime monitor should be pointed at `http://SERVER_IP/health`.

Container-level health:

```bash
docker compose -f docker-compose.prod.yml ps
```

## Scaling the backend

See `docs/DEPLOY_IP.md`'s "مقیاس‌پذیری بک‌اند" section —
`docker compose -f docker-compose.prod.yml up -d --build --scale backend=3`.
nginx re-resolves the backend hostname via Docker's embedded DNS, so this
actually spreads load across replicas.

## Restoring a backup

Backups are written nightly by `scripts/backup-db.sh` (via cron) to
`/opt/app/backups/blujet-<timestamp>.sql.gz`, retained 7 days.

To restore into the running `db` service (destructive — stops writes and
overwrites current data):

```bash
cd /opt/app
docker compose -f docker-compose.prod.yml stop backend ml-service
gunzip -c backups/blujet-<timestamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose -f docker-compose.prod.yml start backend ml-service
```

### Monthly restore drill (verify backups are actually restorable)

Once a month, restore the latest dump into a throwaway container and run a
sanity check — never test against the production `db` service:

```bash
docker run -d --name restore-check -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16-alpine
sleep 5
gunzip -c /opt/app/backups/blujet-<latest>.sql.gz | \
  docker exec -i restore-check psql -U postgres
docker exec -it restore-check psql -U postgres -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM bookings) AS bookings;"
docker rm -f restore-check
```

Row counts should look sane (non-zero, roughly matching production). If the
restore fails or counts look wrong, investigate immediately — don't wait
for a real incident to find out backups are broken.

## Rolling back a bad deploy

Deployments are serialized by the GitHub `uat` environment and always check
out the exact workflow commit SHA. The preferred rollback is a reviewed revert
PR to `main`; after merge, the normal workflow deploys that revert commit.

For an active incident only, an operator may temporarily restore the previous
commit on the server while the revert PR is being prepared:

```bash
cd /opt/app
git log --oneline -5              # find the last good commit SHA
git checkout <good-sha>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
git checkout --detach <good-sha>
```

Do not pull or merge `main` on the server. The next approved GitHub Actions
deployment will check out its own exact SHA. The backend container runs
`npm run migration:run:prod` (TypeORM) automatically
on startup (see `backend/docker-entrypoint.sh`) — rolling back code does NOT
undo an already-applied schema migration. Check
`backend/src/database/migrations/` before rolling back a release that touched
the schema, and restore from backup if the migration needs to be reversed.

## First-time server setup

See `docs/DEPLOY_IP.md` for cloning the repo to the server, creating `.env`
from `.env.production.example`, and configuring GitHub Actions secrets
(`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`).

## Initial management-panel accounts

Do not run the development seed in production and do not put a plaintext
password, mobile number, or Kavenegar key in Git/GitHub. The production
bootstrap accepts named account owners, generates a different temporary
password for each account, enables mandatory SMS 2FA, and forces a password
change after first login.

First create `/root/blujet-panel-accounts.json` with mode `600`. Replace every
angle-bracket value with the real account owner's details. Each mobile number
must be real, controlled by that owner, and unique:

```json
[
  { "fullName": "<نام مالک ادمین سایت>", "username": "panel.siteadmin", "role": "SITE_ADMIN", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک مدیر IT>", "username": "panel.it", "role": "IT_MANAGER", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک مدیر بازرگانی>", "username": "panel.commercial", "role": "COMMERCIAL_MANAGER", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک مدیر مالی>", "username": "panel.finance", "role": "FINANCE_MANAGER", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک مدیر ارشد>", "username": "panel.senior", "role": "SENIOR_MANAGER", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک مدیرعامل>", "username": "panel.ceo", "role": "CEO", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" },
  { "fullName": "<نام مالک رئیس هیئت‌مدیره>", "username": "panel.chair", "role": "BOARD_CHAIR", "phone": "<09xxxxxxxxx>", "email": "<email-or-omit>" }
]
```

If an owner has no email, remove the `email` property instead of keeping the
placeholder. Validate the file without touching the database:

```bash
cd /opt/app
docker compose --env-file .env -f docker-compose.prod.yml exec -T backend \
  node dist/database/bootstrap-panel-accounts.js \
  < /root/blujet-panel-accounts.json
```

The dry run must show only the expected username/role pairs. Staff login
cannot work until real SMS delivery works. If Kavenegar is not already active
in the database, read its API key without echoing it or saving it in shell
history, then execute the atomic bootstrap and capture its only password
output in a root-only file:

```bash
umask 077
read -rsp 'Kavenegar API key: ' PANEL_KAVENEGAR_KEY
echo
docker compose --env-file .env -f docker-compose.prod.yml exec -T \
  -e PANEL_ACCOUNT_BOOTSTRAP_CONFIRM=CREATE_BLUJET_PANEL_ACCOUNTS \
  -e PANEL_ACCOUNT_BOOTSTRAP_KAVENEGAR_API_KEY="$PANEL_KAVENEGAR_KEY" \
  backend node dist/database/bootstrap-panel-accounts.js --execute \
  < /root/blujet-panel-accounts.json \
  > /root/blujet-panel-credentials.json
unset PANEL_KAVENEGAR_KEY
chmod 600 /root/blujet-panel-credentials.json
```

If Kavenegar was already configured, the API-key prompt/environment option is
not required. Move the generated temporary credentials into the organization's
password manager, give each password only to its named owner, and remove both
root-only JSON files afterward. A repeated run with any existing username,
mobile, or email is rejected and never resets that account.

## Temporary password-only panel UAT access

This owner-approved exception is used only while Kavenegar delivery is being
repaired. The first successful deployment writes the seven generated
credentials to `/root/blujet-temporary-panel-credentials.json` with mode
`0600`. GitHub Actions never receives or prints its contents. Read it only from
an authenticated root shell:

```bash
cat /root/blujet-temporary-panel-credentials.json
```

The initial database deadline is exactly seven days after creation. The
owner-approved extension v1 moved that existing deadline forward once by seven
days. Owner-approved extensions v2 and v3 each add another seven days to an
active deadline or grant seven days from execution when the identity has
already expired. The absolute safety ceiling is 35 days from account
creation so identities created during different rollout dates can receive the
same full seven-day controlled grant. Extension v3 also restores the exact
reserved synthetic identities to password-only mode if a prior UAT flow changed
their 2FA flag; this normalization is included in the audit metadata and never
applies to ordinary accounts. All extensions record a security audit row for every reserved identity,
revoke current refresh sessions, and leave no credential material in logs.
Repeated deploys do not
recreate, rotate, or re-extend the accounts because
`/root/.blujet-temporary-panel-bootstrap-complete` is retained. After the
deadline, login and refresh are rejected even if the password is correct.

The extension deployments write their non-secret audit output to
`/root/blujet-uat-temporary-access-extension-v1.json` and
`/root/blujet-uat-temporary-access-extension-v2.json`, and
`/root/blujet-uat-temporary-access-extension-v3.json`. Their matching
`.blujet-uat-temporary-access-extension-v1-complete` and
`.blujet-uat-temporary-access-extension-v2-complete`, and
`.blujet-uat-temporary-access-extension-v3-complete` root sentinels make each
grant one-time.

After extension v3, the deployment also runs a one-time shared-password
reconciliation for the exact reserved `uat.*` identities. This repairs a
stored-hash/configured-secret mismatch without changing any access deadline.
It revokes existing refresh sessions, never prints the shared password, and
writes the non-secret result to
`/root/blujet-uat-shared-password-reconciliation-v2.json` (mode `0600`). The
sentinel `/root/.blujet-uat-shared-password-reconciliation-v2-complete` prevents
later deploys from rotating a working password again.

If reconciliation v2 was consumed before the protected GitHub secret was
aligned with the owner-provided UAT credential, the deployment performs one
follow-up reconciliation using
`/root/.blujet-uat-shared-password-reconciliation-v3-complete`. Its non-secret
audit is written to `/root/blujet-uat-shared-password-reconciliation-v3.json`
with mode `0600`; account expiry is still preserved and refresh sessions are
revoked.

Extension v3 originally restored the two phone-login identities using their
`09...` input form, while agency/customer authentication queries canonical
`+98...` values. Deployments therefore run one guarded phone normalization
repair after the shared-password reconciliations. It accepts only the exact
active, unexpired `uat.agency` and `uat.customer` rows with trusted bootstrap/
extension audit provenance, refuses a phone owned by any other user, preserves
password hashes and access deadlines, and revokes their current sessions. Its
non-secret audit is stored at
`/root/blujet-uat-temporary-phone-login-reconciliation-v1.json`; sentinel
`/root/.blujet-uat-temporary-phone-login-reconciliation-v1-complete` prevents
repetition. A failure leaves both accounts unchanged because the repair is one
database transaction.

The temporary passwords are 16-character values containing only English
letters and digits. The owner-approved format migration is deployed once and
uses `/root/.blujet-temporary-panel-password-format-v1-complete` as its
sentinel. It preserves the current expiry, revokes active sessions, and
atomically replaces `/root/blujet-temporary-panel-credentials.json`; read the
new credentials from the same root-only path after deployment. A failed or
partial rotation never replaces that file or writes the sentinel.

As soon as Kavenegar works (or earlier on owner request), disable the accounts
and revoke every active session without deleting referenced audit/business
history:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec -T \
  -e TEMP_PANEL_CLEANUP_CONFIRM=DISABLE_TEMPORARY_PANEL_TEST_ACCOUNTS \
  backend node dist/database/cleanup-temporary-panel-accounts.js --execute
```

Keep the sentinel so a later deployment cannot recreate the exception. After
cleanup, securely delete only the credential file from the server.
# Hosted Sandbox authentication

For a temporary UAT deployment that must use OTP `123456`, set both flags in
the server environment before building/deploying:

```env
AUTH_SANDBOX_ENABLED=true
VITE_SANDBOX_AUTH=true
```

The backend flag accepts the deterministic OTP and tolerates an unavailable
SMS vendor; the Vite flag is build-time and displays the matching hint and
first-login controls. Remove both flags (or set them to `false`) before a real
production launch, then rebuild the frontend image. Ordinary production is
fail-closed by default.

# Central PSS service (pre-cutover)

The central PSS is an internal-only service with its own PostgreSQL database.
Before starting the production Compose stack, set independent, random values
for `PSS_POSTGRES_PASSWORD` and `PSS_INTERNAL_TOKEN` (minimum 32 characters).
The token must match between `backend` and `pss-service` and must never be
printed or sent to a browser.

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 pss-service pss-db
docker compose -f docker-compose.prod.yml exec -T pss-service \
  node -e "require('http').get('http://localhost:3100/health/ready',r=>{process.stdout.write(String(r.statusCode));process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
```

`/health/live` verifies the process and `/health/ready` verifies the independent
database. The service is not published on a host port. Its internal capability
response must continue to report `salesEnabled: false` until the documented
writer-cutover phase is approved and complete. `PSS_INTEGRATION_ENABLED` stays
`false` during Slice 0; enabling it does not itself migrate inventory or sales.

Run PSS migrations through its own container and data source only:

```bash
docker compose -f docker-compose.prod.yml exec -T pss-service \
  npm run migration:run:prod
```

PSS backup/restore and rollback proof remains a mandatory unchecked acceptance
item before any authoritative writer cutover. Do not reuse the website database
backup as a substitute for the separate `pss-db` backup.

Every pull request runs `pss-service/scripts/verify-backup-restore.sh` after PSS
migrations. It creates a custom-format `pg_dump`, restores it into a temporary
database in the isolated CI PostgreSQL container, verifies both reliability
tables and migration history, then removes the temporary database and dump.
