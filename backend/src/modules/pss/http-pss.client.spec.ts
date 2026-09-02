import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpPssClient } from './http-pss.client';

describe('HttpPssClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function client(enabled: 'true' | 'false' = 'true'): HttpPssClient {
    const values: Record<string, string> = {
      PSS_INTEGRATION_ENABLED: enabled,
      PSS_SERVICE_URL: 'http://pss-service:3100',
      PSS_INTERNAL_TOKEN: 'test-pss-internal-token-at-least-32-characters',
      PSS_REQUEST_TIMEOUT_MS: '1000',
    };
    return new HttpPssClient({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);
  }

  it('fails closed while the integration switch is disabled', async () => {
    await expect(client('false').getCapabilities()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('authenticates internally and propagates the request id', async () => {
    const response = {
      service: 'blujet-pss',
      contractVersion: 'v1',
      salesEnabled: false,
      capabilities: { separateDatabase: true },
    } as const;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(response),
    });

    await expect(client().getCapabilities('request-123')).resolves.toEqual(
      response,
    );
    const [url, init] = jest.mocked(global.fetch).mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(url).toBe('http://pss-service:3100/internal/v1/capabilities');
    expect(headers.get('x-internal-token')).toBe(
      'test-pss-internal-token-at-least-32-characters',
    );
    expect(headers.get('x-request-id')).toBe('request-123');
  });

  it('does not convert an upstream failure into a usable response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(client().getCapabilities()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('posts a non-PII shadow snapshot through the authenticated boundary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ cutoverReady: false }),
    });
    const snapshot = {
      capturedAt: '2026-09-01T00:00:00.000Z',
      website: {
        orders: 1,
        travellers: 2,
        heldOrders: 0,
        ticketedOrders: 1,
        inventoryTransactions: 0,
      },
    };

    await client().reconcileShadow(snapshot, 'reconcile-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://pss-service:3100/internal/v1/reconciliation/shadow',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(snapshot),
      }),
    );
  });
});
