import { MigrationInterface, QueryRunner } from 'typeorm';

type CatalogRow = {
  dept: string;
  sectionKey: string;
  sectionLabelFa: string;
  key: string;
  labelFa: string;
};

/** Adds the phase-one unit/action catalog for IT's employee form. */
export class GranularEmployeePermissionCatalog1788787200000
  implements MigrationInterface
{
  name = 'GranularEmployeePermissionCatalog1788787200000';

  private readonly rows: CatalogRow[] = [
    ['commercial', 'agencies', 'مدیریت آژانس‌ها', 'ag_partners', 'مشاهده آژانس‌های همکار'],
    ['commercial', 'agencies', 'مدیریت آژانس‌ها', 'ag_debtors', 'مشاهده آژانس‌های دارای بدهی'],
    ['commercial', 'routes', 'مسیرهای پروازی', 'rt_view', 'مشاهده مسیرهای پروازی'],
    ['commercial', 'routes', 'مسیرهای پروازی', 'rt_create', 'افزودن مسیر پروازی'],
    ['commercial', 'routes', 'مسیرهای پروازی', 'rt_manage', 'مدیریت مسیرهای فعال'],
    ['commercial', 'aircraft', 'تعریف هواپیما', 'ac_view', 'مشاهده هواپیماها و نقشه کابین'],
    ['commercial', 'aircraft', 'تعریف هواپیما', 'ac_manage', 'ایجاد و ویرایش هواپیما'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_active', 'مشاهده پروازهای فعال'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_add', 'افزودن پرواز'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_assign', 'تعیین و برنامه‌ریزی پرواز'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_completed', 'مشاهده پروازهای انجام‌شده'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_cities', 'مدیریت شهرهای پروازی'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_costs', 'مشاهده هزینه‌های سفر'],
    ['commercial', 'flights', 'مدیریت پروازها', 'fl_history', 'مشاهده تاریخچه پرواز'],
    ['commercial', 'operations', 'عملیات', 'op_view', 'مشاهده عملیات پروازی'],
    ['commercial', 'operations', 'عملیات', 'op_manage', 'مدیریت و اجرای عملیات'],
    ['commercial', 'services', 'خدمات', 'sv_view', 'مشاهده خدمات'],
    ['commercial', 'services', 'خدمات', 'sv_manage', 'مدیریت خدمات'],
    ['commercial', 'reports', 'گزارش‌ها', 'rp_passengers', 'گزارش مسافران'],
    ['commercial', 'club', 'قوانین باشگاه مشتریان', 'cl_rules_view', 'مشاهده قوانین باشگاه مشتریان'],
    ['commercial', 'club', 'قوانین باشگاه مشتریان', 'cl_rules_manage', 'مدیریت قوانین باشگاه مشتریان'],
    ['commercial', 'webservice', 'وب‌سرویس', 'ws_view', 'مشاهده وب‌سرویس‌ها'],
    ['commercial', 'webservice', 'وب‌سرویس', 'ws_manage', 'مدیریت وب‌سرویس‌ها'],
    ['finance', 'agencies', 'آژانس‌ها', 'ag_list', 'مشاهده فهرست آژانس‌ها'],
    ['finance', 'credit', 'اعتبار و تسویه', 'cr_view', 'مشاهده اعتبار و تسویه آژانس‌ها'],
    ['finance', 'credit', 'اعتبار و تسویه', 'cr_manage', 'مدیریت اعتبار و تسویه آژانس‌ها'],
    ['finance', 'reports', 'گزارش‌ها و خروجی', 'rp_exports', 'گزارش‌ها و خروجی‌ها'],
    ['it', 'users', 'مدیریت کاربران', 'us_list', 'مشاهده فهرست کاربران'],
    ['it', 'users', 'مدیریت کاربران', 'us_create', 'افزودن کاربر'],
    ['it', 'users', 'مدیریت کاربران', 'us_permissions', 'مدیریت دسترسی کاربران'],
    ['it', 'users', 'مدیریت کاربران', 'us_status', 'فعال‌سازی و تعلیق کاربر'],
    ['it', 'users', 'مدیریت کاربران', 'us_reset_password', 'بازنشانی رمز عبور'],
    ['it', 'services', 'سرویس‌های سایت', 'sv_view', 'مشاهده وضعیت سرویس‌ها'],
    ['it', 'services', 'سرویس‌های سایت', 'sv_config', 'پیکربندی سرویس‌ها'],
    ['it', 'security', 'امنیت', 'sc_view', 'مشاهده سیاست و نشست‌های امنیتی'],
    ['it', 'security', 'امنیت', 'sc_sessions', 'مدیریت نشست‌ها و خروج همه کاربران'],
    ['it', 'logs', 'لاگ و رویدادها', 'lg_export', 'خروجی گرفتن از لاگ‌ها'],
  ].map(([dept, sectionKey, sectionLabelFa, key, labelFa]) => ({
    dept,
    sectionKey,
    sectionLabelFa,
    key,
    labelFa,
  }));

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of this.rows) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("id", "dept", "sectionKey", "sectionLabelFa", "key", "labelFa")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("dept", "key") DO UPDATE SET
           "sectionKey" = EXCLUDED."sectionKey",
           "sectionLabelFa" = EXCLUDED."sectionLabelFa",
           "labelFa" = EXCLUDED."labelFa"`,
        [
          `perm:${row.dept}:${row.key}`,
          row.dept,
          row.sectionKey,
          row.sectionLabelFa,
          row.key,
          row.labelFa,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const row of this.rows) {
      await queryRunner.query(
        `DELETE FROM "permissions" WHERE "dept" = $1 AND "key" = $2`,
        [row.dept, row.key],
      );
    }
  }
}
