import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpsAdminCartableCountsClient } from './ops-admin-cartable-counts.client';

const assigneeId = '00000000-0000-4000-8000-000000000001';
const token = 'ops-admin-counts-client-token-at-least-32-characters';
const observedAt = '2026-09-15T10:30:00.000Z';

function wire(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      assigneeId,
      counts: { ADMIN: 2, AGENCY: 1, MANAGER: 0 },
      statusCounts: {
        OPEN: 3,
        APPROVED: 4,
        REJECTED: 1,
        TRANSFERRED: 0,
      },
      totalOpen: 3,
      observedAt,
      ...overrides,
    },
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function createClient(
  enabled = 'true',
  warn: jest.Mock = jest.fn(),
): OpsAdminCartableCountsClient {
  return new OpsAdminCartableCountsClient(
    new ConfigService({
      OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED: enabled,
      OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660',
      OPS_ADMIN_INTERNAL_TOKEN: token,
    }),
    { warn } as never,
  );
}

describe('OpsAdminCartableCountsClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(createClient('false').get('invalid')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts exact consistent counters and propagates owner and correlation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(wire()));

    await expect(
      createClient().get(assigneeId, 'cartable-counts-request'),
    ).resolves.toEqual({
      counts: { ADMIN: 2, AGENCY: 1, MANAGER: 0 },
      statusCounts: {
        OPEN: 3,
        APPROVED: 4,
        REJECTED: 1,
        TRANSFERRED: 0,
      },
      totalOpen: 3,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://ops-admin:3660/internal/v1/ops-admin/cartable/counts',
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          'X-Internal-Token': token,
          'X-Ops-Admin-Assignee-Id': assigneeId,
          'X-Request-Id': 'cartable-counts-request',
        },
      }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses Core fallback for availability and bounded-body failures', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ padding: 'x'.repeat(17 * 1024) }));
    const client = createClient();

    await expect(client.get(assigneeId)).resolves.toBeUndefined();
    await expect(client.get(assigneeId)).resolves.toBeUndefined();
    await expect(client.get(assigneeId)).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    [wire({ assigneeId: '00000000-0000-4000-8000-000000000002' }), 200],
    [wire({ totalOpen: 4 }), 200],
    [
      wire({
        statusCounts: { OPEN: 2, APPROVED: 4, REJECTED: 1, TRANSFERRED: 0 },
      }),
      200,
    ],
    [wire({ counts: { ADMIN: -1, AGENCY: 1, MANAGER: 0 } }), 200],
    [wire({ counts: { ADMIN: 2, AGENCY: 1, MANAGER: 0, OTHER: 0 } }), 200],
    [wire({ observedAt: '2026-09-15 10:30:00' }), 200],
    [{ success: true, data: { totalOpen: 3 } }, 200],
    [wire(), 401],
    [wire(), 302],
  ])(
    'fails closed for malformed, inconsistent or unauthorized data',
    async (body, status) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(response(body, status));
      await expect(createClient().get(assigneeId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('rejects an invalid owner before HTTP and logs no boundary secrets', async () => {
    const warn = jest.fn();
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      createClient('true', warn).get('../foreign'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
    const logs = JSON.stringify(warn.mock.calls);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('ops-admin:3660');
    expect(logs).not.toContain('../foreign');
  });
});
