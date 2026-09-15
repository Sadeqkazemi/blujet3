export function opsAdminCartableUnreadReadConfig(
  input: Record<string, unknown>,
) {
  const flag = input.OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false as const };
  if (flag !== 'true')
    throw new Error('Invalid Ops/Admin cartable unread read flag');
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC')
    throw new Error(
      'Ops/Admin cartable unread read integration requires a UTC runtime (TZ=UTC)',
    );

  const token = input.OPS_ADMIN_INTERNAL_TOKEN;
  if (
    typeof token !== 'string' ||
    token.length < 32 ||
    token.length > 256 ||
    /\s/.test(token)
  )
    throw new Error('Invalid Ops/Admin service credential');

  let url: URL;
  try {
    if (typeof input.OPS_ADMIN_SERVICE_URL !== 'string') throw new Error();
    url = new URL(input.OPS_ADMIN_SERVICE_URL);
  } catch {
    throw new Error('Invalid Ops/Admin service origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Ops/Admin service origin');

  return { enabled: true as const, url: url.origin, token };
}
