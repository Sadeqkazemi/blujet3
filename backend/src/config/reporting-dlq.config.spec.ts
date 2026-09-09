import { reportingDlqConfig } from './reporting-dlq.config';

describe('reportingDlqConfig', () => {
  it('is disabled by default', () => {
    expect(reportingDlqConfig({})).toEqual({ enabled: false });
  });

  it('accepts a bounded attempt limit and dedicated operator token', () => {
    expect(
      reportingDlqConfig({
        REPORTING_DLQ_ENABLED: 'true',
        REPORTING_DLQ_MAX_ATTEMPTS: '4',
        REPORTING_DLQ_OPERATOR_TOKEN: 'reporting-dlq-operator-token-2026-09-09',
      }),
    ).toEqual({
      enabled: true,
      maxAttempts: 4,
      operatorToken: 'reporting-dlq-operator-token-2026-09-09',
    });
  });

  it.each([
    [{ REPORTING_DLQ_ENABLED: 'yes' }, 'REPORTING_DLQ_ENABLED'],
    [
      {
        REPORTING_DLQ_ENABLED: 'true',
        REPORTING_DLQ_MAX_ATTEMPTS: '1',
        REPORTING_DLQ_OPERATOR_TOKEN: 'x'.repeat(32),
      },
      'REPORTING_DLQ_MAX_ATTEMPTS',
    ],
    [
      {
        REPORTING_DLQ_ENABLED: 'true',
        REPORTING_DLQ_OPERATOR_TOKEN: 'short',
      },
      'REPORTING_DLQ_OPERATOR_TOKEN',
    ],
  ])('rejects unsafe configuration %#', (env, message) => {
    expect(() => reportingDlqConfig(env)).toThrow(message);
  });
});
