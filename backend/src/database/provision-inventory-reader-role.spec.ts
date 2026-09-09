import {
  INVENTORY_READER_COLUMNS,
  INVENTORY_READER_ROLE,
  provisionInventoryReaderRole,
  validateInventoryReaderPassword,
} from './provision-inventory-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Inventory reader role provisioner', () => {
  it('rejects weak credentials', () => {
    expect(() => validateInventoryReaderPassword('short')).toThrow(
      'INVENTORY_DATABASE_PASSWORD',
    );
    expect(() => validateInventoryReaderPassword('x'.repeat(32))).not.toThrow();
  });

  it('grants only the inventory observation columns', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${INVENTORY_READER_ROLE} PASSWORD '<redacted>'`,
              },
            ],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedReadOnly"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedReadOnly: true,
                noMemberships: true,
                noOwnership: true,
                exactColumns: true,
                noWrites: true,
                noSequences: true,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    await expect(
      provisionInventoryReaderRole(
        client,
        'inventory_reader_password_2026_09_09',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: INVENTORY_READER_ROLE,
      columnCount: INVENTORY_READER_COLUMNS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain(
      'GRANT SELECT ("occupiedSeats") ON TABLE "orders"."core_itinerary_segments"',
    );
    expect(sql).not.toContain('GRANT SELECT ("contactPhone")');
    expect(sql).toContain('has_column_privilege');
    expect(statements.at(-1)).toBe('COMMIT');
  });
});
