# Inventory read-only process boundary

## تصمیم و دامنه

این برش فقط یک فرآیند خواندنی و مشاهده‌ای برای موجودی است. هستهٔ تراکنشی
همچنان تنها نویسندهٔ `inventory`، `orders` و `payments` می‌ماند؛ این سرویس
هیچ مسیر ایجاد، قفل، آزادسازی، فروش یا اصلاح ظرفیت ندارد و منبع حقیقت صندلی
نیست.

## قرارداد داخلی

`GET /internal/v1/inventory/flights/:flightInstanceId/availability`

هدر اجباری `X-Internal-Token` است. پاسخ شامل شناسهٔ پرواز، ظرفیت، وضعیت،
تعداد صندلی‌های فروخته‌شدهٔ ثبت‌شده در snapshotهای Core، Holdهای فعال، لاک‌های
فعال، ظرفیت آزاد محاسبه‌شده و زمان مشاهدهٔ UTC است. هیچ مسافر، کاربر، آژانس،
قیمت یا دادهٔ پرداختی برگردانده نمی‌شود.

مقادیر `soldSeats` و `heldSeats` فقط projection مشاهده‌ای هستند و عملیات
انقضا یا آزادسازی انجام نمی‌دهند. محاسبهٔ ظرفیت آزاد منفی نمی‌شود؛ تصمیم نهایی
فروش و قفل همزمان فقط در Core و داخل تراکنش PostgreSQL انجام می‌شود.

## جداسازی داده

فرآیند با نقش غیرمالک `blujet_inventory_reader`، اتصال بدون migration و
`default_transaction_read_only=on` اجرا می‌شود. نقش فقط ستون‌های زیر را می‌خواند:

- `inventory.flight_instances`: شناسه، زمان‌ها، ظرفیت، وضعیت، سهم آژانس و نسخه
- `inventory.seat_locks`: شناسهٔ پرواز، زمان آزادسازی/انقضا و شناسهٔ سفارش
- `orders.core_itinerary_orders`: شناسه، وضعیت، مهلت Hold و نسخه
- `orders.core_itinerary_segments`: شناسهٔ سفارش/پرواز و `occupiedSeats`

رابطهٔ مسافر و تمام PII عمداً خارج از grant است. نقش مالکیت، عضویت، DDL،
sequence و هر نوع write ندارد.

## فعال‌سازی و rollback

پروفایل Compose و endpoint داخلی پیش‌فرض خاموش است. فعال‌سازی فقط پس از
provision نقش و smoke داخلی مجاز است. rollback با خاموش‌کردن profile/مسیر
انجام می‌شود؛ هیچ migration، dual-write یا تغییر مسیر عمومی `/api/v1/**`
در این برش وجود ندارد.

## معیار پذیرش

- [x] auth داخلی و validation شناسهٔ پرواز با تست HTTP
- [x] projection محدود و بدون PII با تست واحد
- [x] نقش PostgreSQL ستون‌محور، read-only و بدون write با تست SQL
- [x] health/readiness fail-closed و Compose profile پیش‌فرض خاموش
- [x] build، typecheck، lint، تست واحد و تست PostgreSQL در CI
- [ ] هرگونه cutover عمومی یا خروج موجودی از Core نیازمند تصمیم معماری جداست
