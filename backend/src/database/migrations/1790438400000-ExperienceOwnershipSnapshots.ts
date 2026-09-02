import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExperienceOwnershipSnapshots1790438400000 implements MigrationInterface {
  name = 'ExperienceOwnershipSnapshots1790438400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blog_posts" ADD COLUMN "authorName" text`,
    );
    await queryRunner.query(
      `UPDATE "blog_posts" AS post SET "authorName" = "user"."fullName" FROM "users" AS "user" WHERE post."authorId" = "user"."id" AND post."authorName" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" ADD COLUMN "assigneeName" text`,
    );
    await queryRunner.query(
      `UPDATE "job_applications" AS application SET "assigneeName" = "user"."fullName" FROM "users" AS "user" WHERE application."assigneeId" = "user"."id" AND application."assigneeName" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD COLUMN "forwardedToName" text`,
    );
    await queryRunner.query(
      `UPDATE "support_tickets" AS ticket SET "forwardedToName" = "user"."fullName" FROM "users" AS "user" WHERE ticket."forwardedToId" = "user"."id" AND ticket."forwardedToName" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_settings" ADD COLUMN "updatedByName" text`,
    );
    await queryRunner.query(
      `UPDATE "survey_settings" AS settings SET "updatedByName" = "user"."fullName" FROM "users" AS "user" WHERE settings."updatedById" = "user"."id" AND settings."updatedByName" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_invites" ADD COLUMN "contactPhoneSnapshot" text, ADD COLUMN "flightNoSnapshot" text, ADD COLUMN "originCityFaSnapshot" text, ADD COLUMN "destCityFaSnapshot" text, ADD COLUMN "departureAtSnapshot" timestamp(3)`,
    );
    await queryRunner.query(`
      UPDATE "survey_invites" AS invite
      SET "contactPhoneSnapshot" = booking."contactPhone",
          "flightNoSnapshot" = flight."flightNo",
          "originCityFaSnapshot" = COALESCE(origin_airport."cityFa", route."originCode"),
          "destCityFaSnapshot" = COALESCE(dest_airport."cityFa", route."destCode"),
          "departureAtSnapshot" = instance."departureAt"
      FROM "bookings" AS booking
      JOIN "flight_instances" AS instance ON instance."id" = booking."flightInstanceId"
      JOIN "flights" AS flight ON flight."id" = instance."flightId"
      JOIN "routes" AS route ON route."id" = flight."routeId"
      LEFT JOIN "airports" AS origin_airport ON origin_airport."code" = route."originCode"
      LEFT JOIN "airports" AS dest_airport ON dest_airport."code" = route."destCode"
      WHERE invite."bookingId" = booking."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_invites" DROP COLUMN "departureAtSnapshot", DROP COLUMN "destCityFaSnapshot", DROP COLUMN "originCityFaSnapshot", DROP COLUMN "flightNoSnapshot", DROP COLUMN "contactPhoneSnapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_settings" DROP COLUMN "updatedByName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP COLUMN "forwardedToName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" DROP COLUMN "assigneeName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "blog_posts" DROP COLUMN "authorName"`,
    );
  }
}
