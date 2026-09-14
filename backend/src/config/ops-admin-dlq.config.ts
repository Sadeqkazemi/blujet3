export type OpsAdminDlqConfig =
  | { enabled: false }
  | { enabled: true; maxAttempts: number; operatorToken: string };

export const OPS_ADMIN_DLQ_CONFIG = Symbol('OPS_ADMIN_DLQ_CONFIG');

export function opsAdminDlqConfig(
  env: Record<string, unknown> = process.env,
): OpsAdminDlqConfig {
  const enabled = env.OPS_ADMIN_DLQ_ENABLED ?? 'false';
  if (enabled !== 'true' && enabled !== 'false') {
    throw new Error('OPS_ADMIN_DLQ_ENABLED must be true or false');
  }
  if (enabled === 'false') return { enabled: false };

  const attempts = env.OPS_ADMIN_DLQ_MAX_ATTEMPTS ?? '3';
  if (
    typeof attempts !== 'string' ||
    !/^\d+$/.test(attempts) ||
    Number(attempts) < 2 ||
    Number(attempts) > 10
  ) {
    throw new Error('OPS_ADMIN_DLQ_MAX_ATTEMPTS must be between 2 and 10');
  }
  const operatorToken = env.OPS_ADMIN_DLQ_OPERATOR_TOKEN;
  if (
    typeof operatorToken !== 'string' ||
    operatorToken.length < 32 ||
    operatorToken.length > 256 ||
    /\s/.test(operatorToken)
  ) {
    throw new Error(
      'OPS_ADMIN_DLQ_OPERATOR_TOKEN must contain 32-256 non-whitespace characters',
    );
  }
  return { enabled: true, maxAttempts: Number(attempts), operatorToken };
}
