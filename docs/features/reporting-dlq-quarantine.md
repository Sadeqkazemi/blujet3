# Reporting poison-message quarantine and operator recovery

این برش مسیر dead-letter را داخل مالکیت دیتابیس Reporting پیاده می‌کند؛ هیچ
payload خام، header، key، متن خطا یا PII در رجیستری ذخیره نمی‌شود. Core، Order،
Inventory و Payment تغییری نمی‌کنند و مصرف‌کننده پیش‌فرض خاموش می‌ماند.

## سیاست قطعی

- `REPORTING_DLQ_ENABLED=false` پیش‌فرض است.
- سقف تلاش برای یک `(consumerGroup, topic, partition, offset)` برابر ۳ و قابل
  تنظیم در بازهٔ ۲ تا ۱۰ است.
- هر شکست فقط fingerprint SHA-256، event ID در صورت parse موفق، مرحلهٔ امن
  `TRANSPORT|PROJECTION`، تعداد تلاش و زمان UTC را ثبت می‌کند. خطای ACK چون
  projection قبلاً موفق بوده poison data شمرده نمی‌شود.
- پیش از رسیدن به سقف، offset ACK نمی‌شود. در سقف، رکورد `QUARANTINED` می‌شود و
  همچنان ACK نمی‌شود؛ بنابراین تصمیم انسانی اجباری است.
- اپراتور می‌تواند با token داخلی مستقل و reason اجباری، `RETRY_APPROVED` یا
  `SKIP_APPROVED` ثبت کند. retry همان offset نگه‌داشته‌شده را دوباره پردازش
  می‌کند. skip در تحویل بعدی checkpoint را ثبت و سپس offset را ACK می‌کند.
- موفقیت projection یک failure قبلی را `RESOLVED` می‌کند. skip نهایی
  `SKIPPED` است و در رجیستری باقی می‌ماند.
- اگر ثبت failure، ثبت checkpoint یا ACK شکست بخورد، مسیر fail-closed است و
  offset جلو نمی‌رود. ACK-gap با همان رکورد durable و idempotent بازیابی می‌شود.

## قرارداد عملیاتی داخلی

- `GET /internal/v1/reporting/dlq?status=QUARANTINED&limit=50`
- `POST /internal/v1/reporting/dlq/:id/retry` با
  `{ operatorId, reason }`
- `POST /internal/v1/reporting/dlq/:id/skip` با
  `{ operatorId, reason }`

این مسیرها فقط در فرآیند مستقل Reporting ارائه می‌شوند و با
`X-Internal-Token = REPORTING_DLQ_OPERATOR_TOKEN` محافظت می‌شوند. پاسخ‌ها topic،
offset، payload، header، key، خطای خام یا credential را افشا نمی‌کنند.

## نگهداری و replay

رجیستری metadata حذف خودکار ندارد؛ retention نهایی باید با سیاست آرشیو سازمان
هماهنگ شود. replay در این برش فقط پیش از ازبین‌رفتن offset در retention موضوع
Kafka ممکن است. انتشار مجدد payload از یک DLQ topic یا historical backfill
عمداً انجام نمی‌شود، چون به سیاست retention و ACL عملیاتی broker نیاز دارد.

## پذیرش

- [x] migration expand-only و entity رجیستری اضافه می‌شود.
- [x] شمارش تلاش و transitionها با قفل ردیف و idempotency کنترل می‌شود.
- [x] handler قبل از ACK تصمیم durable را ثبت می‌کند.
- [x] API اپراتور bounded، توکن‌دار و بدون payload است.
- [x] تست واحد و PostgreSQL رفتار retry/quarantine/recovery را اثبات می‌کند.
- [x] هیچ deploy، فعال‌سازی flag یا اتصال جدید خارجی انجام نمی‌شود.
