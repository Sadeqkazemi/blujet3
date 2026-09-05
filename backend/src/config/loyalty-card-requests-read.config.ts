export function loyaltyCardRequestsReadConfig(input: Record<string, unknown>) {
  const flag = input.LOYALTY_CARD_REQUESTS_READ_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false as const };
  if (flag !== 'true')
    throw new Error('Invalid Loyalty card-requests read flag');
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC')
    throw new Error(
      'Loyalty card-requests integration requires a UTC runtime (TZ=UTC)',
    );
  const token = input.LOYALTY_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Invalid Loyalty card-requests service credential');
  let url: URL;
  try {
    if (typeof input.LOYALTY_SERVICE_URL !== 'string') throw new Error();
    url = new URL(input.LOYALTY_SERVICE_URL);
  } catch {
    throw new Error('Invalid Loyalty card-requests service origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Loyalty card-requests service origin');
  return { enabled: true as const, url: url.origin, token };
}
