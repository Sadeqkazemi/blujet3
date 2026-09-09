# Ops/Admin process boundary — read-only cartable slice

این برش، نخستین مرز اجرایی مستقل `ops-admin` را بدون انتقال writerهای فعلی
کارتابل ایجاد می‌کند. Core Backend همچنان تنها مالک ایجاد، ارجاع، پاسخ، انتقال
و تعیین تکلیف کارتابل است؛ فرآیند جدید فقط متادیتای عملیاتی صف را می‌خواند و
هیچ فرمانی روی Order، Inventory، Payment یا Ledger اجرا نمی‌کند.

## قرارداد داخلی

- `GET /health/live` و `GET /health/ready` فقط برای شبکهٔ داخلی هستند.
- `GET /internal/v1/ops-admin/cartable/summary` شمارش صف را بر اساس category و
  status، تعداد خوانده‌نشده و قدیمی‌ترین زمان هر گروه برمی‌گرداند.
- `GET /internal/v1/ops-admin/cartable/tasks?status=OPEN&category=ADMIN&limit=50`
  یک فهرست محدود از شناسه‌ها و متادیتای مسیریابی صف برمی‌گرداند.
- همهٔ مسیرهای داخلی با `X-Internal-Token` مستقل محافظت می‌شوند. مسیرهای عمومی
  `/api/v1/**` و Gateway تغییری نمی‌کنند.

## کمینه‌سازی داده و مرز دسترسی

نقش `blujet_ops_admin_reader` فقط ستون‌های `id`، `assigneeId`، `category`،
`sourceType`، `sourceId`، `status`، `resolvedAt`، `readAt` و `createdAt` جدول
`ops.cartable_tasks` را می‌خواند. عنوان، شرح، پیوست، فرستنده، متن نتیجه،
conversation و تمام ستون‌های `identity.users` خارج از credential هستند.

فرآیند migration اجرا نمی‌کند، `default_transaction_read_only=on` دارد، مالک
هیچ relation نیست و هیچ مجوز write، sequence یا DDL دریافت نمی‌کند. شناسهٔ
assignee صرفاً یک UUID پایدار برای سنجش توزیع صف است و با User join نمی‌شود.

## فعال‌سازی و rollback

- Compose profile با نام `ops-admin` پیش‌فرض خاموش است.
- فعال‌سازی به secretهای مستقل `OPS_ADMIN_DATABASE_PASSWORD` و
  `OPS_ADMIN_INTERNAL_TOKEN` نیاز دارد.
- rollback با توقف profile و rotate/revoke کردن credential انجام می‌شود؛ داده،
  schema و writerهای Core بدون تغییر می‌مانند.

## چک‌لیست پذیرش

- [x] فرآیند مستقل، health/readiness و احراز هویت داخلی اضافه شد.
- [x] summary و task queue محدود، بدون متن و PII مستقیم، ارائه شد.
- [x] نقش دیتابیس exact-column و فقط‌خواندنی با اثبات نبود write/DDL اضافه شد.
- [x] تست‌های 401، 400، مسیر write ناموجود، role و container در CI ثبت شد.
- [x] هیچ migration، dual-write، public cutover یا deploy سرور انجام نشد.
