import { QueryRunner } from 'typeorm';
import { HardenDomainSchemaPrivileges1791810000000 } from './migrations/1791810000000-HardenDomainSchemaPrivileges';

function queryRunnerMock() {
  const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
  return { query, runner: { query } as unknown as QueryRunner };
}

const schemas = [
  'public',
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
];

describe('domain schema privilege hardening', () => {
  it('revokes CREATE from PUBLIC on every application schema', async () => {
    const { query, runner } = queryRunnerMock();

    await new HardenDomainSchemaPrivileges1791810000000().up(runner);

    expect(query.mock.calls).toEqual(
      schemas.map((schema) => [
        `REVOKE CREATE ON SCHEMA "${schema}" FROM PUBLIC`,
      ]),
    );
  });

  it('rollback restores only the schema CREATE defaults', async () => {
    const { query, runner } = queryRunnerMock();

    await new HardenDomainSchemaPrivileges1791810000000().down(runner);

    expect(query.mock.calls).toEqual(
      schemas.map((schema) => [`GRANT CREATE ON SCHEMA "${schema}" TO PUBLIC`]),
    );
  });
});
