# Event schema compatibility against `main`

این برش، سیاست immutable بودن قراردادهای Core itinerary را در pull request
قابل‌اجرا می‌کند. verifier فعلی فقط تطابق source و artifact همان commit را
می‌سنجد؛ بنابراین تغییر هم‌زمان هر دو فایل می‌تواند یک قرارداد v1 موجود را
بی‌صدا بشکند. gate جدید bundle پیشنهادی را با artifact موجود در **SHA دقیق
شاخهٔ هدف PR** مقایسه می‌کند.

## قرارداد پیشنهادی

- baseline از `github.event.pull_request.base.sha` خوانده می‌شود، نه از نام
  متحرک branch و نه از شبکه یا Schema Registry خارجی.
- هر schema موجود با `$id` شناسایی می‌شود. حذف آن، تغییر نام کلید، تغییر `$id`
  یا هر تغییر معنایی/متنی در همان schema و همان ID رد می‌شود.
- تکامل ناسازگار یا افزودن field فقط با schema جدید و `$id` نسخهٔ جدید مجاز
  است. schemaهای baseline باید byte-for-byte و به همان ترتیب canonical در
  bundle پیشنهادی باقی بمانند.
- افزودن schema جدید مجاز است، به شرط آنکه `$id` یکتا و ساختار bundle معتبر
  باشد. ورود `FlightDisrupted` همچنان نیازمند قرارداد نیرا/OCC و تأیید مستقل
  است و در این برش اضافه نمی‌شود.
- اجرای محلی baseline را از یک path صریح می‌گیرد. نبودن baseline، JSON نامعتبر،
  `$id` تکراری یا schema گمشده fail-closed است؛ هیچ حالت «skip با موفقیت» وجود
  ندارد.

## مرز عملیاتی و rollback

- این ابزار فقط فایل می‌خواند و هیچ endpoint، Kafka topic/header، credential،
  registry call، database access یا feature flag اضافه نمی‌کند.
- CI در رویداد pull request برای job Backend فقط SHA دقیق هدف را با عمق یک
  fetch می‌کند، artifact آن commit را در مسیر موقت می‌نویسد و سپس comparator
  را اجرا می‌کند.
  فایل موقت commit نمی‌شود و secret ندارد. اجرای reusable workflow پس از merge
  فقط verifier قطعی source/artifact فعلی را اجرا می‌کند و ادعای مقایسهٔ تاریخی
  ندارد؛ حفاظت تاریخی در همان PR اجباری شده است.
- rollback حذف gate است؛ wire format، دیتابیس و runtime تغییر نمی‌کنند. این
  rollback به معنی مجازشدن شکستن قرارداد نیست و باید با تصمیم معماری انجام شود.

## چک‌لیست پذیرش پس از تأیید

- [x] مقایسهٔ bundle یکسان و bundle دارای schema جدید موفق شود —
  `event-schema-compatibility.spec.ts`، تست additive version.
- [x] حذف schema، تغییر `$id` و تغییر nested type/required/enum/const رد شود —
  `event-schema-compatibility.spec.ts`، تست‌های removal و nested mutation.
- [x] baseline ناموجود/نامعتبر و `$id` تکراری با پیام ثابت و بدون dump کردن
  محتوای schema رد شود — تست‌های malformed/duplicate و اجرای CLI بدون path.
- [x] verifier فعلی source/artifact همچنان byte-identical باقی بماند —
  `core-itinerary-json-schemas.spec.ts` و `npm run events:schema:verify`.
- [x] GitHub PR CI دقیقاً SHA هدف PR را مقایسه کند؛ reusable workflow نیز
  verifier فعلی source/artifact را اجرا کند و به‌اشتباه ادعای compatibility
  تاریخی نداشته باشد — workflow assertion در
  `event-schema-compatibility.spec.ts`.
- [ ] lint، typecheck، unit tests و build محلی سبز هستند؛ GitHub CI پس از push
  باقی است.
- [x] هیچ registry خارجی، credential، migration، runtime activation یا deploy
  در این برش انجام نشده است.
