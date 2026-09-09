import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommerceSagaExecutions1792243200000 implements MigrationInterface {
  name = 'CommerceSagaExecutions1792243200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders"."commerce_saga_executions" (
        "id" text NOT NULL,
        "sagaType" text NOT NULL,
        "aggregateId" text NOT NULL,
        "correlationId" text NOT NULL,
        "idempotencyKey" text NOT NULL,
        "status" text NOT NULL DEFAULT 'STARTED',
        "currentStep" text NOT NULL,
        "failureCode" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "commerce_saga_executions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "commerce_saga_type_check" CHECK ("sagaType" IN ('CORE_ITINERARY_FULFILMENT', 'CORE_ITINERARY_REFUND')),
        CONSTRAINT "commerce_saga_status_check" CHECK ("status" IN ('STARTED', 'COMPLETED', 'COMPENSATION_REQUIRED')),
        CONSTRAINT "commerce_saga_failure_check" CHECK (("status" = 'COMPENSATION_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'COMPENSATION_REQUIRED' AND "failureCode" IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "commerce_saga_type_aggregate_key" ON "orders"."commerce_saga_executions" ("sagaType", "aggregateId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "commerce_saga_status_updated_idx" ON "orders"."commerce_saga_executions" ("status", "updatedAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "orders"."commerce_saga_status_updated_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "orders"."commerce_saga_type_aggregate_key"`,
    );
    await queryRunner.query(`DROP TABLE "orders"."commerce_saga_executions"`);
  }
}
