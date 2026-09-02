# راه‌اندازی روی سرور خام با آدرس IP (بدون دامنه)

این راهنما برای بالا آوردن کل پروژه (بک‌اند، فرانت‌اند، ml-service،
پستگرس، ردیس) روی یک سرور تازه با Docker است — فقط با آدرس IP، بدون
نیاز به دامنه یا SSL.

## پیش‌نیاز روی سرور

```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin   # اگر با اسکریپت بالا نصب نشد
```

## مراحل

1. **کد را روی سرور بیاورید:**
   ```bash
   git clone https://github.com/Sadeqkazemi/blujet2.git
   cd blujet2
   git checkout claude/airline-project-design-difvku
   ```

2. **فایل env بسازید:**
   ```bash
   cp .env.production.example .env
   nano .env
   ```
   مقادیر زیر را حتماً پر کنید:
   - `SERVER_IP` — آدرس IP واقعی سرور (مثلاً `203.0.113.10`)
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PII_ENCRYPTION_KEY` — هرکدام با `openssl rand -hex 32`
   - `POSTGRES_PASSWORD`, `ML_SERVICE_INTERNAL_TOKEN` — با `openssl rand -hex 24`
   - `SEED_ON_START=true` **فقط برای اولین بار** (داده نمونه/تست می‌سازد؛ بعد از اولین بالا آمدن به `false` برگردانید)

3. **بیلد و اجرا:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   اولین بار چند دقیقه طول می‌کشد (بیلد فرانت‌اند + بک‌اند + ml-service).
   مهاجرت‌های دیتابیس (`prisma migrate deploy`) به‌طور خودکار قبل از
   بالا آمدن بک‌اند اجرا می‌شوند.

4. **بررسی سلامت:**
   ```bash
   curl http://SERVER_IP/health
   ```
   باید `{"status":"ok", ...}` برگرداند.

## آدرس‌های دسترسی (بعد از بالا آمدن)

جایگزین `SERVER_IP` با IP واقعی سرورتان کنید.

| بخش | آدرس |
|---|---|
| سایت عمومی (جستجو و خرید بلیط) | `http://SERVER_IP/` |
| ورود مدیران و کارمندان | `http://SERVER_IP/login` |
| پنل مدیریتی (بعد از ورود، بر اساس نقش) | `http://SERVER_IP/panel` |
| ورود پنل آژانس | `http://SERVER_IP/agency/login` |
| پنل آژانس | `http://SERVER_IP/agency` |
| مستندات API (Swagger) | `http://SERVER_IP/docs` |
| بررسی سلامت بک‌اند | `http://SERVER_IP/health` |

پنل مدیریتی یک shell واحد است — بعد از ورود با هر نقش (مدیر عامل، رئیس
هیئت مدیره، مدیر ارشد، مدیر مالی، مدیر بازرگانی، مدیر IT، کارمند، ادمین
سایت)، فقط تب‌های مجاز همان نقش در `/panel` نمایش داده می‌شود — همه از
همان یک آدرس وارد می‌شوند.

## حساب‌های نمونه (فقط اگر `SEED_ON_START=true` بوده)

رمز مشترک همه نقش‌ها: `Blujet@1404` (نام کاربری‌ها در
`backend/prisma/seed.ts` — مثل `ceo`, `chair`, `senior`,
`finance`, `comm`, `itadmin`, `site.admin`).

**قبل از استفاده واقعی و در دسترس عموم قرار دادن سرور، این حساب‌های نمونه
را حذف یا رمزشان را عوض کنید** — این‌ها فقط برای تست اولیه‌اند.

## معماری دسترسی

فرانت‌اند و بک‌اند پشت **یک nginx** روی پورت ۸۰ سرو می‌شوند — nginx
مسیرهای API (`/auth`, `/bookings`, `/search`, ...) را به کانتینر backend
proxy می‌کند و بقیه مسیرها را به‌عنوان صفحات React (SPA) سرو می‌کند. این
یعنی همه‌چیز از یک origin واحد در دسترس است (کوکی نشست بدون مشکل
cross-origin کار می‌کند) و فرانت‌اند حتی نیازی به دانستن IP سرور در زمان
بیلد ندارد.

پورت ۳۰۰۰ بک‌اند دیگر مستقیماً به بیرون باز نیست (فقط `expose` داخل شبکه
Docker) — همه ترافیک، از جمله Swagger و health، باید از پورت ۸۰ (nginx)
عبور کند. برای دیباگ مستقیم روی سرور:
```bash
docker compose -f docker-compose.prod.yml exec backend curl -s localhost:3000/health
```

## نکات امنیتی مهم

- این راه‌اندازی روی **HTTP ساده** است (بدون SSL) چون دامنه‌ای وجود
  ندارد. کوکی نشست refresh با `COOKIE_SECURE=false` تنظیم شده تا روی
  HTTP هم کار کند — **وقتی دامنه واقعی و HTTPS گرفتید، حتماً
  `COOKIE_SECURE` را در `.env` به `true` تغییر دهید** و nginx/Caddy را
  برای auto-HTTPS جلوی همین سرویس‌ها اضافه کنید (طبق `CLAUDE.md`).
- پورت‌های ۵۴۳۲ (پستگرس)، ۶۳۷۹ (ردیس) و ۸۰۰۰ (ml-service) به بیرون
  expose نمی‌شوند — فقط بین کانتینرها در شبکه داخلی Docker در دسترس‌اند.
- درگاه پرداخت روی `sandbox` تنظیم شده (هیچ پرداخت واقعی انجام نمی‌شود).
  برای پرداخت واقعی، درایور واقعی درگاه شتاب/IPG باید جایگزین شود.
- `SmsProvider` روی `mock` است — کد OTP واقعی پیامک نمی‌شود؛ در لاگ‌های
  کانتینر backend قابل مشاهده است (`docker compose logs backend`).

## دستورات مفید بعد از استقرار

```bash
# مشاهده لاگ‌ها
docker compose -f docker-compose.prod.yml logs -f backend

# اجرای مهاجرت جدید بعد از آپدیت کد
docker compose -f docker-compose.prod.yml up -d --build backend

# بکاپ دیتابیس
docker compose -f docker-compose.prod.yml exec db pg_dump -U blujet blujet > backup.sql

# توقف کامل
docker compose -f docker-compose.prod.yml down
```

## مقیاس‌پذیری بک‌اند (فاز ۲ — ترافیک)

وقتی ترافیک سایت بالا رفت، بک‌اند را می‌توان به چند نمونه (replica) بدون
تغییر nginx یا فرانت‌اند مقیاس داد — nginx با DNS داخلی داکر
(`resolver 127.0.0.11`) خودش درخواست‌ها را بین نمونه‌ها پخش می‌کند:

```bash
docker compose -f docker-compose.prod.yml up -d --build --scale backend=3
```

نکات:
- بک‌اند stateless است (نشست‌ها JWT هستند، نه session داخل حافظه)، پس
  چند نمونه بدون sticky-session مشکلی ندارد.
- منابع مشترک (Redis برای کش جستجو، Postgres برای seat lock) بین همه
  نمونه‌ها یکسان است — قفل صندلی (`SELECT ... FOR UPDATE`) در دیتابیس
  انجام می‌شود، نه در حافظه یک نمونه، پس دوبار فروخته‌شدن یک صندلی روی
  چند نمونه هم رخ نمی‌دهد.
- تعداد نمونه را متناسب با CPU/RAM سرور تنظیم کنید — روی یک VPS تک‌هسته‌ای
  مقیاس‌دهی بک‌اند سودی ندارد؛ ابتدا مطمئن شوید سرور واقعاً چند هسته دارد.
