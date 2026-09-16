import type { DataSource } from 'typeorm';
import {
  attestLoyaltyProjectionRuntimeRole,
  LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL,
} from './loyalty-runtime-role.attestation';

describe('attestLoyaltyProjectionRuntimeRole', () => {
  const validState = {
    role: 'blujet_loyalty_projection_runtime',
    isolatedDatabase: true,
    utcSession: true,
    boundedSession: true,
    safeSearchPath: true,
    restrictedRole: true,
    noMemberships: true,
    noOwnership: true,
    databaseAccess: true,
    schemaAccess: true,
    noDdl: true,
    requiredGrants: true,
    leastPrivilege: true,
    noCrossDomainAccess: true,
    noForeignConnect: true,
  };

  function dataSource(rows: object[]): Pick<DataSource, 'query'> {
    return {
      query: jest.fn().mockResolvedValue(rows),
    };
  }

  it('accepts only the exact restricted runtime identity', async () => {
    const source = dataSource([validState]);

    await expect(
      attestLoyaltyProjectionRuntimeRole(source),
    ).resolves.toBeUndefined();
    expect(source.query).toHaveBeenCalledWith(
      LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL,
    );
  });

  it.each([
    'isolatedDatabase',
    'utcSession',
    'boundedSession',
    'safeSearchPath',
    'restrictedRole',
    'noMemberships',
    'noOwnership',
    'databaseAccess',
    'schemaAccess',
    'noDdl',
    'requiredGrants',
    'leastPrivilege',
    'noCrossDomainAccess',
    'noForeignConnect',
  ])('fails closed when %s is false', async (check) => {
    const source = dataSource([{ ...validState, [check]: false }]);

    await expect(attestLoyaltyProjectionRuntimeRole(source)).rejects.toThrow(
      'Loyalty projection runtime role attestation failed',
    );
  });

  it.each([[[]], [[{ ...validState, role: 'loyalty_database_owner' }]]])(
    'rejects absent or wrong-role evidence',
    async (rows) => {
      await expect(
        attestLoyaltyProjectionRuntimeRole(dataSource(rows)),
      ).rejects.toThrow('Loyalty projection runtime role attestation failed');
    },
  );

  it('queries only PostgreSQL catalog state and the frozen grant contract', () => {
    expect(LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL).toContain(
      "('loyalty_projection_event_receipts', 'INSERT')",
    );
    expect(LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL).not.toContain(
      "('loyalty_projection_event_receipts', 'UPDATE')",
    );
    expect(LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL).toContain(
      "'DELETE,TRUNCATE,REFERENCES,TRIGGER'",
    );
    expect(LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL).toContain(
      'has_sequence_privilege',
    );
    expect(LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+(?:INTO|TABLE|ROLE|ON)/,
    );
  });
});
