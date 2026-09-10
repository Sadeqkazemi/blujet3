# Microservices phase 6 — Notify physical database bootstrap

## دامنه

این برش فقط bootstrap دیتابیس مستقل سرویس `notify` را آماده می‌کند. مالکیت
داده‌های `notify.notifications` و `notify.sms_logs` در خود سرویس ثبت می‌شود و
سرویس به جدول‌های Core یا Experience کلید خارجی و join runtime ندارد.

## تصمیم اجرایی

- `notify-service` از `NOTIFY_DATABASE_URL` استفاده می‌کند و migration مستقل
  خودش را با TypeORM اجرا می‌کند.
- دیتابیس مقصد باید PostgreSQL جداگانه با role غیرسوپریوزر باشد؛ role فقط روی
  schema `notify` دسترسی نوشتن دارد.
- migration فقط ساختار خالی و ایندکس‌های لازم را می‌سازد و هیچ داده‌ای را از
  دیتابیس فعلی کپی یا حذف نمی‌کند.
- تا زمان اجرای runbook انتقال داده، تأیید parity و فعال‌سازی جداگانه، compose
  فعلی و مسیرهای HTTP بدون تغییر می‌مانند. dual-write و cutover خودکار ممنوع
  است.
- هستهٔ تراکنشی Order/Inventory/Payment در این برش جدا نمی‌شود.

## ساختار ایجادشده

Migration مستقل این موارد را ایجاد می‌کند:

- schema `notify`؛
- enumهای `NotificationCategory`, `SmsMessageType` و `SmsStatus` در همان schema؛
- جدول‌های `notify.notifications` و `notify.sms_logs` با ستون‌ها، کلیدها و
  ایندکس‌های هم‌قرارداد با entityهای سرویس؛
- unique جزئی روی `sms_logs.sourceEventId` برای replay امن outbox.

## گیت‌های فعال‌سازی

- [x] DataSource مستقل و scriptهای `migration:run` و `migration:run:prod`؛
  `src/database/domain-schema.spec.ts` بارگذاری migration را اثبات می‌کند.
- [x] migration بدون foreign key بین دامنه‌ای و بدون data copy؛
  `src/database/create-notify-database.migration.spec.ts` دامنهٔ SQL و ترتیب
  rollback را اثبات می‌کند.
- [ ] provision واقعی PostgreSQL/role و backup توسط عملیات.
- [ ] انتقال دادهٔ موجود با شمارش و checksum و پنجرهٔ rollback.
- [ ] اجرای smoke/UAT روی دیتابیس جدا و تأیید owner.
- [ ] تغییر `NOTIFY_DATABASE_URL` در محیط production و deploy دستی.

تا تکمیل گیت‌های باز، جداسازی فیزیکی «آمادهٔ اجرا» است، نه فعال‌شده در
production.
