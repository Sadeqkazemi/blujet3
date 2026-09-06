import { MigrationInterface, QueryRunner } from 'typeorm';

const DOMAIN_SCHEMAS = [
  'identity',
  'inventory',
  'orders',
  'payments',
  'loyalty',
  'agency',
  'notify',
  'experience',
  'ops',
  'audit',
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class HardenDomainSchemaPrivileges1791810000000 implements MigrationInterface {
  public readonly name = 'HardenDomainSchemaPrivileges1791810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of ['public', ...DOMAIN_SCHEMAS]) {
      await queryRunner.query(
        `REVOKE CREATE ON SCHEMA ${quoteIdentifier(schema)} FROM PUBLIC`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of ['public', ...DOMAIN_SCHEMAS]) {
      await queryRunner.query(
        `GRANT CREATE ON SCHEMA ${quoteIdentifier(schema)} TO PUBLIC`,
      );
    }
  }
}
