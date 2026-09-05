import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TravelExtraLocalizedDescriptions1789824000000
  implements MigrationInterface
{
  name = 'TravelExtraLocalizedDescriptions1789824000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" ADD COLUMN IF NOT EXISTS "descriptionEn" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" ADD COLUMN IF NOT EXISTS "descriptionAr" text`,
    );
    await queryRunner.query(`
      UPDATE "travel_extra_settings" SET
        "titleEn" = CASE "code"
          WHEN 'EXTRA_BAGGAGE' THEN 'Extra baggage'
          WHEN 'SEAT_SELECTION' THEN 'Advance seat selection'
          WHEN 'TRAVEL_INSURANCE' THEN 'Travel insurance'
          WHEN 'SPECIAL_MEAL' THEN 'Special meal'
          WHEN 'DATE_CHANGE' THEN 'Flight date change'
          WHEN 'REFUND_FEE' THEN 'Ticket refund'
          WHEN 'CIP' THEN 'Airport CIP service'
          WHEN 'PET' THEN 'Pet travel'
          WHEN 'WHEELCHAIR' THEN 'Wheelchair assistance'
          ELSE "titleEn" END,
        "titleAr" = CASE "code"
          WHEN 'EXTRA_BAGGAGE' THEN 'أمتعة إضافية'
          WHEN 'SEAT_SELECTION' THEN 'اختيار المقعد مسبقاً'
          WHEN 'TRAVEL_INSURANCE' THEN 'تأمين السفر'
          WHEN 'SPECIAL_MEAL' THEN 'وجبة خاصة'
          WHEN 'DATE_CHANGE' THEN 'تغيير تاريخ الرحلة'
          WHEN 'REFUND_FEE' THEN 'استرداد التذكرة'
          WHEN 'CIP' THEN 'خدمة كبار الشخصيات في المطار'
          WHEN 'PET' THEN 'سفر الحيوانات الأليفة'
          WHEN 'WHEELCHAIR' THEN 'خدمة الكرسي المتحرك'
          ELSE "titleAr" END,
        "descriptionEn" = CASE "code"
          WHEN 'EXTRA_BAGGAGE' THEN 'Purchase baggage beyond the ticket allowance'
          WHEN 'SEAT_SELECTION' THEN 'Choose a preferred seat during booking'
          WHEN 'TRAVEL_INSURANCE' THEN 'Travel delay and loss protection'
          WHEN 'SPECIAL_MEAL' THEN 'Choose a special in-flight meal'
          WHEN 'DATE_CHANGE' THEN 'Service fee for changing the travel date'
          WHEN 'REFUND_FEE' THEN 'Ticket refund processing service'
          WHEN 'CIP' THEN 'Dedicated airport reception and assistance'
          WHEN 'PET' THEN 'Transport a pet in the cabin or hold'
          WHEN 'WHEELCHAIR' THEN 'Wheelchair assistance at the airport'
          ELSE "descriptionEn" END,
        "descriptionAr" = CASE "code"
          WHEN 'EXTRA_BAGGAGE' THEN 'شراء وزن إضافي فوق المسموح في التذكرة'
          WHEN 'SEAT_SELECTION' THEN 'اختيار المقعد المفضل أثناء الحجز'
          WHEN 'TRAVEL_INSURANCE' THEN 'تغطية تأخير الرحلة والخسائر'
          WHEN 'SPECIAL_MEAL' THEN 'اختيار وجبة خاصة على متن الطائرة'
          WHEN 'DATE_CHANGE' THEN 'رسوم خدمة تغيير تاريخ السفر'
          WHEN 'REFUND_FEE' THEN 'خدمة معالجة استرداد التذكرة'
          WHEN 'CIP' THEN 'استقبال ومساعدة خاصة في المطار'
          WHEN 'PET' THEN 'نقل الحيوان الأليف في المقصورة أو مخزن الأمتعة'
          WHEN 'WHEELCHAIR' THEN 'مساعدة الكرسي المتحرك في المطار'
          ELSE "descriptionAr" END,
        "updatedAt" = now()
      WHERE "code" IN (
        'EXTRA_BAGGAGE','SEAT_SELECTION','TRAVEL_INSURANCE','SPECIAL_MEAL',
        'DATE_CHANGE','REFUND_FEE','CIP','PET','WHEELCHAIR'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" DROP COLUMN IF EXISTS "descriptionAr"`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" DROP COLUMN IF EXISTS "descriptionEn"`,
    );
  }
}
