# Payment/Reconciliation process boundary — read-only shadow slice

این برش Payment را از مرز تراکنشی Core جدا نمی‌کند. هسته همچنان تنها مالک
پرداخت، لجر، رزرو و reconciliation است؛ worker جدید فقط برای مشاهدهٔ صف
مغایرت و وضعیت پرداخت ساخته می‌شود و هیچ PSP callback، capture، refund یا
تغییر وضعیتی انجام نمی‌دهد.

## قرارداد داخلی

- `GET /health/live` و `GET /health/ready` فقط برای شبکهٔ داخلی هستند.
- `GET /internal/v1/payment-reconciliation/pending?limit=50` صف pending را
  بدون PII و بدون اطلاعات کارت برمی‌گرداند.
- `GET /internal/v1/payment-reconciliation/orders/:reference/status` وضعیت
  رزرو، تلاش‌های پرداخت، reconciliation و ردیف‌های لجر همان سفارش را
  خواندنی برمی‌گرداند؛ `reference` می‌تواند UUID یا PNR باشد.
- همهٔ مسیرهای داخلی با `X-Internal-Token` مستقل محافظت می‌شوند. Gateway و
  مسیرهای عمومی تغییری نمی‌کنند.

## مرز داده و rollback

- نقش `blujet_payment_reconciliation_reader`، `NOINHERIT` و
  `default_transaction_read_only=on` است و فقط چهار جدول موردنیاز را
  `SELECT` می‌کند.
- worker با `PAYMENT_RECONCILIATION_DATABASE_URL` اجرا می‌شود؛ هرگز
  `DATABASE_URL` یا migration دریافت نمی‌کند.
- Compose profile با نام `payment-reconciliation` پیش‌فرض خاموش است.
- rollback با حذف profile/credential انجام می‌شود؛ هیچ جدول یا migration
  جدیدی ایجاد نشده و Core writer دست‌نخورده باقی می‌ماند.

## چک‌لیست پذیرش

- [x] worker مستقل، health/readiness و احراز هویت داخلی اضافه شد.
- [x] صف pending و وضعیت سفارش با IRR به‌صورت رشته و UTC ارائه می‌شود.
- [x] نقش least-privilege با بررسی ownership، write، sequence و DDL اضافه شد.
- [x] تست‌های 401/400/404، read-only و build/container در CI اضافه شد.
- [x] پرداخت واقعی، PSP، callback، refund و هر write عمداً خارج از scope است.
