import { ConfigService } from '@nestjs/config';
import { IdentityTokenClient } from './identity-token.client';

describe('IdentityTokenClient', () => {
  const client = () =>
    new IdentityTokenClient(
      new ConfigService({
        IDENTITY_SERVICE_URL: 'http://identity.test',
        IDENTITY_INTERNAL_TOKEN: 'identity-internal-token-at-least-32-chars',
      }),
    );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the empty 204 response used by Identity logout', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);

    await expect(client().logout('refresh-token')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://identity.test/internal/v1/identity/sessions/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('preserves an invalid-session response as HTTP 401', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(client().refresh('expired-token', {})).rejects.toMatchObject({
      status: 401,
    });
  });
});
