# Core commerce events, idempotency, Saga and reconciliation

این فاز چهار کنترل را در مرز تراکنشی Core به هم متصل می‌کند. `Order`،
`Inventory` و `Payment` همچنان یک تراکنش ACID هستند؛ Saga برای side-effectهای
پس از commit و ورود امن به تطبیق دستی است، نه برای شکستن تراکنش فروش صندلی.

## شواهد اجرایی

- [x] ایجاد hold سفارش با همان تراکنش، یک AuditLog واقعی، رویداد typed
  `OrderCreated` و ردیف رمز‌شدهٔ `orders.commerce_outbox_events` را ثبت می‌کند.
- [x] تأیید پرداخت و صدور بلیت پس از commit کامل، رویدادهای
  `PaymentConfirmed` و `TicketIssued` را با idempotency key پایدار ثبت می‌کند.
- [x] ثبت درخواست استرداد، شاهد immutable، رویداد `RefundRequested` و اجرای
  Saga مستقل استرداد را در یک تراکنش ثبت می‌کند.
- [x] تکرار همان فرمان/رویداد همان نتیجه را نگه می‌دارد؛ payload متفاوت با همان
  کلید، `IDEMPOTENCY_PAYLOAD_MISMATCH` می‌دهد. این کنترل‌ها در booking، payment،
  refund، outbox و inbox هم‌زمان اعمال می‌شوند.
- [x] `orders.commerce_saga_executions` برای هر aggregate یک اجرای یکتا دارد؛
  وضعیت‌های `STARTED`، `COMPLETED` و `COMPENSATION_REQUIRED`، مرحله، correlation
  و failure code را نگه می‌دارد.
- [x] خطای fulfilment یا استرداد، عملیات مالی جدید را خودکار تکرار نمی‌کند؛
  Saga را به `COMPENSATION_REQUIRED` و رکورد عملیاتی را به
  `REVIEW_REQUIRED` می‌برد تا reconciliation دستی انجام شود.
- [x] Outbox و Saga هر دو به همان transaction manager فراخواننده متصل‌اند؛
  rollback کسب‌وکار، Audit، event و Saga را با هم rollback می‌کند.

## قرارداد دیتابیس

Migration `1792243200000-CommerceSagaExecutions` جدول زیر را اضافه می‌کند:

`orders.commerce_saga_executions(id, sagaType, aggregateId, correlationId,
idempotencyKey, status, currentStep, failureCode, createdAt, updatedAt)`

روی `(sagaType, aggregateId)` unique index و روی `(status, updatedAt)` index
وجود دارد. constraintهای نوع، وضعیت و الزام failure code از ثبت state نامعتبر
جلوگیری می‌کنند. جدول هیچ PII، مبلغ یا موجودی را کپی نمی‌کند و foreign key به
دامنهٔ دیگر ندارد.

## مرزهای باز

- اتصال واقعی NIRA/DCS بعد از دریافت قرارداد نیرا.
- callback و reconciliation واقعی PSP بعد از دریافت مستندات PSP و sandbox.
- فعال‌سازی production، TLS/mTLS، replica/failover و replay عملیاتی بعد از
  آماده‌شدن سرور و تأیید عملیات.
- DLQ خودکار تا زمان تصویب retention، retry و replay operator فعال نمی‌شود؛
  consumer فعلی fail-closed باقی می‌ماند.

## تست و انتشار

Migration باید در CI روی PostgreSQL اجرا شود و تست‌های unit/integration باید
این موارد را پوشش دهند: شروع یکتا، replay، mismatch، تکمیل، شکست به
`COMPENSATION_REQUIRED` و rollback اتمیک. این فاز هیچ deploy یا تغییر مسیر
عمومی `/api/v1/**` ندارد.
