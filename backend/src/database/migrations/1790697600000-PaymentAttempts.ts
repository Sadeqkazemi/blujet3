import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentAttempts1790697600000 implements MigrationInterface {
  name = 'PaymentAttempts1790697600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payments"."payment_attempts" ("id" text NOT NULL, "bookingId" text NOT NULL, "userId" text NOT NULL, "idempotencyKey" text, "requestHash" text NOT NULL, "amountIrr" bigint NOT NULL, "status" text NOT NULL DEFAULT 'REQUESTING', "authority" text, "gatewayRefId" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "payment_attempts_amount_check" CHECK ("amountIrr" >= 0), CONSTRAINT "payment_attempts_status_check" CHECK ("status" IN ('REQUESTING', 'UNKNOWN', 'VERIFIED', 'COMPLETED', 'FAILED')), CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payment_attempts_status_createdAt_idx" ON "payments"."payment_attempts" ("status", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "payment_attempts_active_booking_key" ON "payments"."payment_attempts" ("bookingId") WHERE "status" <> 'FAILED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "payment_attempts_idempotencyKey_key" ON "payments"."payment_attempts" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."pay_idempotency_records" ADD "requestHash" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."payment_attempts" ADD CONSTRAINT "payment_attempts_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "orders"."bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."payment_attempts" ADD CONSTRAINT "payment_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments"."payment_attempts" DROP CONSTRAINT "payment_attempts_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."payment_attempts" DROP CONSTRAINT "payment_attempts_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."pay_idempotency_records" DROP COLUMN "requestHash"`,
    );
    await queryRunner.query(
      `DROP INDEX "payments"."payment_attempts_idempotencyKey_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "payments"."payment_attempts_active_booking_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "payments"."payment_attempts_status_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "payments"."payment_attempts"`);
  }
}
