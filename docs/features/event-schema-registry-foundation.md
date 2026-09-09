# Event Schema Registry foundation — contract and compatibility gate

این فاز فاصلهٔ میان کاتالوگ TypeScript فعلی و یک Schema Registry واقعی را
بدون انتخاب عجولانهٔ vendor می‌بندد. خروجی این مرحله یک بستهٔ JSON Schema
نسخه‌دار، قابل import و قابل بررسی در CI است؛ هیچ اتصال شبکه، credential،
topic یا سرویس production فعال نمی‌شود.

## قرارداد مصوب پیشنهادی

- چهار قرارداد موجود `OrderCreated`, `PaymentConfirmed`, `TicketIssued` و
  `RefundRequested` برای نسخهٔ v1 به JSON Schema مستقل و deterministic تبدیل
  می‌شوند.
- شناسهٔ موجود `blujet.core-itinerary.<EventType>.v1` بدون تغییر می‌ماند و
  subject پیشنهادی برای registry برابر
  `blujet.core-itinerary.<EventType>-value` است. عدد نسخه در subject قرار
  نمی‌گیرد تا registry تاریخچهٔ نسخه‌ها را نگه دارد.
- schema کل envelope و payload را با `additionalProperties: false`، رشته‌های
  decimal برای IRR، زمان UTC با `date-time`، UUID برای event ID و مقادیر enum
  موجود محدود می‌کند.
- artifactها از یک تعریف typed تولید می‌شوند؛ فایل JSON دست‌نویسِ جدا از کد
  منبع حقیقت نخواهد بود.
- CI هر artifact را با eventهای واقعی builderها تطبیق می‌دهد و drift میان
  `schemaId`، event type، payload fields و schema را رد می‌کند.

## سیاست compatibility

- قرارداد v1 immutable است: حذف required field، تغییر type/format/enum، تغییر
  producer/aggregate یا مجازکردن field ناشناخته در همان v1 رد می‌شود.
- افزودن field اختیاری فقط با نسخهٔ جدید و تست مصرف‌کنندهٔ قبلی مجاز است؛ تغییر
  ناسازگار همیشه schema ID جدید و migration مصرف‌کننده می‌خواهد.
- `FlightDisrupted` تا دریافت قرارداد نیرا/OCC وارد registry نمی‌شود.
- پیام backlog بدون `event-schema-id` همچنان در دورهٔ compatibility پذیرفته
  می‌شود؛ اجباری‌کردن header یک cutover مستقل است.

## خروجی و مرز عملیاتی

- command فقط‌خواندنی یک bundle مرتب و deterministic تولید/بررسی می‌کند تا بعداً
  در Confluent، Apicurio یا Registry سازگار دیگری import شود.
- artifact شامل URL، token، credential، payload واقعی، PII یا دادهٔ مسافر نیست.
- publisher و Reporting در این فاز هیچ HTTP call به registry ندارند؛ failure
  رجیستری نمی‌تواند فروش، پرداخت یا مصرف Kafka را متوقف کند.
- هیچ API عمومی/داخلی، جدول، migration یا seed اضافه نمی‌شود. Order، Inventory
  و Payment در همان Core ACID باقی می‌مانند.
- rollback تنها حذف command/artifact است؛ wire format و database تغییر نمی‌کند.

## چک‌لیست پذیرش پس از تأیید

- [x] تعریف typed و deterministic برای چهار JSON Schema اضافه شود.
- [x] schema همهٔ envelope/payload fieldهای واقعی را exact validate کند.
- [x] تست drift، v1 mutation و PII ممنوعه را fail-closed اثبات کند.
- [x] command تولید bundle دوبار خروجی byte-identical بسازد و artifact committed
  را بدون rewrite بررسی کند.
- [x] CI اجرای compatibility gate را برای تغییرات Backend/Event اجباری کند.
- [ ] lint، typecheck، unit tests، build و CI سبز شوند.
- [ ] هیچ registry خارجی، flag، credential یا deploy فعال نشود.
