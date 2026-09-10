import type { QueryRunner } from 'typeorm';
import { CreateNotifyDatabase1793000000000 } from './migrations/1793000000000-CreateNotifyDatabase';

describe('CreateNotifyDatabase1793000000000', () => {
  const migration = new CreateNotifyDatabase1793000000000();

  it('creates only the Notify schema and owned tables', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string): Promise<unknown[]> => {
      statements.push(statement);
      return Promise.resolve([]);
    });

    await migration.up({ query } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "notify"');
    expect(sql).toContain('CREATE TABLE "notify"."notifications"');
    expect(sql).toContain('CREATE TABLE "notify"."sms_logs"');
    expect(sql).toContain('"sourceEventId" IS NOT NULL');
    expect(sql).toContain("'FLIGHT_CANCELLED'");
    expect(sql).not.toMatch(/REFERENCES|FOREIGN KEY/i);
    expect(sql).not.toMatch(
      /\b(identity|orders|payments|inventory|experience)\b/i,
    );
  });

  it('drops only Notify-owned bootstrap objects in dependency order', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string): Promise<unknown[]> => {
      statements.push(statement);
      return Promise.resolve([]);
    });

    await migration.down({ query } as unknown as QueryRunner);

    expect(statements).toEqual([
      'DROP TABLE IF EXISTS "notify"."sms_logs"',
      'DROP TABLE IF EXISTS "notify"."notifications"',
      'DROP TYPE IF EXISTS "notify"."SmsStatus"',
      'DROP TYPE IF EXISTS "notify"."SmsMessageType"',
      'DROP TYPE IF EXISTS "notify"."NotificationCategory"',
      'DROP SCHEMA IF EXISTS "notify"',
    ]);
  });
});
