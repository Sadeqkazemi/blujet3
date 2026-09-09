export type ReportingDlqConfig =
  | { enabled: false }
  | {
      enabled: true;
      maxAttempts: number;
      operatorToken: string;
    };

export const REPORTING_DLQ_CONFIG = Symbol('REPORTING_DLQ_CONFIG');

function enabledSetting(value: unknown): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('REPORTING_DLQ_ENABLED must be true or false');
}

export function reportingDlqConfig(
  env: Record<string, unknown> = process.env,
): ReportingDlqConfig {
  if (!enabledSetting(env.REPORTING_DLQ_ENABLED)) return { enabled: false };
  const attemptsValue = env.REPORTING_DLQ_MAX_ATTEMPTS ?? '3';
  if (
    typeof attemptsValue !== 'string' ||
    !/^\d+$/.test(attemptsValue) ||
    Number(attemptsValue) < 2 ||
    Number(attemptsValue) > 10
  ) {
    throw new Error('REPORTING_DLQ_MAX_ATTEMPTS must be between 2 and 10');
  }
  const operatorToken = env.REPORTING_DLQ_OPERATOR_TOKEN;
  if (typeof operatorToken !== 'string' || operatorToken.length < 32) {
    throw new Error(
      'REPORTING_DLQ_OPERATOR_TOKEN must contain at least 32 characters',
    );
  }
  return {
    enabled: true,
    maxAttempts: Number(attemptsValue),
    operatorToken,
  };
}
