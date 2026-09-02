import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { NotifyInternalClient } from './notify-internal.client';

describe('NotifyInternalClient', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NOTIFY_INTEGRATION_ENABLED = 'true';
    process.env.NOTIFY_SERVICE_URL = 'http://notify-service:3200';
    process.env.NOTIFY_INTERNAL_TOKEN =
      'test-notify-internal-token-at-least-32-characters';
    process.env.NOTIFY_REQUEST_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  const actor = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'USER',
    fullName: 'کاربر',
  } as const;

  it('forwards recipient identity through the authenticated internal boundary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, data: [] }),
    });

    await expect(new NotifyInternalClient().list(actor, {})).resolves.toEqual(
      [],
    );
    const [url, init] = jest.mocked(global.fetch).mock.calls[0] ?? [];
    const urlText =
      typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : (url?.url ?? '');
    expect(urlText).toContain(`recipientId=${actor.id}`);
    expect(urlText).toContain('role=USER');
    expect(new Headers(init?.headers).get('x-internal-token')).toBe(
      'test-notify-internal-token-at-least-32-characters',
    );
  });

  it('preserves notification not-found semantics', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      new NotifyInternalClient().markRead(actor, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports an unavailable notify service without returning fake data', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      new NotifyInternalClient().unreadCount(actor),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
