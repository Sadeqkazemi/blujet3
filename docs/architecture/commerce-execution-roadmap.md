# برنامهٔ یکپارچهٔ معماری و تجارت بلوجت

تاریخ: ۲۰۲۶-۰۹-۰۳. این برنامه ادامهٔ همان محصول است، نه بازنویسی یا محصول دوم.
مبنای کد: `feffb7f`، مرج PR #12 و پایان فاز پروژهٔ ۵ (جداسازی اسکیماها).
مرج‌شدن کد، مدرک استقرار یا قبولی UAT محیط عملیاتی نیست.

## منابع و تصمیم‌های حاکم

- مسیر استخراج: [معماری v1.1](blujet-architecture-v1.1.md).
- الزامات کسب‌وکار: `Airline-Digital-Commerce-Architecture-FA.docx` و سند
  اجرایی تحویل‌شدهٔ `Blujet-Architecture-Execution-Plan-FA-v1.0.docx`.
- تأیید صریح کاربر: NestJS/TypeScript، PostgreSQL و TypeORM حفظ می‌شوند؛
  معماری و مدل داده با migration سازگار و بدون حذف داده تکامل می‌یابند.
- بلوجت مرجع موجودی، رزرو، فروش و صدور بلیت است. فروش آژانس از همان موجودی
  و از طریق API مجاز انجام می‌شود. نیرا مسئول کارت پرواز است، نه مرجع دوم فروش.
- موجودی، سفارش و پرداخت در یک Core و تراکنش محلی می‌مانند؛ جداسازی اسکیما
  به معنی تکمیل جداسازی نویسندگان یا مجوز دیتابیس نیست.
- مبالغ ذخیره‌شده و API ریال صحیح هستند؛ نمایش سایت تومان، مالی/فاکتور/گزارش/
  پنل آژانس ریال. این برنامه تبدیل یا گردکردن دادهٔ مالی را مجاز نمی‌کند.
- مستندات نیرا و PSP هنوز ارائه نشده‌اند. اتصال واقعی، قرارداد فرضی با آن‌ها،
  فعال‌سازی PSS سایه و ادعای آمادگی عملیاتی مجاز نیست.
- push، merge، migration روی سرور و deploy نیازمند تأیید جداگانه‌اند.

## دو مسیر و وابستگی‌ها

| شناسه | کار | وضعیت و شرط عبور |
| --- | --- | --- |
| A0–A5 | ایمنی استخراج، Notify، Experience، Identity، اسکیماها | در مبنای مرج‌شده؛ کنترل دوبارهٔ قراردادها هنگام تغییر |
| B1 | مالکیت و تطابق payload در تکرار ایجاد رزرو عمومی/سهمیه‌ای | مرج‌شده در PR #13؛ CI PostgreSQL 16 سبز، UAT محیط باقی است |
| B2 | intent پرداخت پایدار، قیمت نهایی پیش از PSP، وضعیت نامعلوم و reconciliation، callback/refund تکرارپذیر | برش داخلی B2.1 در PR #13 مرج و CI سبز شد؛ callback/recovery/refund و تأیید درگاه واقعی منتظر مستندات است |
| B3 | عمر hold و رقابت expiry/confirm، صدور بلیت قابل‌حسابرسی و recovery | B3.1 expiry/confirm در PR #14 مرج‌شده؛ B3.2 زیرساخت stock و سند بلیت محلی آمادهٔ بازبینی است، بارگذاری stock واقعی و EMD همچنان نیازمند ورودی عملیات |
| A6 | استخراج تدریجی Agency/Loyalty با مالک نویسندهٔ واحد | پس از کنترل وابستگی‌های تراکنشی B1–B3؛ برابر فاز ۵ در ADR، نه فاز پروژهٔ ۵ |
| B4 | دفتر مالی/تطبیق، دسترسی tenant و API آژانس، outbox و inbox قابل‌بازیابی | برش‌های مستقل همراه A6؛ بدون انتقال تراکنش فروش به چند primary |
| B5 | آداپتور نیرا و چرخهٔ کارت پرواز | منتظر مستندات؛ وضعیت check-in و مجوز refund باید قراردادی شوند |
| A7+ | Intelligence، Warehouse و توزیع استاندارد | پس از شواهد نیاز، دادهٔ معتبر و بودجه؛ AI صرفاً مشورتی |

این جدول ادعای تکمیل همهٔ فصل‌های سند نیست. هر برش باید قرارداد API/DB،
تست خطا و هم‌زمانی و برنامهٔ rollout/rollback خود را داشته باشد. SLOها،
نگهداشت داده، روش stock بلیت و جزئیات NDC هنوز تعهد تأییدشده نیستند.

## برش B1 و شواهد پذیرش

دامنه فقط ایجاد رزرو است؛ اصلاح پرداخت، تخصیص stock و کارگر expiry در این
برش انجام نمی‌شود. شرط پذیرش: کلید یکسان با مالک و ورودی یکسان، یک رزرو؛
ورودی متفاوت، خطای مشخص؛ مالک متفاوت، بدون افشای داده. این شواهد بخشی از
AGY-02/AGY-03 سند اجرایی هستند، نه قبولی کل UAT آژانس یا پرداخت.

Backend change:

- [x] Read existing controller/service/DTO/entity/spec and sibling agency path.
- [x] Define API and DB contracts before implementation.
- [x] Identify sibling patterns: existing agency replay guard and `hashPii`.
- [x] List touched areas: booking service/controller, booking fingerprint helper,
  Booking entity, one additive migration, booking/agency regressions and docs.
- [x] Implement minimal change; no new dependency or public endpoint.
- [x] Regression red → green: foreign-owner replay, changed manifest and concurrent replay.
- [x] Verify identical/concurrent replay, legacy rows, ownership and validation.
- [x] Verify migration/metadata parity, typecheck, lint, unit and e2e tests locally.
- [ ] CI and environment UAT; only after separately approved publication.

اجرای محلی تست دیتابیس فقط روی `blujet_test` انجام می‌شود؛ نسخهٔ فعلی محلی
PostgreSQL 18.2 است و جای CI روی baseline PostgreSQL 16 را نمی‌گیرد.
rollback برنامه باید ستون افزوده و داده‌ها را حفظ کند. بازگشت به نسخهٔ قدیمی
حفاظت جدید replay را غیرفعال می‌کند؛ تا rollout هماهنگ نویسندگان، تضمین جدید
برای همهٔ نمونه‌های برنامه برقرار نیست.

### شواهد محلی B1 — ۲۰۲۶-۰۹-۰۳

- سه تست جدید پیش از اصلاح شکست خوردند: دو replay نامعتبر پاسخ 201 داشتند
  و در درخواست هم‌زمان یکسان، یکی از پاسخ‌ها به‌اشتباه 409 بود. پس از اصلاح
  هر سه پاس شدند.
- ۲۵ تست واحد در `booking-idempotency.spec.ts`، `booking.controller.spec.ts`
  و `domain-schemas.spec.ts` پاس شدند. این عدد کل تست‌های backend نیست.
- ۵۹ تست در چهار مجموعهٔ کامل `booking-engine.e2e-spec.ts`،
  `agency-portal.e2e-spec.ts`، `schema-parity.e2e-spec.ts` و
  `booking-replay-migration.e2e-spec.ts` پاس شدند: خطاهای 400/401/403/404،
  عدم افشای اطلاعات، رقابت کلید روی دو پرواز، ظرفیت آخرین صندلی، بدهکارشدن
  یک‌بارهٔ اعتبار آژانس، پرداخت‌های موجود، رزرو قدیمی و مخفی‌بودن fingerprint.
- migration افزایشی `1790611200000-BookingReplayFingerprint` فقط روی
  `blujet_test` اعمال شد. تست down/up داخل تراکنش rollback‌شده اجرا شد؛
  شمار رزروها ثابت ماند و تست تطابق entity/DB نیز پاس شد.
- `tsc --noEmit -p tsconfig.build.json`، `nest build` و ESLint بدون `--fix`
  برای فایل‌های TypeScript تغییرکرده پاس شدند. قالب‌بندی فایل قدیمی تست آژانس
  با انتهای خط غالب CRLF حفظ شده است.
- محیط تست هشدار deprecated مربوط به اجرای هم‌زمان query در کتابخانهٔ `pg`
  داد؛ تست‌ها شکست نخوردند. علت این هشدار در این برش بررسی نشده است.
- هیچ انتشار روی GitHub یا تغییر محیط سرور انجام نشده است. پیش از rollout:
  CI با PostgreSQL 16، رفتار کلاینت برای replay قدیمی و برنامهٔ چرخش کلید PII
  باید بررسی شوند. دادهٔ مالی، جدول پرداخت و درگاه واقعی در B1 تغییر نکردند.

## برش B2.1 و شواهد پذیرش

دامنهٔ این برش، ایمن‌سازی مسیر داخلی پرداخت فعلی بدون اتصال واقعی به PSP است.
قیمت و تخفیف پیش از dispatch محاسبه می‌شوند؛ intent پایدار قبل از فراخوانی
درگاه ثبت می‌شود و پاسخ مفقود یا verify ناموفق، وضعیت نامعلوم و قرنطینه ایجاد
می‌کند. فقط خطای محلی «هیچ درخواستی ارسال نشد» امکان تلاش مجدد را می‌دهد.

- کلید پرداخت با مالک، روش، promo و قیمت تأییدشده fingerprint شده است؛ replay
  یکسان همان نتیجه را می‌دهد و payload متفاوت با 409 رد می‌شود.
- یک تلاش فعال برای هر رزرو مجاز است. `REQUESTING`، `UNKNOWN` و `VERIFIED`
  مانع شارژ مجدد با درگاه، کیف پول یا امتیاز می‌شوند؛ dual-write ایجاد نشده است.
- capture تأییدشده پیش از صدور بلیت در reconciliation پایدار ثبت می‌شود. اگر
  تکمیل تراکنش داخلی شکست بخورد، وضعیت `VERIFIED/PENDING` برای اقدام مالی باقی
  می‌ماند و هیچ پاسخ گمراه‌کنندهٔ «پرداخت نشده» به مشتری داده نمی‌شود.
- hold پس از verify دوباره کنترل می‌شود؛ انقضا مانع بلیت و ledger می‌شود، اما
  سند capture برای reconciliation حفظ می‌شود.
- migration `1790697600000-PaymentAttempts` فقط جدول و ایندکس‌های افزایشی، دو
  کلید خارجی و fingerprint پرداخت را اضافه می‌کند؛ enum churn تولیدشدهٔ TypeORM
  وارد migration نشد.

### شواهد محلی B2.1 — ۲۰۲۶-۰۹-۰۳

- پنج regression ابتدا شکست خوردند: promo نامعتبر درگاه را فراخوانی می‌کرد،
  مبلغ قبل از تخفیف ارسال می‌شد، رقابت دو بار dispatch می‌کرد، پاسخ مفقود
  قرنطینه نداشت و replay با روش متفاوت پذیرفته می‌شد؛ سپس سبز شدند.
- ۱۲۰ تست E2E مرتبط در ده مجموعهٔ کامل رزرو، پرداخت، آژانس، قیمت‌گذاری، چرخهٔ
  PNR و schema parity پاس شدند. کنترل‌های 400/401/403/404، مالکیت، آخرین صندلی،
  expiry، concurrent pay و reconciliation نیز در این مجموعه‌ها باقی ماندند.
- همهٔ ۱۱۳ مجموعهٔ unit backend شامل ۴۴۷ تست، typecheck، Nest build و ESLint
  بدون `--fix` روی همهٔ فایل‌های TypeScript تغییرکرده پاس شدند.
- migrationهای B1 و B2.1 و تطابق entity/DB فقط روی `blujet_test` اجرا شدند.
  PostgreSQL محلی 18.2 جای baseline CI روی PostgreSQL 16 یا UAT را نمی‌گیرد.
- هیچ callback واقعی، recovery خودکار، refund، قرارداد PSP/نیرا، push، merge،
  migration سرور یا deploy در این برش انجام نشده است.

### وضعیت انتشار B1/B2.1

هر دو برش با PR #13 در `main` مرج شدند. اجرای CI شمارهٔ `33720580276` روی
PostgreSQL 16 و CodeQL اجرای `33721406680` سبز شدند. این شواهد به معنی deploy،
migration سرور یا قبولی UAT محیط عملیاتی نیست؛ هیچ‌کدام اجرا نشدند.

## برش B3.1 و شواهد پذیرش

این برش فقط عمر hold و رقابت expiry/confirm را بدون قرارداد خارجی تکمیل
می‌کند. worker داخلی Core، holdهای منقضی را در batch محدود با قفل ردیفی و
`SKIP LOCKED` به `EXPIRED` می‌برد. همان تراکنش یک رویداد یکتای
`HOLD_EXPIRED` ثبت می‌کند؛ مسیر lazy نیز از همان انتقال استفاده می‌کند.
پرداخت و worker روی یک Booking row سریال می‌شوند و capture دیرهنگام همچنان
در صف reconciliation می‌ماند، بدون بلیت، برداشت دوم یا refund فرضی.

- migration افزایشی `1790784000000-BookingHoldLifecycle`، جدول رویداد و index
  جزئی due-hold را به schema `orders` اضافه می‌کند؛ down/up روی `blujet_test`
  تمرین و schema parity سبز شد.
- ۱۱۵ مجموعهٔ unit شامل ۴۵۳ تست و ۴۲ تست E2E متمرکز رزرو، reconciliation و
  schema parity پاس شدند. typecheck، Nest build و ESLint بدون `--fix` نیز سبز
  هستند.
- flagهای `BOOKING_EXPIRY_WORKER_ENABLED` و `BOOKING_EXPIRY_POLL_MS` validate
  می‌شوند. خاموش‌کردن worker فقط rollback polling است و deadline تجاری را
  تغییر نمی‌دهد.
- B3.1 در PR #14 مرج و CI آن سبز شد. UAT محیط، migration سرور و deploy انجام
  نشده‌اند و همچنان تأیید جداگانه می‌خواهند.

B3 کامل اعلام نمی‌شود: ticket-number/EMD stock، قواعد صدور جزئی و مسیر جبران
capture دیرهنگام به تصمیم‌های D-04 تا D-06 و مستند PSP/عملیات نیاز دارند.

### هم‌ترازی سیاست کنسلی بلوجت

تصویر رسمی «قوانین کنسلی بلو جت» اکنون به‌عنوان تصمیم کسب‌وکار ثبت شد:
جریمهٔ استرداد در بیش از ۷۲ ساعت ۳۰٪، بین ۲۴ تا ۷۲ ساعت ۵۰٪ و بین ۱۲ تا
۲۴ ساعت ۷۰٪ است؛ کمتر از ۱۲ ساعت مانده یا پس از پرواز غیرمجاز است. Migration
افزایشی `1791475200000-BluJetCancellationPolicy` ردیف‌های موجود را بدون حذف
سوابق مالی هم‌تراز می‌کند و APIهای مشتری/Core همان جدول را می‌خوانند. بازگشت
وجه پس از بررسی ادمین و ارجاع به مالی، حداکثر تا ۷ روز کاری اعلام می‌شود.

## برش B3.2 — قرارداد اجرایی

این برش بدون حدس‌زدن بازهٔ واقعی، مدل stock و سند بلیت را داخل همان Core و
تراکنش محلی اضافه می‌کند. همهٔ مسیرهای صدور فعلی باید از allocator مشترک
استفاده کنند؛ `Passenger.ticketNo` فقط projection سازگار می‌ماند. شماره‌های
قدیمی به‌صورت `QUARANTINED` backfill می‌شوند و تولید بدون stock تأییدشده
fail-closed است. فقط seed غیرتولیدی مجاز است range آزمایشی با source روشن
بسازد. API بارگذاری stock، EMD، coupon servicing، اتصال نیرا و جبران خودکار
capture تا دریافت اختیار و قواعد معتبر خارج از این برش هستند.

پیاده‌سازی محلی B3.2 اکنون همهٔ مسیرهای صدور عمومی، wallet/points، فروش
سهمیه‌ای آژانس، صدور دستی و قفل مدیریتی را به allocator مشترک وصل می‌کند.
شواهد تازه: ۱۱۶ مجموعهٔ unit شامل ۴۵۵ تست؛ ۷ تست مستقیم allocator، migration
و schema parity؛ و اجرای سبز suiteهای کامل پرداخت/رزرو عمومی (۳۷)، آژانس
(۳۳)، رزرو داخلی (۱۹) و قفل مدیریتی (۷). typecheck، Nest build، Prettier
check و ESLint بدون `--fix` سبز
هستند. اجرای دسته‌ای هشت suite، ۱۰۶ از ۱۰۹ تست را پاس کرد و سه timeout ناشی
از setup/timerهای قدیمی داشت؛ هر دو suite درگیر بلافاصله به‌صورت جداگانه کامل
و سبز اجرا شدند. هیچ push، merge، migration سرور یا deploy برای B3.2 انجام
نشده است.
