import { opsAdminDlqConfig } from './ops-admin-dlq.config';

describe('opsAdminDlqConfig', () => {
  it('is disabled by default without requiring operator credentials', () => {
    expect(opsAdminDlqConfig({})).toEqual({ enabled: false });
    expect(
      opsAdminDlqConfig({
        OPS_ADMIN_DLQ_ENABLED: 'false',
        OPS_ADMIN_DLQ_MAX_ATTEMPTS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it('accepts bounded retry and an independent operator token', () => {
    expect(
      opsAdminDlqConfig({
        OPS_ADMIN_DLQ_ENABLED: 'true',
        OPS_ADMIN_DLQ_MAX_ATTEMPTS: '4',
        OPS_ADMIN_DLQ_OPERATOR_TOKEN:
          'ops-admin-operator-token-at-least-32-characters',
      }),
    ).toEqual({
      enabled: true,
      maxAttempts: 4,
      operatorToken: 'ops-admin-operator-token-at-least-32-characters',
    });
  });

  it.each([
    [{ OPS_ADMIN_DLQ_ENABLED: 'yes' }, 'OPS_ADMIN_DLQ_ENABLED'],
    [
      {
        OPS_ADMIN_DLQ_ENABLED: 'true',
        OPS_ADMIN_DLQ_MAX_ATTEMPTS: '1',
        OPS_ADMIN_DLQ_OPERATOR_TOKEN: 'x'.repeat(32),
      },
      'OPS_ADMIN_DLQ_MAX_ATTEMPTS',
    ],
    [
      {
        OPS_ADMIN_DLQ_ENABLED: 'true',
        OPS_ADMIN_DLQ_OPERATOR_TOKEN: 'short',
      },
      'OPS_ADMIN_DLQ_OPERATOR_TOKEN',
    ],
    [
      {
        OPS_ADMIN_DLQ_ENABLED: 'true',
        OPS_ADMIN_DLQ_OPERATOR_TOKEN: ' '.repeat(32),
      },
      'OPS_ADMIN_DLQ_OPERATOR_TOKEN',
    ],
  ] as const)('rejects unsafe configuration', (env, message) => {
    expect(() => opsAdminDlqConfig(env)).toThrow(message);
  });
});
