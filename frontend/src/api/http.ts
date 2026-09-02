import type { ApiEnvelope, ApiListMeta, ApiPagedResult } from './envelope';
import { ApiRequestError } from './envelope';
import { getAccessToken, setAccessToken } from './token-store';
import {
  ACCESS_REVOKED_MESSAGE,
  emitAccessRevoked,
} from '../lib/access-revoked';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const REQUEST_TIMEOUT_MS = 15_000;

type RefreshOutcome =
  | { ok: true }
  | { ok: false; revoked: boolean; status?: number; code?: string };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiRequestError(
        'TIMEOUT',
        'سرور پاسخ نداد. لطفاً چند لحظه بعد دوباره تلاش کنید.',
        408,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Shared refresh attempt. Returns whether refresh succeeded and, on failure,
 * whether the server explicitly reported ACCESS_REVOKED (block/suspend).
 * Network errors and ordinary auth failures set `revoked: false`.
 */
async function tryRefreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetchWithTimeout('/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        let body: ApiEnvelope<{ accessToken: string }>;
        try {
          body = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
        } catch {
          return { ok: false, revoked: false, status: res.status };
        }
        if (body.success && body.data?.accessToken) {
          setAccessToken(body.data.accessToken);
          return { ok: true };
        }
        const code = body.error?.code;
        return {
          ok: false,
          revoked: code === 'ACCESS_REVOKED',
          status: res.status,
          code,
        };
      } catch {
        // Network / timeout / abort — not an access-revoked signal.
        return { ok: false, revoked: false };
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

// Exported so the auth bootstrap effect (useAuth.tsx) can share this same
// in-flight request instead of firing its own — two concurrent /auth/refresh
// calls both racing to consume the same not-yet-rotated refresh-token cookie
// trip the server's reuse-detection and revoke the whole session.
export async function refreshAccessToken(): Promise<boolean> {
  const outcome = await tryRefreshAccessToken();
  return outcome.ok;
}

function throwApiError(
  status: number,
  code: string,
  message: string,
  options?: { hadSession?: boolean },
): never {
  const hadSession = options?.hadSession ?? Boolean(getAccessToken());
  // Only emit when the real response code is ACCESS_REVOKED and a session
  // was present before any local token clear.
  if (hadSession && code === 'ACCESS_REVOKED') {
    emitAccessRevoked({
      message: ACCESS_REVOKED_MESSAGE,
      status,
      code,
      source: 'http',
    });
  }
  throw new ApiRequestError(code, message, status);
}

/** After a failed refresh: clear token only after capturing session presence. */
function throwAfterFailedRefresh(outcome: Extract<RefreshOutcome, { ok: false }>): never {
  const hadSession = Boolean(getAccessToken());
  setAccessToken(null);
  if (hadSession && outcome.revoked) {
    throwApiError(
      outcome.status ?? 403,
      'ACCESS_REVOKED',
      ACCESS_REVOKED_MESSAGE,
      { hadSession: true },
    );
  }
  throwApiError(
    401,
    'UNAUTHORIZED',
    'نشست منقضی شده است. لطفاً دوباره وارد شوید.',
    { hadSession: false },
  );
}

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // FormData sets its own multipart boundary — never override it.
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetchWithTimeout(path, {
    ...init,
    headers,
    credentials: 'include',
    // Authenticated dashboards are live operational views.  Letting the
    // browser or an intermediary reuse a cached GET made active allotments
    // appear to disappear after a hard refresh until another mutation was
    // made.  Every GET must therefore revalidate against the API.
    cache: init.method === 'GET' ? 'no-store' : init.cache,
  });
}

/** All frontend HTTP calls go through here — components never call fetch directly. */
export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await doFetch(path, init);

  if (res.status === 401 && retry && getAccessToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed.ok) return apiRequest<T>(path, init, false);
    throwAfterFailedRefresh(refreshed);
  }

  const raw = await res.text();
  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throwApiError(
      res.status,
      'BAD_GATEWAY',
      res.status === 502
        ? 'سرور در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.'
        : 'خطا در ارتباط با سرور',
    );
  }
  if (!body.success || body.data == null) {
    const rawMessage = body.error?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(' ')
      : (rawMessage ?? 'خطای ناشناخته');
    throwApiError(res.status, body.error?.code ?? 'UNKNOWN', message);
  }
  return body.data;
}

/** Like apiRequest but keeps pagination `meta` from the envelope. */
export async function apiRequestPaged<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<ApiPagedResult<T>> {
  const res = await doFetch(path, init);

  if (res.status === 401 && retry && getAccessToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed.ok) return apiRequestPaged<T>(path, init, false);
    throwAfterFailedRefresh(refreshed);
  }

  const raw = await res.text();
  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    throwApiError(
      res.status,
      'BAD_GATEWAY',
      res.status === 502
        ? 'سرور در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.'
        : 'خطا در ارتباط با سرور',
    );
  }
  if (!body.success || body.data == null) {
    const rawMessage = body.error?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(' ')
      : (rawMessage ?? 'خطای ناشناخته');
    throwApiError(res.status, body.error?.code ?? 'UNKNOWN', message);
  }
  const meta: ApiListMeta = body.meta ?? {
    total: Array.isArray(body.data) ? body.data.length : 0,
    page: 1,
    limit: Array.isArray(body.data) ? body.data.length : 0,
  };
  return { data: body.data, meta };
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiGetPaged<T>(path: string): Promise<ApiPagedResult<T>> {
  return apiRequestPaged<T>(path, { method: 'GET' });
}

/** For endpoints that return a raw file body (not the {success,data} JSON
 * envelope) on success — errors still come back as the JSON envelope. */
export async function apiGetBlob(path: string, retry = true): Promise<Blob> {
  const res = await doFetch(path, { method: 'GET' });

  if (res.status === 401 && retry && getAccessToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed.ok) return apiGetBlob(path, false);
    throwAfterFailedRefresh(refreshed);
  }

  if (!res.ok) {
    const body = (await res.json()) as ApiEnvelope<never>;
    throwApiError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'خطای ناشناخته',
    );
  }
  return res.blob();
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

/** Multipart uploads — omits the JSON Content-Type header so the browser
 * sets its own multipart boundary. */
export function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: form });
}
