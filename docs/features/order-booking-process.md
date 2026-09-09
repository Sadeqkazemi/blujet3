# Order/Booking process boundary — read-only shadow slice

این برش، قرارداد مستقل Order/Booking را بدون جداکردن writer هسته آماده می‌کند.
Core Platform همچنان تنها مالک ایجاد Order، قفل/آزادسازی صندلی، انقضای Hold،
پرداخت و تمام تغییر وضعیت‌ها است. فرآیند جدید فقط projection عملیاتی سفارش را
می‌خواند و هیچ فرمان فروش یا inventory اجرا نمی‌کند.

## قرارداد داخلی

- `GET /health/live` و `GET /health/ready` فقط برای شبکهٔ داخلی هستند.
- `GET /internal/v1/order-booking/holds/due?asOf=<UTC>&limit=50` فهرست
  محدود Holdهایی را که تا زمان UTC داده‌شده منقضی شده‌اند، صرفاً برای مشاهده
  برمی‌گرداند. حذف/انقضای واقعی همچنان در worker تراکنشی Core انجام می‌شود.
- `GET /internal/v1/order-booking/orders/:reference` وضعیت سفارش، مبالغ IRR،
  snapshot سگمنت‌ها، تعداد مسافر هر سگمنت و تاریخچهٔ lifecycle را بدون PII
  برمی‌گرداند؛ `reference` می‌تواند UUID یا PNR باشد.
- همهٔ مسیرها با `X-Internal-Token` مستقل محافظت می‌شوند. مسیرهای عمومی
  `/api/v1/**` و Gateway تغییری نمی‌کنند.

## مرز داده و rollback

- نقش `blujet_order_booking_reader`، `NOINHERIT` و
  `default_transaction_read_only=on` است و فقط چهار relation در schema
  `orders` را می‌خواند.
- worker فقط `ORDER_BOOKING_DATABASE_URL` را دریافت می‌کند و migration یا
  credential نویسنده ندارد.
- Compose profile با نام `order-booking` پیش‌فرض خاموش است.
- rollback با حذف profile/credential انجام می‌شود؛ schema، داده و writerهای
  Core دست‌نخورده باقی می‌مانند.

## چک‌لیست پذیرش

- [x] فرآیند مستقل، health/readiness و احراز هویت داخلی اضافه شد —
  `order-booking-worker-health.controller.spec.ts` و
  `order-booking-internal-auth.guard.spec.ts`.
- [x] status سفارش و صف Hold با IRR رشته‌ای و زمان UTC ارائه شد —
  `order-booking-read.service.spec.ts`.
- [x] projection هیچ نام، تماس، کد ملی، پاسپورت یا PII مسافر نمی‌دهد —
  `order-booking-read.service.spec.ts` و محدودیت relationهای نقش دیتابیس.
- [x] نقش least-privilege با exact SELECT و اثبات نبود write/DDL اضافه شد —
  `provision-order-booking-reader-role.spec.ts` و job اختصاصی CI.
- [x] تست‌های 401، 400، 404، مسیر write ناموجود و container در CI ثبت شد —
  `order-booking.http.spec.ts` و job `order-booking`.
- [x] هیچ migration، dual-write، انقضای Hold یا تغییر وضعیت خارج از Core انجام
  نشد و هیچ دیپلوی سرور در این فاز نیست.
