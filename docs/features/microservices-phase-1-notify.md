# Microservices migration — phase 1 notify extraction

Architecture authority:
`docs/architecture/blujet-architecture-v1.1.md`.

This phase extracts in-app notifications and SMS delivery into an internal
`notify-service`. Browser and mobile clients continue to call the existing
public `/api/v1/notifications/**` contract through the gateway. The backend is
the compatibility facade during the strangler window and forwards authenticated
recipient identity to the internal service; clients never receive or send an
internal service token.

## Internal contract

Every path below is reachable only on the Docker network and requires
`X-Internal-Token`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/internal/v1/events` | Idempotently consume one encrypted outbox event. |
| `GET` | `/internal/v1/notifications` | Recipient-scoped list used by the public compatibility facade. |
| `GET` | `/internal/v1/notifications/unread-count` | Recipient-scoped category counters. |
| `PATCH` | `/internal/v1/notifications/:id/read` | Recipient-scoped idempotent read marker. |
| `PATCH` | `/internal/v1/notifications/read-all` | Mark only the recipient's visible rows read. |
| `GET` | `/internal/v1/notifications/by-entity` | Staff compatibility read for bulletin history. |
| `GET` | `/internal/v1/sms-log` | Masked operational SMS report for the IT facade. |

Outbox event body:

```json
{
  "eventId": "2e4ee2b1-b702-42fe-aeb4-8dddb01d4866",
  "eventType": "NOTIFICATION_CREATED",
  "payloadEncrypted": "base64-authenticated-ciphertext"
}
```

Supported event types are `NOTIFICATION_CREATED` and `SMS_REQUESTED`.
Notification payloads retain the existing category/action/title/body/entity
contract. SMS payloads retain `phone`, `message`, and `messageType`, plus an
encrypted snapshot of the selected provider configuration. Plain phone,
message, OTP, temporary password, and provider credential are never stored in
the outbox row or written to logs.

## Reliability and rollout

- `NOTIFY_INTEGRATION_ENABLED=false` preserves the in-process implementation
  for rollback. Production Compose explicitly enables the service after its
  migrations and health check pass.
- Domain writers persist an encrypted event in `notify_outbox_events`; they do
  not call `notify-service` in the request path.
- A background dispatcher claims pending rows, calls the internal event
  endpoint, and retries with bounded backoff. `eventId`, notification
  `dedupeKey`, and `sms_logs.sourceEventId` make replay idempotent.
- Public notification reads may return `503 NOTIFY_UNAVAILABLE` while the
  service is down. Booking, inventory, payment, refund, and flight state
  changes remain live because notification delivery is asynchronous.
- Existing `notifications` and `sms_logs` tables remain in `public` during
  this phase. Runtime write ownership moves to `notify-service`; the physical
  move into schema `notify` is phase 4 expand/contract work.
- Email delivery is not invented in this phase because the current product has
  no approved email-provider contract. It remains a later notify capability.

## Acceptance checklist

- [x] Existing public notification paths and envelopes are unchanged.
- [x] Internal endpoints reject missing/wrong service identity and invalid DTOs.
- [x] List/read operations enforce recipient ownership and role audience.
- [x] Replayed notification and SMS events do not create a second row/send.
- [x] Backend writes encrypted outbox events and never stores notification/SMS
  payload plaintext in the outbox.
- [x] With notify unavailable, a booking-domain write still completes and the
  pending event remains retryable.
- [x] OTP/SMS and in-app notification delivery run in `notify-service` when the
  integration switch is enabled.
- [x] Health/readiness expose service, version, commit and schema-aware database
  state without secrets.
- [x] Local backend/notify unit, focused E2E, typecheck, build, frontend build,
  migration, YAML and diff checks pass.
- [ ] CI container build and post-deploy Compose smoke checks pass on UAT.
- [x] Phase diff reviewed and owner explicitly approved the merge on
  2026-09-02; deployment remains deferred to a later manual dispatch.
