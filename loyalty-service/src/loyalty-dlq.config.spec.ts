import { loyaltyDlqConfig } from './loyalty-dlq.config';

describe('loyaltyDlqConfig', () => {
  it('is disabled by default without requiring operator credentials', () => {
    expect(loyaltyDlqConfig({})).toEqual({ enabled: false });
    expect(
      loyaltyDlqConfig({
        LOYALTY_DLQ_ENABLED: 'false',
        LOYALTY_DLQ_MAX_ATTEMPTS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it('accepts bounded retry and an independent operator token', () => {
    expect(
      loyaltyDlqConfig({
        LOYALTY_DLQ_ENABLED: 'true',
        LOYALTY_DLQ_MAX_ATTEMPTS: '4',
        LOYALTY_DLQ_OPERATOR_TOKEN: 'loyalty-operator-token-at-least-32-chars',
      }),
    ).toEqual({
      enabled: true,
      maxAttempts: 4,
      operatorToken: 'loyalty-operator-token-at-least-32-chars',
    });
  });

  it.each([
    [{ LOYALTY_DLQ_ENABLED: 'yes' }, 'LOYALTY_DLQ_ENABLED'],
    [
      {
        LOYALTY_DLQ_ENABLED: 'true',
        LOYALTY_DLQ_MAX_ATTEMPTS: '1',
        LOYALTY_DLQ_OPERATOR_TOKEN: 'x'.repeat(32),
      },
      'LOYALTY_DLQ_MAX_ATTEMPTS',
    ],
    [
      {
        LOYALTY_DLQ_ENABLED: 'true',
        LOYALTY_DLQ_OPERATOR_TOKEN: 'short',
      },
      'LOYALTY_DLQ_OPERATOR_TOKEN',
    ],
  ] as const)('rejects unsafe configuration', (env, message) => {
    expect(() => loyaltyDlqConfig(env)).toThrow(message);
  });
});
