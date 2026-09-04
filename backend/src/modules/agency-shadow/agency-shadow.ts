import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isISO8601, isUUID } from 'class-validator';

export interface ProfileProjection {
  agencyId: string;
  city: string;
  tier: string;
  joinedAt: string;
  suspendedAt: string | null;
}
export interface InvoiceProjection {
  id: string;
  invoiceNo: string;
  amountIrr: string;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
}
export interface InvoicePageProjection {
  items: InvoiceProjection[];
  total: string;
  page: number;
  pageSize: number;
}
export interface AgencyProjection {
  profile: ProfileProjection | null;
  invoices: InvoicePageProjection | null;
  invoice?: InvoiceProjection | null;
}
export interface ShadowConfig {
  enabled: boolean;
  url?: string;
  token?: string;
}
export interface ShadowReport {
  status: 'DISABLED' | 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE' | 'UNAVAILABLE';
  requestId: string;
}

export function shadowConfig(env: NodeJS.ProcessEnv): ShadowConfig {
  if (
    env.AGENCY_SHADOW_ENABLED === undefined ||
    env.AGENCY_SHADOW_ENABLED === 'false'
  )
    return { enabled: false };
  if (env.AGENCY_SHADOW_ENABLED !== 'true')
    throw new Error('Invalid Agency shadow flag');
  const token = env.AGENCY_INTERNAL_TOKEN;
  if (!token || token.length < 32)
    throw new Error('Missing Agency service credential');
  const url = new URL(env.AGENCY_SERVICE_URL ?? '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Agency service origin');
  return { enabled: true, url: url.origin, token };
}

export function validateSample(
  agencyId: string,
  page: number,
  invoiceId?: string,
): void {
  if (
    !isUUID(agencyId) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    (invoiceId !== undefined && !isUUID(invoiceId))
  )
    throw new Error('Explicit Agency UUID and valid page required');
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), expected.sort());
}
function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}
function profile(value: unknown, agencyId: string): value is ProfileProjection {
  return (
    record(value) &&
    keys(value, ['agencyId', 'city', 'tier', 'joinedAt', 'suspendedAt']) &&
    value.agencyId === agencyId &&
    typeof value.city === 'string' &&
    typeof value.tier === 'string' &&
    utc(value.joinedAt) &&
    (value.suspendedAt === null || utc(value.suspendedAt))
  );
}
function invoice(value: unknown): value is InvoiceProjection {
  return (
    record(value) &&
    keys(value, [
      'id',
      'invoiceNo',
      'amountIrr',
      'status',
      'issuedAt',
      'dueAt',
      'paidAt',
    ]) &&
    typeof value.id === 'string' &&
    isUUID(value.id) &&
    typeof value.invoiceNo === 'string' &&
    typeof value.amountIrr === 'string' &&
    /^(0|-?[1-9]\d*)$/.test(value.amountIrr) &&
    typeof value.status === 'string' &&
    utc(value.issuedAt) &&
    utc(value.dueAt) &&
    (value.paidAt === null || utc(value.paidAt))
  );
}
function invoicePage(
  value: unknown,
  page: number,
): value is InvoicePageProjection {
  if (
    !record(value) ||
    !keys(value, ['items', 'total', 'page', 'pageSize']) ||
    value.page !== page ||
    value.pageSize !== 10 ||
    typeof value.total !== 'string' ||
    !/^(0|[1-9]\d*)$/.test(value.total) ||
    !Array.isArray(value.items) ||
    value.items.length > 10 ||
    !value.items.every(invoice)
  )
    return false;
  const remaining = BigInt(value.total) - BigInt((page - 1) * 10);
  const expected = remaining < 0n ? 0n : remaining > 10n ? 10n : remaining;
  return (
    BigInt(value.items.length) === expected &&
    new Set(value.items.map((item) => item.id)).size === value.items.length
  );
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Empty Agency response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 64 * 1024) throw new Error('Oversized Agency response');
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}
function success(body: unknown): body is { success: true; data: unknown } {
  return (
    record(body) && keys(body, ['success', 'data']) && body.success === true
  );
}
function notFound(result: { response: Response; body: unknown }): boolean {
  const body = result.body;
  return (
    result.response.status === 404 &&
    record(body) &&
    keys(body, ['success', 'error']) &&
    body.success === false &&
    record(body.error) &&
    keys(body.error, ['code', 'message']) &&
    body.error.code === 'NOT_FOUND' &&
    typeof body.error.message === 'string'
  );
}
async function remoteProjection(
  config: ShadowConfig,
  agencyId: string,
  page: number,
  requestId: string,
  invoiceId?: string,
): Promise<AgencyProjection> {
  const headers = {
    'X-Internal-Token': config.token ?? '',
    'X-Agency-Id': agencyId,
    'X-Request-Id': requestId,
  };
  const signal = AbortSignal.timeout(2000);
  const get = async (suffix: string) => {
    const response = await fetch(
      config.url + '/internal/v1/agencies/' + agencyId + suffix,
      { headers, signal, redirect: 'error' },
    );
    return { response, body: await boundedJson(response) };
  };
  const [p, invoices, detail] = await Promise.all([
    get('/profile'),
    get('/invoices?page=' + page),
    invoiceId === undefined ? undefined : get('/invoices/' + invoiceId),
  ]);
  let selected: InvoiceProjection | null = null;
  if (invoiceId !== undefined) {
    if (!detail) throw new Error('Missing Agency invoice response');
    if (!notFound(detail)) {
      if (
        detail.response.status !== 200 ||
        !success(detail.body) ||
        !invoice(detail.body.data) ||
        detail.body.data.id !== invoiceId
      )
        throw new Error('Invalid Agency invoice response');
      selected = detail.body.data;
    }
  }
  const optionalDetail = invoiceId === undefined ? {} : { invoice: selected };
  if (notFound(p) && notFound(invoices)) {
    if (selected !== null) throw new Error('Invoice without an Agency profile');
    return { profile: null, invoices: null, ...optionalDetail };
  }
  if (
    p.response.status !== 200 ||
    !success(p.body) ||
    !profile(p.body.data, agencyId) ||
    invoices.response.status !== 200 ||
    !success(invoices.body) ||
    !invoicePage(invoices.body.data, page)
  )
    throw new Error('Invalid Agency projection');
  return {
    profile: p.body.data,
    invoices: invoices.body.data,
    ...optionalDetail,
  };
}

export async function compareAgencyShadow(
  config: ShadowConfig,
  agencyId: string,
  page: number,
  readLocal: (
    agencyId: string,
    page: number,
    invoiceId?: string,
  ) => Promise<AgencyProjection>,
  invoiceId?: string,
): Promise<ShadowReport> {
  const requestId = randomUUID();
  if (!config.enabled) return { status: 'DISABLED', requestId };
  validateSample(agencyId, page, invoiceId);
  const read = () =>
    invoiceId === undefined
      ? readLocal(agencyId, page)
      : readLocal(agencyId, page, invoiceId);
  try {
    const before = await read();
    const remote = await remoteProjection(
      config,
      agencyId,
      page,
      requestId,
      invoiceId,
    );
    const after = await read();
    return {
      requestId,
      status: !isDeepStrictEqual(before, after)
        ? 'INCONCLUSIVE'
        : isDeepStrictEqual(before, remote)
          ? 'MATCH'
          : 'MISMATCH',
    };
  } catch {
    return { status: 'UNAVAILABLE', requestId };
  }
}
