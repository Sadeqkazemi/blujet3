# Ticketing/Refund process boundary — read-only shadow slice

این برش، مرز اجرایی مستقل برای Ticketing و Refund را آماده می‌کند؛ منبع
حقیقت همچنان Core Platform، PostgreSQL و همان تراکنش ACID است. سرویس جدید فقط
خواندنی است و تا دریافت قرارداد نیرا/PSP هیچ صدور، ابطال، استرداد مالی یا
تغییر وضعیت انجام نمی‌دهد.

## قرارداد داخلی

- `GET /health/live` و `GET /health/ready` فقط در شبکهٔ داخلی سرویس قابل دسترس
  هستند.
- `GET /internal/v1/ticketing-refund/orders/:reference/status` با
  `X-Internal-Token`، وضعیت سفارش، مدارک بلیت و وضعیت couponها را بدون PII
  برمی‌گرداند.
- `POST /internal/v1/ticketing-refund/orders/:id/refund-quote` با
  `X-Internal-Token` و `ownerId`، همان quote استرداد Core را محاسبه می‌کند؛
  این endpoint هیچ ردیفی ایجاد یا تغییر نمی‌دهد.
- مسیرهای عمومی `/api/v1/**`، پرداخت، صدور، stock و استرداد مالی تغییر نمی‌کنند.
- flag یا اتصال Gateway برای cutover این برش فعال نمی‌شود؛ فعال‌سازی فقط پس از
  قرارداد تأییدشدهٔ نیرا/PSP و تست UAT مجاز است.

## چک‌لیست پذیرش

- [ ] سرویس به‌صورت مستقل build و اجرا می‌شود و فقط در profile داخلی Compose
  قرار دارد — job `ticketing-refund` در `.github/workflows/ci.yml` و
  `Dockerfile.ticketing-refund-worker`.
- [ ] نقش دیتابیس non-owner، `NOINHERIT`، `default_transaction_read_only=on`
  و فقط SELECT روی relations فهرست‌شده دارد — `provision-ticketing-refund-reader-role.spec.ts`.
- [ ] readiness نقش، read-only بودن، نبود ownership/membership و نبود DDL را
  fail-closed بررسی می‌کند — `ticketing-refund-worker-health.controller.spec.ts`.
- [ ] status برای سفارش موجود دادهٔ واقعی و بدون PII می‌دهد و سفارش ناموجود
  `404` برمی‌گرداند — `ticketing-refund.controller.spec.ts`,
  `ticketing-refund.http.spec.ts` و job `ticketing-refund` در CI.
- [ ] quote معتبر همان محاسبهٔ `RefundPenaltyRule` در Core را می‌دهد و برای
  owner اشتباه `404` است — `ticketing-refund.controller.spec.ts`,
  `ticketing-refund.http.spec.ts` و تست‌های Core refund.
- [ ] نبود توکن `401`، بدنهٔ نامعتبر `400` و مسیر apply/صدور در worker وجود
  ندارد — `ticketing-refund-internal-auth.guard.spec.ts`,
  `ticketing-refund.controller.spec.ts`, `ticketing-refund.http.spec.ts` و job
  `ticketing-refund` در CI.
- [ ] هیچ migration، dual-write، اتصال واقعی نیرا/PSP یا deploy سرور انجام
  نمی‌شود؛ rollback با حذف profile و credential worker ممکن است.

## ورودی‌های خارج از این برش

مدل stock بلیت/EMD، قرارداد DCS/نیرا، callback PSP، پرداخت واقعی، exchange/void
و write cutover عمداً تا دریافت مستندات معتبر و تصمیم مالک محصول خارج هستند.
