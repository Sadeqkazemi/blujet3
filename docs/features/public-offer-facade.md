# Public Offer compatibility facade — implementation

Status: **implemented; feature flag remains default-off**

این slice یک مسیر افزایشی برای اتصال سایت و پرتال آژانس به Offer امضاشدهٔ Core
اضافه می‌کند. هستهٔ تراکنشی، نویسندهٔ فعلی رزرو، جست‌وجوی مهمان و مسیرهای موجود
بدون تغییر می‌مانند. فعال‌سازی فقط با فلگ صریح انجام می‌شود و خاموش‌کردن فلگ
rollback فوری به رفتار قبل است.

## Contract

- `POST /api/v1/search/offers` همان پاکت `{ success: true, data }` فعلی را
  حفظ می‌کند و فقط برای نقش‌های `USER` و `AGENCY` قابل دسترسی است.
- بدنه فقط `segments[]`، `travellers[]` و خدمات اختیاری هر سگمنت را می‌پذیرد؛
  `seller`، `sellerId` و `channel` از مرورگر پذیرفته نمی‌شوند.
- سرویس از JWT جاری برای `USER → SYSTEM + seller.type=USER` و
  `AGENCY → AGENCY + seller.type=AGENCY` استفاده می‌کند؛ `id` همیشه همان
  `AuthenticatedUser.id` است.
- وقتی `CORE_OFFER_PUBLIC_ENABLED` برابر `false` (پیش‌فرض) باشد، هیچ quote یا
  write اجرا نمی‌شود و پاسخ fail-closed با `503 OFFER_UNAVAILABLE` برمی‌گردد.
- وقتی فلگ روشن باشد، مسیر فقط Core Offer stateless را صدا می‌زند؛ ایجاد Order،
  Hold، Ledger، Outbox یا ذخیرهٔ توکن انجام نمی‌شود. مصرف Offer همچنان از مسیر
  داخلیِ دارای service identity و idempotency انجام می‌شود.
- `GET /api/v1/search/flights`، `GET /api/v1/search/**` فعلی و
  `POST /api/v1/bookings` برای rollback و سازگاری مهمان دست‌نخورده می‌مانند.
- این slice هیچ migration، writer جدید، PSS cutover، PSP/NIRA call یا deploy
  ندارد. فعال‌سازی production/UAT یک تأیید عملیاتی جداست.

## Rollback

۱. `CORE_OFFER_PUBLIC_ENABLED=false` را اعمال کنید؛ مسیر جدید فوراً fail-closed
   می‌شود و مسیرهای قبلی ادامه می‌یابند.
۲. در صورت مشکل کد، rollback کد به SHA قبلی بدون rollback دیتابیس کافی است؛
   این slice تغییری در schema ندارد.
۳. قبل از فعال‌سازی، parity پاسخ Quote و سناریوی واقعی USER/AGENCY باید جداگانه
   تأیید شود. جست‌وجوی مهمان عمداً تا تصمیم مالک دربارهٔ seller ناشناس به مسیر
   قدیمی متصل می‌ماند.

## Acceptance checklist

- [x] DTO عمومی seller/channel/owner را از ورودی حذف و nested validation را
      حفظ می‌کند.
- [x] JWT role و id تنها منبع seller binding هستند؛ ورودی کلاینت نادیده گرفته
      یا پذیرفته نمی‌شود.
- [x] فلگ default-off است، در startup فقط `true|false` می‌پذیرد و خاموشی هیچ
      call به Quote/Core ندارد (`PublicOfferFacadeService` specs).
- [x] مسیر روشن USER و AGENCY به Core Offer با mapping صحیح واگذار می‌شود
      (`binds USER` و `binds AGENCY` specs).
- [x] 401/403 توسط `JwtAuthGuard`/`RolesGuard` و 400 توسط DTO validation کنترل
      می‌شوند؛ fail-closed 503 در تست سرویس پوشش دارد و تست‌های legacy سبز می‌مانند.
- [ ] owner approval برای implementation، فعال‌سازی فلگ، parity و push/merge.
- [ ] UAT canary و deploy (خارج از این slice).

## Explicitly deferred

- Offer برای کاربر مهمان؛ تا زمانی که مالک seller پایدار و احراز هویت آن مشخص
  نشود نباید حدس زده شود.
- تغییر `POST /bookings` به مصرف عمومی Offer؛ این کار به mapping کامل payment،
  ticketing و response contract نیاز دارد و مرحلهٔ جداست.
- NDC، NIRA/DCS، PSP واقعی و جداسازی دیتابیس‌های Order/Inventory/Payment.
