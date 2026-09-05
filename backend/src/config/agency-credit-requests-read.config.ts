export function agencyCreditRequestsReadConfig(input: Record<string, unknown>) {
  const flag = input.AGENCY_CREDIT_REQUESTS_READ_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false as const };
  if (flag !== 'true')
    throw new Error('Invalid Agency credit-request read flag');
  // Legacy TypeORM parses timestamp-without-time-zone in the Node timezone.
  // Only UTC runtimes can switch readers without changing existing wire dates.
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC')
    throw new Error(
      'Agency credit-request read integration requires a UTC runtime (TZ=UTC)',
    );
  const token = input.AGENCY_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Invalid Agency credit-request service credential');
  let url: URL;
  try {
    if (typeof input.AGENCY_SERVICE_URL !== 'string') throw new Error();
    url = new URL(input.AGENCY_SERVICE_URL);
  } catch {
    throw new Error('Invalid Agency credit-request service origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Agency credit-request service origin');
  return { enabled: true as const, url: url.origin, token };
}
