import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isISO8601, isUUID } from 'class-validator';

export interface MemberProjection {
  id: string;
  userId: string;
  level: string;
  cardStatus: string;
  points: string;
}
export interface LockProjection {
  id: string;
  flightInstanceId: string;
  cabin: string;
  lockedPriceIrr: string;
  feeIrr: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  bookingId: string | null;
}
export interface LoyaltyProjection {
  member: MemberProjection | null;
  locks: LockProjection[];
}
export type ShadowStatus =
  'DISABLED' | 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE' | 'UNAVAILABLE';
export interface ShadowReport {
  status: ShadowStatus;
  requestId: string;
}
export interface ShadowConfig {
  enabled: boolean;
  url?: string;
  token?: string;
}

export function shadowConfig(env: NodeJS.ProcessEnv): ShadowConfig {
  if (
    env.LOYALTY_SHADOW_ENABLED === undefined ||
    env.LOYALTY_SHADOW_ENABLED === 'false'
  )
    return { enabled: false };
  if (env.LOYALTY_SHADOW_ENABLED !== 'true')
    throw new Error('Invalid Loyalty shadow flag');
  const token = env.LOYALTY_INTERNAL_TOKEN;
  if (!token || token.length < 32)
    throw new Error('Missing Loyalty service credential');
  let url: URL;
  try {
    url = new URL(env.LOYALTY_SERVICE_URL ?? '');
  } catch {
    throw new Error('Invalid Loyalty service URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid Loyalty service URL');
  return { enabled: true, url: url.origin, token };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), expected.sort());
}
function member(value: unknown, userId: string): value is MemberProjection {
  return (
    record(value) &&
    keys(value, ['id', 'userId', 'level', 'cardStatus', 'points']) &&
    typeof value.id === 'string' &&
    value.userId === userId &&
    typeof value.level === 'string' &&
    typeof value.cardStatus === 'string' &&
    typeof value.points === 'string' &&
    /^-?(0|[1-9]\d*)$/.test(value.points)
  );
}
function lock(value: unknown): value is LockProjection {
  if (
    !record(value) ||
    !keys(value, [
      'id',
      'flightInstanceId',
      'cabin',
      'lockedPriceIrr',
      'feeIrr',
      'status',
      'expiresAt',
      'createdAt',
      'bookingId',
    ])
  )
    return false;
  return (
    ['id', 'flightInstanceId', 'cabin'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['lockedPriceIrr', 'feeIrr'].every(
      (key) =>
        typeof value[key] === 'string' && /^(0|[1-9]\d*)$/.test(value[key]),
    ) &&
    value.status === 'ACTIVE' &&
    ['expiresAt', 'createdAt'].every(
      (key) =>
        typeof value[key] === 'string' &&
        value[key].endsWith('Z') &&
        isISO8601(value[key], { strict: true }),
    ) &&
    (value.bookingId === null || typeof value.bookingId === 'string')
  );
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Empty Loyalty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 512 * 1024) throw new Error('Oversized Loyalty response');
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}

async function remoteProjection(
  config: ShadowConfig,
  userId: string,
  at: Date,
  requestId: string,
): Promise<LoyaltyProjection> {
  const headers = {
    'X-Internal-Token': config.token ?? '',
    'X-Loyalty-User-Id': userId,
    'X-Request-Id': requestId,
  };
  const signal = AbortSignal.timeout(2000);
  const get = async (path: string) => {
    const response = await fetch(config.url + path, {
      headers,
      signal,
      redirect: 'error',
    });
    return { response, body: await boundedJson(response) };
  };
  const [membership, locks] = await Promise.all([
    get('/internal/v1/loyalty/members/' + userId),
    get(
      '/internal/v1/loyalty/price-locks/' +
        userId +
        '?at=' +
        encodeURIComponent(at.toISOString()),
    ),
  ]);
  let memberView: MemberProjection | null = null;
  if (
    membership.response.status === 404 &&
    record(membership.body) &&
    membership.body.success === false &&
    record(membership.body.error) &&
    membership.body.error.code === 'NOT_FOUND'
  ) {
    memberView = null;
  } else if (
    membership.response.ok &&
    record(membership.body) &&
    keys(membership.body, ['success', 'data']) &&
    membership.body.success === true &&
    member(membership.body.data, userId)
  ) {
    memberView = membership.body.data;
  } else throw new Error('Invalid Loyalty membership response');
  if (
    !locks.response.ok ||
    !record(locks.body) ||
    !keys(locks.body, ['success', 'data']) ||
    locks.body.success !== true ||
    !Array.isArray(locks.body.data) ||
    locks.body.data.length > 1000 ||
    !locks.body.data.every(lock)
  )
    throw new Error('Invalid Loyalty locks response');
  const lockViews = locks.body.data;
  if (
    new Set(lockViews.map((item) => item.id)).size !== lockViews.length ||
    lockViews.some((item) => new Date(item.expiresAt).getTime() <= at.getTime())
  )
    throw new Error('Invalid Loyalty lock ownership projection');
  return {
    member: memberView,
    locks: lockViews.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function compareLoyaltyShadow(
  config: ShadowConfig,
  userId: string,
  readLocal: (userId: string, at: Date) => Promise<LoyaltyProjection>,
): Promise<ShadowReport> {
  const requestId = randomUUID();
  if (!config.enabled) return { status: 'DISABLED', requestId };
  if (!isUUID(userId)) throw new Error('An explicit user UUID is required');
  const at = new Date();
  try {
    const before = await readLocal(userId, at);
    const remote = await remoteProjection(config, userId, at, requestId);
    const after = await readLocal(userId, at);
    for (const view of [before, after])
      view.locks.sort((a, b) => a.id.localeCompare(b.id));
    const status: ShadowStatus = !isDeepStrictEqual(before, after)
      ? 'INCONCLUSIVE'
      : isDeepStrictEqual(before, remote)
        ? 'MATCH'
        : 'MISMATCH';
    return { status, requestId };
  } catch {
    return { status: 'UNAVAILABLE', requestId };
  }
}
