import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './envelope';
import { apiGet, refreshAccessToken } from './http';
import { getAccessToken, setAccessToken } from './token-store';
import {
  ACCESS_REVOKED_EVENT,
  ACCESS_REVOKED_MESSAGE,
  onAccessRevoked,
} from '../lib/access-revoked';

// Regression test for the auth-bootstrap race: two callers invoking
// refreshAccessToken() around the same time (e.g. useAuth's session-restore
// effect firing twice under React StrictMode, or simply two components that
// both want a fresh token) must share one in-flight /auth/refresh request.
// Firing two independent requests races the same not-yet-rotated
// refresh-token cookie and trips the backend's reuse-detection, which
// revokes the whole session and bounces the user back to the login page.
describe('refreshAccessToken', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes concurrent callers into a single network request', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ success: true, data: { accessToken: 'new-token' } }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(calls).toBe(1);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('allows a later, independent refresh after the first completes', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ success: true, data: { accessToken: 'token-' + calls } }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshAccessToken();
    await refreshAccessToken();

    expect(calls).toBe(2);
  });
});

describe('apiGet ACCESS_REVOKED vs ordinary auth failure', () => {
  beforeEach(() => {
    setAccessToken('stale-access');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('always bypasses the browser cache for live authenticated GET data', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: [{ id: 'active-allotment' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/agency-portal/allotments');

    expect(fetchMock).toHaveBeenCalledWith(
      '/agency-portal/allotments',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('emits ACCESS_REVOKED when refresh returns code ACCESS_REVOKED (session preserved before clear)', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return jsonResponse(403, {
          success: false,
          error: { code: 'ACCESS_REVOKED', message: ACCESS_REVOKED_MESSAGE },
        });
      }
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'توکن منقضی' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/panels/me')).rejects.toMatchObject({
      code: 'ACCESS_REVOKED',
    } satisfies Partial<ApiRequestError>);

    expect(revoked).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ACCESS_REVOKED_MESSAGE,
        code: 'ACCESS_REVOKED',
        source: 'http',
      }),
    );
    expect(getAccessToken()).toBeNull();
    off();
  });

  it('does not emit ACCESS_REVOKED on ordinary failed refresh (expired session)', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return jsonResponse(401, {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'رفرش نامعتبر' },
        });
      }
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'توکن منقضی' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/panels/me')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });

    expect(revoked).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    off();
  });

  it('does not emit ACCESS_REVOKED when refresh fails with a network error', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        throw new TypeError('Failed to fetch');
      }
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'توکن منقضی' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/panels/me')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(revoked).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    off();
  });

  it('emits ACCESS_REVOKED on a direct API 403 with that code (no refresh path)', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, {
          success: false,
          error: { code: 'ACCESS_REVOKED', message: ACCESS_REVOKED_MESSAGE },
        }),
      ),
    );

    await expect(apiGet('/panels/me')).rejects.toMatchObject({
      code: 'ACCESS_REVOKED',
      status: 403,
    });

    expect(revoked).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('stale-access');
    off();
  });

  it('does not treat FORBIDDEN 403 as ACCESS_REVOKED', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, {
          success: false,
          error: { code: 'FORBIDDEN', message: 'مجوز ندارید' },
        }),
      ),
    );

    await expect(apiGet('/panels/me')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });

    expect(revoked).not.toHaveBeenCalled();
    off();
  });

  it('retries successfully after a normal token refresh', async () => {
    const revoked = vi.fn();
    const off = onAccessRevoked(revoked);
    let calls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          return jsonResponse(200, {
            success: true,
            data: { accessToken: 'fresh-token' },
          });
        }
        calls += 1;
        if (calls === 1) {
          return jsonResponse(401, {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'منقضی' },
          });
        }
        return jsonResponse(200, { success: true, data: { id: 'me' } });
      }),
    );

    await expect(apiGet<{ id: string }>('/panels/me')).resolves.toEqual({ id: 'me' });
    expect(getAccessToken()).toBe('fresh-token');
    expect(revoked).not.toHaveBeenCalled();
    off();
  });
});

describe('ACCESS_REVOKED_EVENT constant', () => {
  it('matches the listener event name', () => {
    expect(ACCESS_REVOKED_EVENT).toBe('blujet:access-revoked');
  });
});
