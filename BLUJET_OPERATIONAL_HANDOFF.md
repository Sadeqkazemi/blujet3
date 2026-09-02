# تحویل نسخه عملیاتی blujet

تاریخ تهیه: ۱۴۰۵/۰۶/۱۱ (2026-09-02)

## نسخه مبنا

- مخزن: `https://github.com/Sadeqkazemi/blujet2`
- شاخه: `main`
- commit دیپلوی‌شده: `bf3741ae4288486e28306e910dbd91dbc4585dff`
- عنوان commit: `fix(deploy): bootstrap PSS host secrets (#272)`
- وضعیت UAT در زمان تحویل: frontend و endpoint سلامت backend با پاسخ HTTP 200؛ پایگاه داده اصلی و سرویس/پایگاه داده PSS در اجرای deploy سالم گزارش شدند.

این بسته با `git archive` مستقیماً از commit بالا ساخته شده است؛ بنابراین فایل‌های تغییرنیافته محلی، secretها، `node_modules`، cache، log، `dist` و داده‌های آپلودی در آن نیستند.

## اجزای عملیاتی

| مسیر | کاربرد |
| --- | --- |
| `backend/` | API اصلی NestJS، منطق رزرو/فروش/کیف پول/مالی، migrationهای TypeORM و آزمون‌ها |
| `frontend/` | رابط React + TypeScript + Vite، صفحات عمومی و پنل‌های نقش‌محور |
| `ml-service/` | سرویس داخلی FastAPI برای پیشنهاد و تحلیل قیمت |
| `pss-service/` | پایه مستقل PSS مرکزی، پایگاه داده جدا، احراز هویت داخلی، idempotency، outbox و reconciliation سایه‌ای |
| `docs/` | قرارداد API، مدل داده، Runbook، استقرار و اسناد پذیرش قابلیت‌ها |
| `scripts/` | اسکریپت‌های عملیاتی، backup/restore، smoke و load test |
| `design-reference/` و `design-reference-v2/` | مرجع تصویری مورد تأیید طراحی؛ در runtime بارگذاری نمی‌شوند اما مرجع توسعه و کنترل UI هستند |
| `.github/` | CI، کنترل کیفیت، CodeQL و deploy UAT |
| `docker-compose.prod.yml` | تعریف stack عملیاتی |

سرویس‌های stack عملیاتی: `frontend`، `backend`، `ml-service`، `pss-service`، PostgreSQL اصلی، PostgreSQL مخصوص PSS و Redis.

## مستندات و API

- `docs/openapi.json`: قرارداد ماشین‌خوان API اصلی و منبع اصلی endpointها
- `docs/API.md`: توضیح انسانی API و نقش/دسترسی endpointها
- `docs/DB_SCHEMA.md`: مدل داده و قواعد مالی/هویتی
- `docs/RUNBOOK.md`: سلامت، log، backup، restore و rollback
- `docs/DEPLOY_IP.md`: استقرار مبتنی بر IP و تنظیمات UAT
- `docs/features/central-pss-crs.md`: محدوده واقعی و برنامه مهاجرت PSS/CRS مرکزی
- Swagger API اصلی: `/docs`
- سلامت API اصلی: `/health` و `/api/v1/health`

API داخلی PSS فقط داخل شبکه Docker و با هدر `X-Internal-Token` در دسترس است:

- `GET /health`, `GET /health/live`, `GET /health/ready`
- `GET /internal/v1/capabilities`
- `POST /internal/v1/reconciliation/shadow`
- Swagger داخلی: `/internal/docs`

## وضعیت واقعی PSS مرکزی

در نسخه تحویلی فقط Slice 0 عملیاتی است: shell مستقل، دیتابیس مستقل، احراز هویت داخلی، idempotency، transactional outbox و گزارش reconciliation سایه‌ای. قابلیت فروش PSS عمداً با `PSS_INTEGRATION_ENABLED=false` غیرفعال است تا cutover مالی/موجودی با تأیید جداگانه انجام شود.

موارد multi-segment PNR، inventory authority، e-ticket/coupon accountable، EMD، Nira، NDC و interline هنوز در `GET /internal/v1/capabilities` مقدار `false` دارند و نباید کامل یا عملیاتی تلقی شوند.

## اجرای محلی و کنترل کیفیت

پیش‌نیازها: Docker Compose، Node.js 22، npm و Python 3.12.

```bash
docker compose up -d
cd backend && npm ci && npm run migration:run && npm run start:dev
cd frontend && npm ci && npm run dev
cd ml-service && python -m pip install -e ".[dev]" && uvicorn app.main:app --reload
```

کنترل‌های اصلی:

```bash
cd backend && npm run lint && npm run build && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm test
cd ml-service && pytest
cd pss-service && npm run lint && npm run build && npm test && npm run test:e2e
```

## فایل‌های حذف یا مستثناشده

موارد زیر کد منبع نیستند و دوباره از روی package lock و source ساخته می‌شوند؛ در بسته تحویل وجود ندارند و از workspace نیز پاک‌سازی شده‌اند:

- `node_modules/` در سرویس‌های Node
- `dist/` و cacheهای Vite/npm
- `.gh-cache/` و log محلی CI

`backend/uploads/` حذف نشده است، چون ممکن است حاوی داده یا مدرک آپلودشده کاربر باشد. این پوشه عمداً داخل ZIP سورس نیست و در انتقال سرور باید مانند داده عملیاتی، جداگانه و امن backup شود.

## امنیت و راه‌اندازی

هیچ مقدار secret یا فایل `.env` واقعی در بسته وجود ندارد. فقط فایل‌های example تحویل شده‌اند. مقادیر واقعی باید در محیط محافظت‌شده سرور یا GitHub Actions قرار گیرند. نام متغیرهای لازم در `.env.production.example` و فایل‌های `.env.example` هر سرویس ثبت شده است.

برای deploy فقط workflowهای GitHub Actions استفاده شوند؛ سرور نباید با pull/merge دستی به‌روزرسانی شود.
