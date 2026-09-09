# Event schema header cutover

این فاز دورهٔ سازگاری پیام‌های قدیمی Kafka را به‌صورت کنترل‌شده می‌بندد. هدف
این است که پس از اثبات خالی‌شدن backlog قدیمی، چهار رویداد Core itinerary فقط
با `event-schema-id` صحیح پذیرفته شوند. این برش هیچ Schema Registry خارجی،
topic جدید یا مسیر HTTP ایجاد نمی‌کند.

## قرارداد پیشنهادی

- فلگ `CORE_EVENT_SCHEMA_HEADER_REQUIRED` فقط مقادیر دقیق `true` و `false` را
  می‌پذیرد و مقدار پیش‌فرض آن `false` است. مقدار نامعتبر باید startup را
  fail-closed متوقف کند.
- در حالت خاموش، رفتار موجود حفظ می‌شود: پیام legacy بدون هدر پذیرفته می‌شود؛
  هدر malformed، ناشناخته یا متعلق به event دیگر همواره رد می‌شود.
- در حالت روشن، نبودن هدر برای چهار قرارداد `OrderCreated`,
  `PaymentConfirmed`, `TicketIssued` و `RefundRequested` پیش از هر دسترسی به
  دیتابیس رد می‌شود. رویدادهای خارج از catalog با این فلگ سخت‌گیرتر نمی‌شوند.
- publisher همچنان schema ID را فقط از catalog تایپ‌شده استخراج می‌کند؛ caller
  اجازهٔ تعیین یا override کردن آن را ندارد.
- Reporting پیام ردشده را با همان سیاست bounded retry و quarantine موجود
  مدیریت می‌کند. payload، key، header یا متن خطای خام در DLQ ذخیره نمی‌شود و
  offset پیش از تصمیم معتبر commit نمی‌شود.

## Cutover و rollback

1. ابتدا release با فلگ خاموش منتشر و ارسال هدر توسط همهٔ publisherهای مجاز
   اثبات می‌شود.
2. backlog فاقد هدر در UAT replay یا تخلیه و نبود delivery قدیمی در همهٔ
   partitionها ثبت می‌شود.
3. فلگ فقط در workerهای مصرف‌کننده و به‌صورت مرحله‌ای روشن می‌شود؛ پیام معتبر
   باید projection را دقیقاً یک بار به‌روزرسانی کند و پیام بدون هدر باید بدون
   اثر دیتابیسی به مسیر retry/quarantine برود.
4. rollback فوری، بازگرداندن فلگ به `false` و restart همان worker است. این کار
   داده، offset، receipt، projection یا schema را حذف نمی‌کند و پیام‌های دارای
   شناسهٔ اشتباه را مجاز نمی‌کند.

فعال‌سازی production، تعیین پنجرهٔ backlog و عملیات restart/deploy خارج از این
فاز و نیازمند تأیید جداگانه است.

## دیتابیس و امنیت

- هیچ migration، table، column، index، grant، seed یا backfill اضافه نمی‌شود.
- هیچ credential یا URL رجیستری در تنظیمات وارد نمی‌شود.
- خطاها فقط یک پیام ثابت و بدون event data/PII برمی‌گردانند.
- Order، Inventory و Payment در همان مرز ACID فعلی باقی می‌مانند.

## چک‌لیست پذیرش پس از تأیید

- [x] parser در حالت خاموش backlog بدون هدر را بپذیرد و در حالت روشن همان پیام
  را پیش از callback/DB رد کند.
- [x] هدر صحیح در هر دو حالت پذیرفته و هدر malformed/unknown/cross-event در هر
  دو حالت رد شود.
- [x] رویداد catalog‌نشده با روشن‌شدن فلگ به‌اشتباه رد نشود.
- [x] config مقدار پیش‌فرض خاموش و رد مقادیر نامعتبر را با تست ثابت کند.
- [x] Reporting، retry/quarantine و عدم commit زودهنگام را برای missing header
  با تست ثابت کند.
- [x] lint، typecheck، build و همهٔ ۱۹۷ suite / ۱۱۱۰ تست محلی سبز شدند.
- [ ] GitHub CI پس از push سبز شود.
- [x] هیچ Registry activation، تغییر دیتابیس یا server deployment انجام نشد.
