import { agencyDlqConfig } from './agency-dlq.config';

describe('agencyDlqConfig', () => {
  it('is disabled by default without requiring operator credentials', () => {
    expect(agencyDlqConfig({})).toEqual({ enabled: false });
    expect(
      agencyDlqConfig({
        AGENCY_DLQ_ENABLED: 'false',
        AGENCY_DLQ_MAX_ATTEMPTS: 'invalid',
      }),
    ).toEqual({ enabled: false });
  });

  it('accepts bounded retry and an independent operator token', () => {
    expect(
      agencyDlqConfig({
        AGENCY_DLQ_ENABLED: 'true',
        AGENCY_DLQ_MAX_ATTEMPTS: '4',
        AGENCY_DLQ_OPERATOR_TOKEN:
          'agency-operator-token-at-least-32-characters',
      }),
    ).toEqual({
      enabled: true,
      maxAttempts: 4,
      operatorToken: 'agency-operator-token-at-least-32-characters',
    });
  });

  it.each([
    [{ AGENCY_DLQ_ENABLED: 'yes' }, 'AGENCY_DLQ_ENABLED'],
    [
      {
        AGENCY_DLQ_ENABLED: 'true',
        AGENCY_DLQ_MAX_ATTEMPTS: '1',
        AGENCY_DLQ_OPERATOR_TOKEN: 'x'.repeat(32),
      },
      'AGENCY_DLQ_MAX_ATTEMPTS',
    ],
    [
      {
        AGENCY_DLQ_ENABLED: 'true',
        AGENCY_DLQ_OPERATOR_TOKEN: 'short',
      },
      'AGENCY_DLQ_OPERATOR_TOKEN',
    ],
  ] as const)('rejects unsafe configuration', (env, message) => {
    expect(() => agencyDlqConfig(env)).toThrow(message);
  });
});
