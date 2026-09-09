# Core event schema catalog — additive Kafka contract

این برش برای چهار رویداد متصل‌شدهٔ Core یک شناسهٔ Schema پایدار و کاتالوگ
قابل‌بررسی در کد تعریف می‌کند. هدف، جلوگیری از تغییر خاموش قرارداد میان Core و
Reporting است؛ این برش Schema Registry خارجی، topic جدید یا consumer جدید را
فعال نمی‌کند.

## قرارداد

- `OrderCreated`, `PaymentConfirmed`, `TicketIssued` و `RefundRequested` با
  شناسهٔ `blujet.core-itinerary.<EventType>.v1` منتشر می‌شوند.
- publisher برای این چهار رویداد هدر `event-schema-id` را اضافه می‌کند.
- consumer هدر موجود را با event type تطبیق می‌دهد و مقدار ناشناخته یا متعلق
  به رویداد دیگر را پیش از دسترسی به دیتابیس رد می‌کند.
- نبود هدر فعلاً پذیرفته می‌شود تا پیام‌های v1 موجود در backlog بعد از rollout
  قابل‌مصرف بمانند. اجباری‌کردن هدر یک مرحلهٔ contract جداگانه است.
- فهرست کلیدهای payload در کاتالوگ همان منبعی است که validator رویداد برای
  exact-field validation استفاده می‌کند؛ در نتیجه code و metadata از هم جدا
  نمی‌شوند.
- `FlightDisrupted` تا دریافت و تصویب قرارداد نیرا/OCC عمداً catalog نمی‌شود.

## مرز و rollback

- هیچ HTTP API، جدول، migration، credential، PII یا مبلغ جدیدی اضافه نمی‌شود.
- مبالغ موجود همچنان رشتهٔ صحیح IRR و تمام زمان‌ها UTC هستند.
- rollback با بازگرداندن publisher قبلی ممکن است؛ consumerهای جدید پیام‌های
  بدون هدر را می‌پذیرند و هیچ داده‌ای نیاز به حذف یا backfill ندارد.
- ثبت Schema در سرویس خارجی، سیاست compatibility و enforcement اجباری نیازمند
  تصمیم عملیاتی جداگانه است.

## چک‌لیست پذیرش

- [x] کاتالوگ دقیق هر چهار event type، نسخه و payload field را ثابت می‌کند:
  `core-itinerary-event-schema.spec.ts`.
- [x] publisher فقط برای قراردادهای شناخته‌شده هدر درست می‌فرستد:
  `kafka-event-publisher.spec.ts`.
- [x] transport هدر درست و legacy بدون هدر را می‌پذیرد:
  `reporting-kafka.handler.spec.ts`.
- [x] transport هدر ناشناخته، malformed و schema متعلق به event دیگر را قبل
  از DB رد می‌کند: `commerce-inbox-kafka.handler.spec.ts` و
  `reporting-kafka.handler.spec.ts`.
- [x] تست‌های parser ثابت می‌کنند exact-field validation از همان کاتالوگ
  استفاده می‌کند: `core-itinerary-events.spec.ts`.
- [x] ۱۳۵ تست focused و تمام ۱۸۶ suite / ۱۰۶۷ تست unit بک‌اند، lint خواندنی،
  typecheck و build محلی موفق‌اند؛ deploy انجام نمی‌شود.
