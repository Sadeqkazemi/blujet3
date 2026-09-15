import { opsAdminCartableUnreadReadConfig } from './ops-admin-cartable-unread-read.config';

describe('Ops/Admin cartable unread read config', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();
  const token = 'ops-admin-unread-test-token-at-least-32-characters';

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('stays disabled without validating optional credentials', () => {
    expect(opsAdminCartableUnreadReadConfig({})).toEqual({ enabled: false });
    expect(
      opsAdminCartableUnreadReadConfig({
        OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: 'false',
        OPS_ADMIN_SERVICE_URL: 'not-a-url',
      }),
    ).toEqual({ enabled: false });
  });

  it('accepts an enabled root origin and strong service credential', () => {
    expect(
      opsAdminCartableUnreadReadConfig({
        OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: 'true',
        OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660',
        OPS_ADMIN_INTERNAL_TOKEN: token,
      }),
    ).toEqual({
      enabled: true,
      url: 'http://ops-admin:3660',
      token,
    });
  });

  it.each([
    { OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: 'yes' },
    { OPS_ADMIN_INTERNAL_TOKEN: 'short' },
    { OPS_ADMIN_INTERNAL_TOKEN: `bad ${'x'.repeat(32)}` },
    { OPS_ADMIN_SERVICE_URL: 'http://user:secret@ops-admin:3660' },
    { OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660/path' },
    { OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660?token=secret' },
    { OPS_ADMIN_SERVICE_URL: 'file:///tmp/socket' },
  ])('rejects an unsafe enabled configuration: %j', (override) => {
    expect(() =>
      opsAdminCartableUnreadReadConfig({
        OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: 'true',
        OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660',
        OPS_ADMIN_INTERNAL_TOKEN: token,
        ...override,
      }),
    ).toThrow();
  });

  it('requires UTC only while enabled', () => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    expect(() =>
      opsAdminCartableUnreadReadConfig({
        OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: 'true',
        OPS_ADMIN_SERVICE_URL: 'http://ops-admin:3660',
        OPS_ADMIN_INTERNAL_TOKEN: token,
      }),
    ).toThrow('UTC');
    expect(opsAdminCartableUnreadReadConfig({})).toEqual({ enabled: false });
  });
});
