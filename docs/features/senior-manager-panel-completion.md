# Feature: تکمیل پنل مدیر ارشد

## Acceptance checklist

- [x] سایدبار مدیر ارشد شامل: داشبورد، آژانس‌ها، مدیریت پروازها، مدیران و ادمین‌ها، گزارش مسافران، مالی، کارتابل، ارجاعات، گزارش مدیران، مشتریان VIP، نظرسنجی مسافران، دسترسی به پنل‌ها، امنیت و رمز عبور، سامانه رزرواسیون. — `backend/test/panels.e2e-spec.ts` + `frontend/e2e/staff-login-journey.spec.ts`
- [x] «مشتریان» و «تعریف هواپیما» در ناوبری ارشد نیستند. — `panels.e2e-spec.ts`
- [x] سامانه رزرواسیون در nav ارشد است و قفل صندلی / مدیریت PNR برای `SENIOR_MANAGER` مجاز است (دیگر view-only نیست). — `reservation-roles.ts`, `reservation.e2e-spec.ts`, `reservation-journey.spec.ts`
- [x] صفحه مدیران از APIهای واقعی فهرست، ایجاد، سطح دسترسی، مسدودسازی و بازنشانی رمز استفاده می‌کند. — `PanelAdminsPage.tsx`, `backend/test/phase12.e2e-spec.ts`
- [x] مدیر ارشد فقط نقش‌های زیرمجموعهٔ مجاز خود را می‌تواند ایجاد کند. — کنترل UI + `AdminsService.managedRolesFor`
- [x] فرم ایجاد مدیر مطابق مرجع، نام، ایمیل سازمانی، نقش و دسترسی‌های قابل اعمال در سرور را نمایش می‌دهد. — `PanelAdminsPage.test.tsx`
- [x] رمز اولیه به‌صورت امن تولید و فقط یک‌بار پس از ایجاد برای تحویل نمایش داده می‌شود. — `PanelAdminsPage.tsx`, `phase12.e2e-spec.ts`
- [x] صفحه مشتریان VIP از API واقعی اعضا و درخواست‌های کارت استفاده می‌کند و قواعد نقش مدیر ارشد را حفظ می‌کند. — `ClubPage.test.tsx`, `club.e2e-spec.ts`
- [x] گزارش مسافران برای ارشد قابل جستجو است (کد ملی masked). — `finance-reports-journey.spec.ts`
- [x] ارجاعات و آژانس‌ها از nav قابل دسترسی‌اند (دیگر orphan نیستند). — `cartable-journey.spec.ts`, `agencies-journey.spec.ts`
- [x] تست ناوبری سرور، فرم مدیران و قرارداد مسیرهای پنل سبز است. — `PanelRouteContract.test.ts`
