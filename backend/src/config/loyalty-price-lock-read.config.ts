export function loyaltyPriceLockReadConfig(input: Record<string, unknown>) {
  const flag = input.LOYALTY_PRICE_LOCK_READ_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false as const };
  if (flag !== 'true') throw new Error('Invalid Loyalty price-lock read flag');
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC')
    throw new Error(
      'Loyalty price-lock read integration requires a UTC runtime (TZ=UTC)',
    );
  const token = input.LOYALTY_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Invalid Loyalty price-lock service credential');
  let url: URL;
  try {
    if (typeof input.LOYALTY_SERVICE_URL !== 'string') throw new Error();
    url = new URL(input.LOYALTY_SERVICE_URL);
  } catch {
    throw new Error('Invalid Loyalty price-lock service origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Loyalty price-lock service origin');
  return { enabled: true as const, url: url.origin, token };
}
