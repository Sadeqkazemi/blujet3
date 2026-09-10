# Microservices phase 6 — Experience physical database bootstrap

## دامنه

این برش bootstrap دیتابیس مستقل `experience-service` را برای ۱۵ جدول محتوای
سایت، فایل، استخدام، پشتیبانی و نظرسنجی آماده می‌کند. مسیرهای خرید، موجودی،
Order و Payment خارج از این سرویس و بدون تغییر می‌مانند.

## مالکیت و وابستگی

- همهٔ entityها در schema `experience` هستند.
- شناسه‌های `authorId`، `uploadedById`، `ownerId`، `bookingId` و
  `flightInstanceId` فقط reference پایدار یا snapshot تأییدشده‌اند؛ دیتابیس
  Experience به جداول Identity، Order یا Inventory کلید خارجی و join runtime
  ندارد.
- ارتباط `site_media_assets.storedFileId` با `stored_files.id` داخل همان دامنه
  است و می‌تواند foreign key داخلی داشته باشد.
- فایل باینری در storage/volume موجود می‌ماند و metadata آن در دیتابیس
  Experience است. انتقال object storage در این برش انجام نمی‌شود.

## قواعد مهاجرت

- `experience-service` فقط از `EXPERIENCE_DATABASE_URL` و migration مستقل
  TypeORM خودش استفاده می‌کند.
- migration یک دیتابیس خالی را bootstrap می‌کند و هیچ داده‌ای را از دیتابیس
  Core کپی، حذف یا هم‌زمان‌نویسی نمی‌کند.
- CI سرویس را روی PostgreSQL خالی و migration مستقل اجرا می‌کند؛ fixtureهای
  E2E نباید جدول `users`، `bookings` یا `flight_instances` بسازند یا بخوانند.
- public/internal HTTP contract و feature flagهای فعلی تغییر نمی‌کنند.

## گیت‌های پذیرش

- [x] DataSource و scriptهای مستقل migration.
- [x] migration دقیق ۱۵ entity با schema `experience` و فقط foreign key داخلی.
- [x] تست metadata/migration و E2E بدون وابستگی دیتابیس Core.
- [ ] provision دیتابیس و role غیرسوپریوزر، backup و storage توسط عملیات.
- [ ] انتقال داده با row-count/checksum، سپس parity و UAT.
- [ ] تغییر production URL و deploy فقط با تأیید جداگانه.

تا بسته‌شدن گیت‌های عملیاتی، این قابلیت آمادهٔ اجرا است ولی روی production
فعال نیست و dual-write ایجاد نمی‌شود.
