import {
  opsAdminWorkerDataSourceOptions,
  validateOpsAdminWorkerEnv,
} from './ops-admin-worker.config';

const base = {
  NODE_ENV: 'test',
  OPS_ADMIN_DATABASE_URL:
    'postgresql://blujet_ops_admin_reader:password@localhost:5432/blujet_test',
  OPS_ADMIN_INTERNAL_TOKEN: 'ops-admin-internal-token-2026-09-09',
  PORT: '3660',
};

describe('Ops/Admin worker config', () => {
  it('accepts the dedicated reader URL and disables migrations', () => {
    expect(() => validateOpsAdminWorkerEnv(base)).not.toThrow();
    expect(opsAdminWorkerDataSourceOptions(base)).toMatchObject({
      url: base.OPS_ADMIN_DATABASE_URL,
      entities: [],
      migrations: [],
      synchronize: false,
    });
  });

  it('rejects owner credentials and short internal tokens', () => {
    expect(() =>
      validateOpsAdminWorkerEnv({
        ...base,
        OPS_ADMIN_DATABASE_URL:
          'postgresql://blujet:password@localhost:5432/blujet_test',
      }),
    ).toThrow('must authenticate as blujet_ops_admin_reader');
    expect(() =>
      validateOpsAdminWorkerEnv({
        ...base,
        OPS_ADMIN_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('must contain at least 32 characters');
  });
});
