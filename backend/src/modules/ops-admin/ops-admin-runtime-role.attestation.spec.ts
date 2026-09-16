import {
  attestOpsAdminProjectionRuntimeRole,
  OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  OPS_ADMIN_RUNTIME_ROLE_ATTESTATION_SQL,
} from './ops-admin-runtime-role.attestation';

const validState = {
  role: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  sessionRole: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  isolatedDatabase: true,
  safeSearchPath: true,
  loginRole: true,
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

describe('attestOpsAdminProjectionRuntimeRole', () => {
  it('accepts the exact direct-login runtime contract', async () => {
    const query = jest.fn().mockResolvedValue([validState]);

    await expect(
      attestOpsAdminProjectionRuntimeRole({ query }),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(OPS_ADMIN_RUNTIME_ROLE_ATTESTATION_SQL);
  });

  it.each([
    ['wrong current role', { role: 'owner' }],
    ['set-role session', { sessionRole: 'owner' }],
    ['foreign database access', { noForeignConnect: false }],
    ['extra table privilege', { leastPrivilege: false }],
    ['cross-domain access', { noCrossDomainAccess: false }],
  ])('fails closed for %s', async (_case, override) => {
    const query = jest.fn().mockResolvedValue([{ ...validState, ...override }]);

    await expect(
      attestOpsAdminProjectionRuntimeRole({ query }),
    ).rejects.toThrow('Ops/Admin projection runtime role attestation failed');
  });

  it('fails closed when PostgreSQL returns no evidence', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(
      attestOpsAdminProjectionRuntimeRole({ query }),
    ).rejects.toThrow('Ops/Admin projection runtime role attestation failed');
  });
});
