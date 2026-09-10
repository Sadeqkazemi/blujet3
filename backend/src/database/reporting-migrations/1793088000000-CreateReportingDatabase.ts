import type { MigrationInterface, QueryRunner } from 'typeorm';
import { ReportingItineraryProjections1791734400000 } from '../migrations/1791734400000-ReportingItineraryProjections';
import { ReportingKafkaConsumerCheckpoints1792156800000 } from '../migrations/1792156800000-ReportingKafkaConsumerCheckpoints';
import { ReportingKafkaFailureQuarantine1792329600000 } from '../migrations/1792329600000-ReportingKafkaFailureQuarantine';

export class CreateReportingDatabase1793088000000 implements MigrationInterface {
  public readonly name = 'CreateReportingDatabase1793088000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await new ReportingItineraryProjections1791734400000().up(queryRunner);
    await new ReportingKafkaConsumerCheckpoints1792156800000().up(queryRunner);
    await new ReportingKafkaFailureQuarantine1792329600000().up(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await new ReportingKafkaFailureQuarantine1792329600000().down(queryRunner);
    await new ReportingKafkaConsumerCheckpoints1792156800000().down(
      queryRunner,
    );
    await new ReportingItineraryProjections1791734400000().down(queryRunner);
    await queryRunner.query('DROP SCHEMA IF EXISTS "reporting"');
  }
}
