# معماری هدف blujet — میکروسرویس، امنیت، دیتابیس

نسخه: ۱.۱  
وضعیت: سند تصمیم معماری (ADR جمعی) — مبنای استخراج سرویس‌ها  
مخاطب: مالک محصول، تیم بک‌اند، عملیات، امنیت  
مرجع دامنه: `CLAUDE.md`، `docs/API.md`، `docs/DB_SCHEMA.md`، مشخصات فنی ایرلاین، مدل IATA Offer / Order / NDC / ONE Order

این سند معماری **هدف** است، نه توصیف وضعیت فعلی. وضعیت فعلی یک **modular monolith** روی NestJS است با یک PostgreSQL، Redis، و یک میکروسرویس مشورتی FastAPI. حرکت به این نقشه باید **مرحله‌ای (strangler)** باشد؛ شکستن یک‌شبه هسته رزرو ممنوع است.

---

## ۱. هدف

یک پلتفرم فروش و عملیات ایرلاین بسازیم که:

1. مثل ایرلاین‌های حرفه‌ای روی مرز **Offer → Order → Inventory → Payment → Loyalty → Distribution** سازماندهی شود.
2. هر قابلیت غیرحیاتی بتواند مستقل deploy شود، بدون خواباندن کل سایت.
3. آپدیت کد **دیتابیس و فیچرهای قبلی را نشکند**.
4. حملات به API، هویت، موجودی صندلی و لجر را در چند لایه دفع کند.
5. هوش مصنوعی فقط **مشورت** بدهد؛ هرگز قیمت قطعی، صندلی یا پرداخت را تصویب نکند.

---

## ۲. اصول غیرقابل‌مذاکره

| اصل | معنی عملی |
|---|---|
| حقیقت واحد برای پول و صندلی | موجودی، رزرو، پرداخت و لجر در یک مرز تراکنشی ACID می‌مانند. |
| بدون 2PC | هیچ رزروی روی دو دیتابیس توزیع‌شده commit نمی‌شود. |
| Idempotency | هر endpoint سازندهٔ رزرو/پرداخت/اعلان کلید تکرار دارد. |
| Expand / Contract | هر تغییر اسکیما حداقل دو ریلیز است؛ drop در همان ریلیز کد قدیم ممنوع. |
| Defense in depth | شبکه + لبه + هویت + دامنه + داده + ممیزی. یک لایه کافی نیست. |
| شعاع انفجار | اگر محتوا، اعلان یا فرانت نفوذ شد، موجودی صندلی و لجر دست‌نخورده بماند. |
| AI advisory | خروجی مدل هرگز موجودی کم نمی‌کند، پول جابه‌جا نمی‌کند، دسترسی نمی‌دهد. |
| Tenant isolation | آژانس فقط دادهٔ خودش را می‌بیند؛ روی هر query سروری اعمال می‌شود. |
| PII حداقل | کد ملی / پاسپورت / شبا رمزنگاری در حالت سکون؛ در لاگ هرگز کامل ظاهر نمی‌شود. |
| پول صحیح | مبلغ فقط عدد صحیح ریال؛ هیچ `float`؛ نمایش تومان فقط در لبهٔ UI. |
| نسخه‌بندی API | قرارداد عمومی فقط `/api/v1`؛ شکست قرارداد = نسخهٔ جدید. |

---

## ۳. الگوی معماری: Core Platform + Microservices

ایرلاین‌های جهانی (Amadeus Altea / Nevio، SabreSonic / Mosaic، Navitaire New Skies) هستهٔ PSS را خرد نمی‌کنند. دور آن سرویس‌های خرد می‌گذارند: توزیع، وفاداری، تقلب، محتوا، اعلان، انبار داده.

blujet همین الگو را می‌گیرد:

```
                    اینترنت
                       │
                       ▼
              ┌─────────────────┐
              │  WAF + TLS      │  Cloudflare / Caddy
              │  DDoS / bot     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  API Gateway    │  nginx / بعداً Kong
              │  JWT, rate,     │
              │  routing, CORS  │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────────────────────┐
        │              │                              │
        ▼              ▼                              ▼
┌───────────────┐ ┌────────────────────┐    ┌─────────────────┐
│ identity      │ │ CORE PLATFORM      │    │ experience      │
│ auth / otp    │ │ offer+order+       │    │ cms / support   │
│ session / 2fa │ │ inventory+payment  │    │ blog / careers  │
└───────────────┘ │ یک Postgres اولیه  │    └─────────────────┘
                  └─────────┬──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│ agency          │ │ loyalty      │ │ notify          │
│ portal + B2B    │ │ club/wallet  │ │ sms / email /   │
│ partner API     │ │ points       │ │ in-app          │
└─────────────────┘ └──────────────┘ └─────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│ ops-admin       │ │ intelligence │ │ warehouse       │
│ panels/cartable │ │ ML + fraud   │ │ گزارش خواندنی   │
└─────────────────┘ └──────────────┘ └─────────────────┘
```

**Core Platform یک واحد استقرار و یک واحد تراکنش است**، ولی از داخل سه دامنهٔ جدا دارد (Offer، Order، Inventory/Payment). بقیه سرویس‌ها فرآیند جدا، مقیاس جدا، و در زمان مناسب دیتابیس جدا دارند.

این میکروسرویس است. این «بیست دیتابیس برای یک صندلی» نیست.

---

## ۴. کاتالوگ سرویس‌ها

هر سرویس یک تیم منطقی، یک قرارداد API، یک مخزن لاگ، و یک معیار سلامت دارد.

### ۴.۱ `gateway` — لبه

| مورد | تصمیم |
|---|---|
| مسئولیت | TLS termination، مسیر، محدودیت نرخ، همبستگی درخواست، محدودیت حجم، timeout |
| مالک داده | ندارد |
| الان | nginx فرانت + hardening داخل NestJS (`docs/features/api-gateway.md`) |
| هدف | سرویس لبهٔ مستقل؛ بعداً Kong اگر تعداد سرویس‌ها از حدود ۸ گذشت |

قوانین لبه:

- فقط Gateway به اینترنت گوش می‌دهد.
- Postgres، Redis، ML، سرویس‌های داخلی `expose` می‌شوند نه `ports`.
- هر پاسخ `X-Request-Id` دارد.
- `/health` عمومی و بدون throttle است؛ باقی مسیرها محدودند.
- مسیرهای حساس (login / OTP / pay) محدودیت جدا و سخت‌تر دارند.

### ۴.۲ `identity` — هویت

| مورد | تصمیم |
|---|---|
| مسئولیت | ورود مشتری (OTP)، ورود استاف (رمز + 2FA)، آژانس، refresh، step-up، نشست |
| جدا شدن | فاز ۲ استخراج |
| داده | `User`, `RefreshToken`, `TwoFactorChallenge`, `PasswordResetEvent`, `SecurityPolicy` |
| وابستگی | `notify` برای OTP/SMS؛ Redis برای throttle و بلاک موقت |

هویت **منبع حقیقت نقش** است. سرویس‌های دیگر JWT را verify می‌کنند و نقش را از توکن می‌خوانند؛ جدول کاربر را دور نمی‌زنند.

توکن:

- Access JWT کوتاه‌عمر (۱۵–۳۰ دقیقه)، امضای نامتقارن در هدف (الان متقارن قابل ارتقا است).
- Refresh در httpOnly cookie، قابل ابطال در Redis/DB.
- Audience و issuer جدا برای کاربر / استاف / آژانس / partner-api.
- Step-up برای کار پرریسک: تغییر نقش، صدور API key، پرداخت استرداد، revoke همهٔ نشست‌ها.

### ۴.۳ `core-platform` — PSS داخلی (جدا نمی‌شود)

این معادل PSS ایرلاین است. سه دامنهٔ داخلی، **یک تراکنش**:

```
Offer          جستجو، تقویم قیمت، کلاس نرخ، پیشنهاد قابل‌فروش
Order          Booking / PNR / مسافر / state machine
Inventory      FlightInstance، صندلی، SeatLock، allotment آژانس
Payment        درگاه، کیف‌پول، لجر، استرداد، reconciliation
```

ماژول‌های فعلی که اینجا می‌مانند:

`booking-engine`, `reservation`, `flights`, `flightops`, `pricing`, `refunds`, `manage-booking`, `ancillary-services`, `reconciliation`, بخش پولی `agencies`

قوانین هسته:

- صندلی فقط با `SELECT … FOR UPDATE` یا قفل خوش‌بینانهٔ نسخه‌دار کم می‌شود.
- ماشین حالت: `DRAFT → HELD → PAID → TICKETED → (CANCELLED | EXPIRED | REFUNDED)`.
- HELD حداکثر ۱۵ دقیقه؛ انقضا موجودی را آزاد می‌کند.
- قبل از پرداخت **re-price** اجباری است؛ اگر قیمت عوض شد بدون تأیید کاربر شارژ نمی‌شود.
- لجر فقط append؛ هیچ `UPDATE` روی موجودی کیف‌پول/اعتبار.
- دو خریدار همزمان آخرین صندلی: دقیقاً یکی موفق.

### ۴.۴ `loyalty` — باشگاه و امتیاز

`ClubMember`, `ClubPointsEntry`, `PriceLock`, قوانین سطح.

قفل قیمت طلایی تا ۷۲ ساعت اینجاست، ولی **اعمال قیمت قفل‌شده روی Order** فقط از طریق هسته انجام می‌شود. Loyalty قیمت را پیشنهاد/قفل می‌کند؛ هسته می‌فروشد.

### ۴.۵ `agency` — توزیع B2B

پرتال آژانس، اعتبار، کلید API، allotment، وب‌سرویس پارتنر.

- یک حساب ورود به ازای هر آژانس (قانون محصول).
- جداسازی مستأجر روی هر query.
- تعلیق ورود پرتال ≠ تعلیق Partner API؛ دو وضعیت جدا.
- کلید API اعتبار ماشین است، نه کاربر اضافه.

هدف بعدی این سرویس: آداپتور **IATA NDC** (Offer/Order XML/JSON) بدون اینکه GDS داخل هسته رخنه کند.

### ۴.۶ `notify`

اعلان درون‌برنامه‌ای، SMS (کاوه‌نگار پشت رابط)، ایمیل.

- فراخوانی فقط async از طریق outbox هسته یا رویداد.
- شکست SMS نباید رزرو را rollback کند.
- قالب پیام و PII ماسک‌شده اینجا کنترل می‌شود.

### ۴.۷ `experience` — محتوای عمومی

بلاگ، درباره ما، قوانین، مقاصد، استخدام، نظرسنجی، تماس، تیکت پشتیبانی، رسانه.

خواندنی، قابل کش، جدا از مسیر خرید. اگر زمین بخورد، جستجو و پرداخت باید زنده بمانند.

### ۴.۸ `ops-admin`

کارتابل، ارجاعات، لوگ، پنل‌های مدیریتی، تنظیمات، گزارش زندهٔ عملیاتی.

این سرویس **write روی موجودی و پول ندارد**. دستور «تأیید نرخ» یا «پرداخت استرداد» را به‌صورت فرمان به هسته می‌فرستد؛ خودش لجر نمی‌نویسد.

### ۴.۹ `intelligence` (همین حالا `ml-service`)

پیشنهاد قیمت، رادار خرید/صبر، امتیاز تقلب، توصیه مسیر.

- فقط شبکهٔ داخلی.
- توکن داخلی مشترک.
- Timeout سخت (۲ ثانیه) + circuit breaker.
- ورودی بدون PII خام (کد ملی، پاسپورت، کارت ممنوع).
- خروجی: نمره / پیشنهاد / نسخهٔ مدل. تصمیم قطعی با قوانین هسته است.

### ۴.۱۰ `warehouse` (فاز دیر)

کپی خواندنی برای گزارش‌های سنگین مدیرعامل/مالی. PostgreSQL منطقی یا ClickHouse.

گزارش هرگز از replicaٔ تأخیری برای تصمیم فروش صندلی استفاده نمی‌کند.

---

## ۵. ارتباط سرویس‌ها

```
همگام (HTTP/gRPC داخلی)     فقط وقتی پاسخ برای ادامهٔ همان درخواست لازم است
                            مثال: identity → هسته «این JWT معتبر است؟»
                                 هسته → loyalty «قفل قیمت فعال است؟»

ناهمگام (رویداد + Outbox)   کار جانبی بعد از commit
                            مثال: BookingTicketed → notify، warehouse، fraud
```

قرارداد رویدادهای دامنه (نمونه):

| رویداد | ناشر | مصرف‌کننده |
|---|---|---|
| `UserAuthenticated` | identity | audit, fraud |
| `OfferPriced` | core | intelligence, warehouse |
| `SeatHeld` | core | notify (اختیاری) |
| `BookingTicketed` | core | notify, loyalty, agency, warehouse |
| `PaymentCaptured` | core | warehouse, finance-export |
| `RefundPaid` | core | notify, warehouse |
| `AgencySuspended` | agency | identity, partner-api |
| `FraudScoreRaised` | intelligence | identity (throttle), core (review) |

الگوی Outbox اجباری است: رویداد در **همان تراکنش** Postgres هسته نوشته می‌شود، بعد worker آن را به صف می‌برد. Publish مستقیم بعد از commit بدون outbox ممنوع است (رویداد گم می‌شود).

صف پیشنهادی برای مقیاس فعلی: **Redis Streams**. اگر حجم رویداد از حد عملیاتی گذشت: RabbitMQ یا NATS. Kafka فقط وقتی انبار داده و چند مصرف‌کنندهٔ مستقل واقعاً لازم شد.

---

## ۶. معماری دیتابیس حرفه‌ای

### ۶.۱ مدل استقرار داده

یک **خوشهٔ PostgreSQL 16** با نقش‌های جدا، نه ده دیتابیس بی‌ربط.

```
┌──────────────────────────────────────────────┐
│ PostgreSQL Primary (منبع حقیقت نوشتنی)       │
│                                              │
│  schema identity                             │
│  schema inventory   ─┐                       │
│  schema orders       ├─ یک تراکنش مجاز       │
│  schema payments    ─┘                       │
│  schema loyalty                              │
│  schema agency                               │
│  schema notify                               │
│  schema experience                           │
│  schema ops                                  │
│  schema audit                                │
└──────────────────────┬───────────────────────┘
                       │ streaming replication
                       ▼
              PostgreSQL Replica (فقط خواندن)
                       │
                       ├── intelligence (آموزش/امتیاز)
                       └── warehouse / گزارش سنگین
```

فاز اول استخراج: **schema-per-service روی یک instance**.  
فاز بعدی: سرویس‌های غیرتراکنشی (`experience`, `notify`, `warehouse`) می‌توانند instance جدا بگیرند.  
`inventory` + `orders` + `payments` **هرگز** روی دو primary جدا نمی‌روند.

### ۶.۲ مالکیت جدول (bounded context)

| Schema | جداول نماینده | سرویس مالک | دیگران |
|---|---|---|---|
| `identity` | User, RefreshToken, TwoFactorChallenge | identity | فقط خواندن id/role از JWT |
| `inventory` | Airport, Route, Flight, FlightInstance, AircraftSeat, SeatLock, CabinFare | core | فقط read replica برای جستجو |
| `orders` | Booking, Passenger, FareRule snapshot | core | — |
| `payments` | LedgerEntry, WalletEntry, PayIdempotency, RefundRequest, Reconciliation | core | — |
| `loyalty` | ClubMember, ClubPointsEntry, PriceLock | loyalty | core قیمت قفل را می‌پرسد |
| `agency` | AgencyProfile, AgencyCreditLine, AgencyInvoice, AgencyApiKey | agency | core صندلی allotment را قفل می‌کند |
| `notify` | Notification, SmsLog | notify | — |
| `experience` | BlogPost, SiteContent, JobPosting, Survey, ContactMessage | experience | — |
| `ops` | CartableTask, ManagerMessage, ManagerReferral | ops-admin | فرمان به core |
| `audit` | AuditLog, AiUsageLog | همه می‌نویسند از طریق کتابخانهٔ مشترک؛ پاک‌کردن ممنوع |

ارجاع بین‌سرویس با **UUID پایدار** است، نه join مستقیم جدول سرویس دیگر در کد runtime. گزارش‌های تحلیلی از replica یا warehouse join می‌گیرند.

### ۶.۳ قواعد داده

1. **پول:** `bigint` ریال. ارز ISO 4217 کنار مبلغ. تبدیل تومان فقط در utility مشترک فرانت.
2. **زمان:** همه UTC. timezone فرودگاه جدا (IANA). نمایش جلالی فقط در لبه.
3. **حذف:** soft delete برای رزرو و مسافر. حذف سخت فقط مسیر GDPR.
4. **PII:** AES-256-GCM در حالت سکون + HMAC برای جستجوی دقیق کد ملی. لاگ ماسک.
5. **لجر:** فقط ردیف جدید. اصلاح = reversal. موجودی = `SUM(signed_amount)`.
6. **ایندکس اجباری:** `(origin, destination, departure_at)` روی پرواز؛ `booking.pnr` یکتا؛ `user.phone` / `user.username` یکتا؛ partial unique روی صندلی آزاد/قفل‌شده.
7. **موجودی جدا از رزرو:** جدول inventory/seat هیچ‌گاه از روی booking مشتق لحظه‌ای نمی‌شود؛ منبع ظرفیت است.
8. **Idempotency:** جدول کلید برای pay/book/notify.
9. **نسخه ردیف:** `version` روی FlightInstance و SeatLock برای race.
10. **Seed:** فقط dev/e2e. در production اگر `SEED_ON_START=true` باشد کانتینر باید بمیرد (وضعیت فعلی درست است).

### ۶.۴ مهاجرت بدون شکستن فیچر

قانون **expand / contract**:

```
ریلیز N     ستون/جدول جدید را اضافه کن (nullable یا default)
            کد قدیم هنوز کار می‌کند
ریلیز N+1   کد جدید هر دو شکل را می‌فهمد؛ backfill
ریلیز N+2   محدودیت NOT NULL / ایندکس یکتا
ریلیز N+3   ستون قدیمی drop می‌شود
```

گیت CI قبل از ادغام در `main`:

1. اسکیمای فعلی production (یا dump ساختار) را بالا بیاورد.
2. migrationهای جدید را اعمال کند (fail = رد PR).
3. تست یکپارچه روی آن اسکیما.
4. یک چک «آیا migration فقط expand است؟» برای ریلیزهای هم‌زمان با ترافیک.

روی سرور:

- Backup فیزیکی یا `pg_dump` سفارشی **قبل از** هر ریلیز دارای migration.
- PITR روشن (WAL archive، نگهداری حداقل ۷ روز).
- `migration:run` در entrypoint می‌ماند، ولی اگر fail شود کانتینر start نمی‌شود (fail-closed).
- Rollback کد، migration را برنمی‌گرداند. برای rollback اسکیما یا backward-compatible بوده، یا از backup برمی‌گردیم.

### ۶.۵ کش

| داده | کجا | TTL | نکته |
|---|---|---|---|
| نتیجه جستجو | Redis | ۵–۱۰ دقیقه | کلید شامل نسخهٔ کاتالوگ پرواز |
| OTP / challenge | Redis یا جدول چالش | ۲ دقیقه | یک‌بارمصرف، هش‌شده |
| Session denylist | Redis | تا انقضای refresh | |
| قفل موقت صندلی | **Postgres** | HELD | Redis منبع حقیقت صندلی نیست |
| صفحهٔ محتوا | Redis یا CDN | قابل ابطال | |

بعد از ریلیز کاتالوگ، نسخهٔ کلید کش (`SEARCH_CACHE_GEN`) زیاد می‌شود. `FLUSHDB` بی‌دلیل ممنوع.

---

## ۷. معماری امنیت

مدل: **Zero Trust داخلی**. بودن پشت docker network به معنی قابل‌اعتماد بودن نیست.

### ۷.۱ لایه‌ها

```
[1] شبکه     UFW / security group؛ فقط 80/443 عمومی
[2] لبه      WAF، TLS 1.2+، HSTS، bot challenge، محدودیت نرخ
[3] هویت     JWT + refresh قابل ابطال + 2FA استاف + step-up
[4] مجوز     RBAC سروری روی هر منبع؛ مخفی کردن تب کافی نیست
[5] ورودی    DTO / class-validator؛ ORM پارامتریزه؛ سقف حجم
[6] داده     رمزنگاری PII، بدون PAN/CVV، secret در vault
[7] ممیزی    AuditLog append-only برای پول، رزرو، ادمین
[8] هوش      امتیاز تقلب مشورتی؛ قطع دسترسی با قاعدهٔ قطعی
```

### ۷.۲ کنترل‌های اجباری

**شبکه و لبه**

- دامنه + HTTPS قبل از فروش واقعی بلیت (الان روی IP خام، cookie Secure خاموش است — مانع ریلیز فروش).
- WAF (ModSecurity یا Cloudflare): SQLi، XSS، path scan، rate لایهٔ ۷.
- Helmet / CSP روی SPA؛ API هدر جدا.
- CORS فقط originهای شناخته‌شده.
- `TRUST_PROXY_HOPS` دقیق؛ IP جعلی از هدرِ کلاینت پذیرفته نمی‌شود.

**هویت و دسترسی**

- استاف: argon2 + 2FA اجباری.
- مشتری: OTP شش رقمی، TTL دو دقیقه، یک‌بارمصرف، هش در سکون.
- Partner API: کلید ماشین، scope، چرخش، revoke برگشت‌ناپذیر با step-up.
- هر سرویس داخلی با **service identity** حرف می‌زند (توکن داخلی یا mTLS)، نه با JWT کاربر خامِ جعل‌پذیر از بیرون.
- آژانس هرگز دادهٔ آژانس دیگر را نمی‌خواند.

**داده**

- PCI-DSS: کارت به سرور ما نمی‌رسد؛ فقط redirect به PSP شتاب.
- GDPR-معادل: خروجی داده و حذف حساب موجود است؛ رزرو/لجر مالی به‌خاطر حسابرسی حذف سخت نمی‌شوند، PII ناشناس می‌شود.
- Secret فقط در GitHub Actions و `/opt/app/.env` با mode 600. هیچ کلید در گیت.

**مقاومت در برابر سوءاستفاده**

| تهدید | کنترل |
|---|---|
| پر کردن OTP | ۳ بار در دقیقه per phone+IP |
| credential stuffing استاف | ۵ بار در دقیقه + قفل تدریجی |
| overbooking | قفل ردیف Postgres |
| تکرار پرداخت | Idempotency-Key |
| جعل مبلغ از کلاینت | قیمت دوباره از سرور |
| دسترسی افقی به PNR | lookup با PNR + هویت مسافر؛ ownership چک |
| اسکن پنل | WAF + 401 یکسان + عدم افشای وجود کاربر |
| باج‌افزار / حذف | backup + PITR + تست بازگردانی ماهانه |

### ۷.۳ نقش هوش مصنوعی در امنیت

سرویس `intelligence` یک **امتیازدهنده** است، نه نگهبان دیتابیس و نه فایروال.

ورودی مجاز:

- نرخ درخواست، IP، device hash، الگوی مسیر
- تعداد رزرو/OTP ناموفق
- فاصلهٔ زمانی خریدهای یک هویت
- مبلغ نسبت به تاریخچهٔ همان حساب (بدون متن آزاد PII)

خروجی:

```json
{
  "score": 0.81,
  "actionHint": "review",
  "reasons": ["otp_burst", "new_device"],
  "modelVersion": "fraud-2026.09"
}
```

اقدام قطعی از روی جدول قوانین:

| نمره | اقدام |
|---|---|
| پایین | ادامه |
| متوسط | step-up / کپچا / 3DS |
| بالا | رد پرداخت، قفل موقت، هشدار IT |

مدل زبانی حق ندارد SQL بسازد، migration اجرا کند، یا فایروال را باز و بسته کند.

### ۷.۴ حداقل آسیب در حملات سایبری

کمترین آسیب یعنی **فرض کنید نفوذ رخ می‌دهد** و کاری کنید که مهاجم به صندلی، پول و دادهٔ مسافر نرسد. دیوار آتش به‌تنهایی کافی نیست.

اگر فرانت، بلاگ یا اعلان هک شد، خرید و لجر باید زنده و دست‌نخورده بمانند:

- هستهٔ رزرو / صندلی / پرداخت جدا و قفل‌شده بماند.
- سرویس‌های داخلی از اینترنت دیده نشوند (Postgres، Redis، ML فقط `expose` داخلی).
- هر نقش فقط کار خودش را بتواند بکند؛ مخفی کردن تب امنیت نیست.

الان بزرگ‌ترین ریسک blujet کد رزرو نیست؛ **لبه و هویت روی HTTP** است. استقرار فعلی روی IP خام، بدون TLS، با `COOKIE_SECURE=false` است. شنود نشست مدیر از Wi-Fi عمومی از بسیاری از «حملات پیچیده» خطرناک‌تر است. بدون بستن این شکاف، استخراج میکروسرویس فقط سطح حمله را بزرگ می‌کند.

#### اولویت ۱ — همین هفته (بیشترین کاهش آسیب)

1. **دامنه + HTTPS + cookie Secure.** بدون این، فروش واقعی باز نشود. HSTS بعد از TLS روشن شود.
2. **Swagger را از اینترنت ببندید.** `/docs` در production فقط از شبکهٔ داخلی، VPN یا IP allowlist.
3. **Sandbox و حساب موقت را از محیط فروش جدا کنید.** `AUTH_SANDBOX_ENABLED`، رمز مشترک UAT و seed هرگز روی سرور فروش نباشد. تست و تولید یکی نباشند.
4. **WAF جلوی nginx.** Cloudflare یا معادل: مخفی کردن IP اصلی، ضد DDoS، فیلتر SQLi / XSS / اسکن `/panel` و `/auth`. Rate-limit لایهٔ ۷ علاوه بر Throttler نست.
5. **ورود مدیر را سخت‌تر کنید.** 2FA موجود بماند. اضافه شود: محدودیت IP برای `/login` پنل، قفل تدریجی بعد از شکست، هشدار ورود از IP جدید، step-up برای صدور کلید API و پرداخت استرداد.

#### اولویت ۲ — جلوی دزدیدن داده و پول

| تهدید | کار مشخص |
|---|---|
| سرقت بلیت / overbooking | قفل ردیف Postgres بماند؛ Redis منبع صندلی نشود |
| تکرار پرداخت | Idempotency روی pay اجباری بماند |
| جعل مبلغ از مرورگر | همیشه re-price سمت سرور |
| کارت بانکی | کارت به سرور نیاید؛ فقط درگاه شتاب |
| کد ملی / پاسپورت | رمزنگاری AES-256-GCM؛ در لاگ کامل نیاید |
| آژانس A به دادهٔ آژانس B | tenant check روی هر query، نه فقط UI |
| باج‌افزار | backup روزانه + PITR + یک‌بار در ماه restore تست‌شده روی سرور جدا |
| لو رفتن dump دیتابیس | کلید `PII_ENCRYPTION_KEY` جدا از خود backup نگهداری شود؛ اگر کلید کنار dump باشد رمزنگاری بی‌فایده است |

اگر دیتابیس لو رفت، PII رمزشده و لجر append-only یعنی مهاجم نمی‌تواند موجودی را «ویرایش» کند؛ حداکثر می‌تواند کپی رمزشده ببرد.

#### اولویت ۳ — وقتی نفوذ شد، آسیب کم بماند

این بخش از «جلوگیری مطلق» مهم‌تر است:

- revoke فوری نشست‌ها با زیرساخت refresh قابل ابطال؛ دکمهٔ «خروج از همه دستگاه‌ها» برای IT.
- حداقل دسترسی داخل Docker: بک‌اند به Redis/DB بله؛ فرانت به DB هرگز.
- اعلان جدا از رزرو: اگر SMS / `notify` هک شد، موجودی صندلی تغییر نکند.
- حساب ادمین با IP و 2FA جدا؛ یک `itadmin` باز روی اینترنت کلید کل سیستم است.
- تغییر اسکیما فقط expand/contract تا یک migration خراب یا مخرب نتواند ستون مالی را بدون backup حذف کند.

امتیاز تقلب (`intelligence`) فقط نمره می‌دهد. تصمیم قطع دسترسی با قاعده است: throttle، قفل حساب، 3-D Secure.

#### آنچه الان درست است و نباید خراب شود

- پورت ۳۰۰۰ بک‌اند روی اینترنت publish نشده است.
- DB و Redis و ML داخلی‌اند.
- `SEED_ON_START=true` در production کانتینر را می‌کشد.
- پرداخت بدون PSP واقعی fail-closed است.
- Helmet، rate-limit، `X-Request-Id`، ماسک PII در لاگ شروع شده است.

---

## ۸. قرارداد API عمومی

همهٔ کلاینت‌ها (سایت، پنل، آژانس، پارتنر) از Gateway رد می‌شوند.

```
/api/v1/auth/**              → identity
/api/v1/search/**            → core (Offer)
/api/v1/bookings/**          → core (Order)
/api/v1/reservation/**       → core
/api/v1/flights/**           → core
/api/v1/refunds/**           → core
/api/v1/club/**              → loyalty
/api/v1/agency-portal/**     → agency
/api/v1/notifications/**     → notify
/api/v1/public/**            → experience
/api/v1/panels/**            → ops-admin
/internal/v1/**              → هرگز از اینترنت؛ فقط docker network
```

پاکت پاسخ فعلی حفظ می‌شود:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "…" } }
```

کد خطا انگلیسی پایدار است (`common/errors.ts`). پیام کاربر فارسی است.

مبالغ در JSON **رشتهٔ دهدهی** می‌مانند تا از سقف امن Number جاوااسکریپت رد نشوند.

---

## ۹. مشاهده‌پذیری و عملیات

هر سرویس:

- `GET /health` و `GET /ready` (دیتابیس/صف خودش)
- لاگ JSON ساخت‌یافته (Pino) با `requestId` و `service`
- متریک Prometheus: نرخ، تأخیر، خطا، موجودی صف، شکست migration
- ردگیری خطا (Sentry) با همان request id
- **ممنوع:** `console.log`، توکن، OTP، کد ملی، شماره کارت در لاگ

دیپلوی هدف:

```
CI  →  lint + typecheck + unit + e2e + migrate-from-prod-schema
     →  image immutable با تگ git SHA
     →  staging (دیتابیس جدا، دادهٔ شبیه)
     →  smoke: health، جستجو، لاگین استاف، یک hold آزمایشی
     →  production / UAT با همان SHA
```

سرور فعلی (`docker-compose.prod.yml` + GitHub Actions) همین مدل را دارد ولی **staging جدا** و **smoke اجباری بعد از up** هنوز کم است. قبل از استخراج سرویس سوم، این دو باید اضافه شوند وگرنه میکروسرویس فقط نقاط شکست را زیاد می‌کند.

نسخهٔ قابل‌مشاهده: هر UI و هر `/health` فیلد `commit` و `service` برمی‌گرداند تا معلوم شود «آپدیت نشسته یا نه».

---

## ۱۰. نقشهٔ استخراج (ترتیب اجباری)

استخراج یعنی فرآیند جدا + قرارداد HTTP/رویداد + تست مرز. تغییر پوشه به‌تنهایی میکروسرویس نیست.

| فاز | کار | معیار تمام‌شدن |
|---|---|---|
| ۰ | قرارداد دیپلوی: expand/contract، migrate-from-prod-schema در CI، SHA روی UI، ابطال کش جستجو | آپدیت روی سرور فیچر قبلی را نمی‌شکند |
| ۱ | جدا کردن `notify` (کم‌ریسک). هسته از طریق کلاینت HTTP/outbox حرف می‌زند | OTP و اعلان پنل روی سرویس جدا؛ اگر notify بخوابد رزرو زنده است |
| ۲ | جدا کردن `experience` | صفحهٔ اصلی/بلاگ از کار بیفتد، خرید زنده بماند |
| ۳ | جدا کردن `identity` | JWT RS256؛ سرویس‌ها فقط verify می‌کنند |
| ۴ | schema-per-domain داخل همان Postgres برای core / loyalty / agency | مالکیت جدول روشن؛ هنوز یک primary |
| ۵ | `loyalty` و `agency` به‌عنوان فرآیند جدا، همان خوشهٔ داده | deploy مستقل پرتال/باشگاه |
| ۶ | `intelligence` فعلی + موتور تقلب | نمرهٔ تقلب روی پرداخت اعمال می‌شود، سایت بدون ML کار می‌کند |
| ۷ | `warehouse` + replica | گزارش مدیرعامل روی OLTP فشار نمی‌گذارد |
| ۸ | آداپتور NDC روی `agency` | فروش B2B استاندارد، بدون دست زدن به قفل صندلی |

**خارج از نقشه، مگر تصمیم کتبی جدید:** شکستن `inventory` / `orders` / `payments` به سه دیتابیس.

---

## ۱۱. نگاشت ماژول فعلی → سرویس هدف

| ماژول NestJS فعلی | سرویس هدف |
|---|---|
| `auth` | identity |
| `booking-engine`, `reservation`, `flights`, `flightops`, `pricing`, `refunds`, `manage-booking`, `ancillary-services`, `reconciliation` | core-platform |
| `club` + نقاط/قفل قیمت در booking-engine | loyalty |
| `agencies`, `agency-portal`, `partner-api` | agency |
| `notifications`, `sms` | notify |
| `blog`, `site-content`, `careers`, `contact`, `support-tickets`, `survey`, `files` | experience |
| `panels`, `cartable`, `referrals`, `admins`, `it-manager`, `reporting`, `finance-reports`, `settings`, `audit` | ops-admin |
| `ai` + `ml-service` | intelligence |
| — | warehouse (جدید) |

فرانت (React/PWA) یک کلاینت می‌ماند. به سرویس‌ها مستقیم وصل نمی‌شود؛ فقط به Gateway.

---

## ۱۲. آنچه این معماری عمداً نمی‌کند

- Kubernetes در فاز ۰ تا ۵ لازم نیست. یک سرور + compose برای این مقیاس کافی است؛ K8s وقتی multi-instance و multi-region واقعی شد.
- تعویض TypeORM به Prisma فقط به‌خاطر سند قدیمی. الان TypeORM منبع مهاجرت است.
- DynamoDB / CQRS کامل برای Order. Postgres ACID برای ایرلاین منطقه‌ای درست‌تر است.
- گذاشتن LLM جلوی دیتابیس به‌عنوان «محافظ».
- Seed روی production برای «پر کردن» پنل‌ها.

---

## ۱۳. تصمیم‌های ثبت‌شده

1. سبک هدف: **میکروسرویس محیطی + Core Platform تراکنشی**.
2. یک خوشهٔ PostgreSQL با schema-per-service؛ جداسازی instance فقط برای دامنهٔ غیرتراکنشی.
3. Redis منبع حقیقت صندلی نیست.
4. رویدادها از Outbox هسته خارج می‌شوند.
5. امنیت چندلایه است؛ AI فقط امتیاز می‌دهد.
6. هر ریلیز اسکیما expand-first است.
7. استخراج از `notify` شروع می‌شود، نه از booking.
8. در production مسیر `/docs` عمومی نیست؛ sandbox/seed روی سرور فروش ممنوع است.
9. کلید رمزنگاری PII جدا از backup دیتابیس نگهداری می‌شود.
10. کاهش آسیب حملات با کوچک کردن شعاع انفجار است، نه با گذاشتن LLM جلوی دیتابیس.

این سند وقتی اجرایی است که فاز ۰ (پایداری دیپلوی و لبهٔ HTTPS) بسته شود. بدون آن، افزودن سرویس فقط همان مشکل «آپدیت نمی‌نشیند / فیچر می‌میرد» و سطح حمله را روی چند فرآیند تکرار می‌کند.
