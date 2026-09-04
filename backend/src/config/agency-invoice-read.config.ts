export function agencyInvoiceReadConfig(input: Record<string, unknown>) {
  const flag = input.AGENCY_INVOICES_READ_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false as const };
  if (flag !== 'true') throw new Error('Invalid Agency invoice read flag');
  // Legacy TypeORM parses timestamp-without-time-zone in the Node timezone.
  // Only UTC runtimes can switch readers without changing existing wire dates.
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC')
    throw new Error(
      'Agency invoice read integration requires a UTC runtime (TZ=UTC)',
    );
  const token = input.AGENCY_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Invalid Agency invoice service credential');
  let url: URL;
  try {
    if (typeof input.AGENCY_SERVICE_URL !== 'string') throw new Error();
    url = new URL(input.AGENCY_SERVICE_URL);
  } catch {
    throw new Error('Invalid Agency invoice service origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Agency invoice service origin');
  return { enabled: true as const, url: url.origin, token };
}
