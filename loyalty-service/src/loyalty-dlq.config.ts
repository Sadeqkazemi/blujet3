export type LoyaltyDlqConfig =
  | { enabled: false }
  | { enabled: true; maxAttempts: number; operatorToken: string };

export const LOYALTY_DLQ_CONFIG = Symbol('LOYALTY_DLQ_CONFIG');

export function loyaltyDlqConfig(
  env: Record<string, unknown> = process.env,
): LoyaltyDlqConfig {
  const enabled = env.LOYALTY_DLQ_ENABLED ?? 'false';
  if (enabled !== 'true' && enabled !== 'false') {
    throw new Error('LOYALTY_DLQ_ENABLED must be true or false');
  }
  if (enabled === 'false') return { enabled: false };

  const attempts = env.LOYALTY_DLQ_MAX_ATTEMPTS ?? '3';
  if (
    typeof attempts !== 'string' ||
    !/^\d+$/.test(attempts) ||
    Number(attempts) < 2 ||
    Number(attempts) > 10
  ) {
    throw new Error('LOYALTY_DLQ_MAX_ATTEMPTS must be between 2 and 10');
  }
  const operatorToken = env.LOYALTY_DLQ_OPERATOR_TOKEN;
  if (typeof operatorToken !== 'string' || operatorToken.length < 32) {
    throw new Error(
      'LOYALTY_DLQ_OPERATOR_TOKEN must contain at least 32 characters',
    );
  }
  return { enabled: true, maxAttempts: Number(attempts), operatorToken };
}
