import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  isTemporaryPanelUsername,
  TEMPORARY_PANEL_ACCESS_MAX_MS,
  TEMPORARY_PANEL_EXTENSION_MS,
  TEMPORARY_PANEL_INITIAL_ACCESS_MS,
  createTemporaryPanelExpiry,
  createTemporaryPanelV2ExtensionExpiry,
  generateTemporaryPanelPassword,
  getTemporaryPanelAccessState,
} from './temporary-panel-accounts';

describe('temporary panel accounts', () => {
  it('identifies temporary UAT usernames without matching real panel accounts', () => {
    expect(isTemporaryPanelUsername('uat.it')).toBe(true);
    expect(isTemporaryPanelUsername('UAT.IT')).toBe(true);
    expect(isTemporaryPanelUsername('panel.it')).toBe(false);
    expect(isTemporaryPanelUsername(null)).toBe(false);
  });

  it('also identifies the phone-login temporary accounts (agency, customer)', () => {
    expect(isTemporaryPanelUsername('uat.agency')).toBe(true);
    expect(isTemporaryPanelUsername('UAT.CUSTOMER')).toBe(true);
    expect(isTemporaryPanelUsername('UAT.OPERATIONS')).toBe(true);
  });

  it('defines exactly one reserved username-login account for every staff/manager role', () => {
    expect(TEMPORARY_PANEL_ACCOUNTS.map(({ role }) => role).sort()).toEqual(
      [
        'SITE_ADMIN',
        'IT_MANAGER',
        'COMMERCIAL_MANAGER',
        'OPERATIONS_MANAGER',
        'FINANCE_MANAGER',
        'SENIOR_MANAGER',
        'CEO',
        'BOARD_CHAIR',
        'EMPLOYEE',
      ].sort(),
    );
    expect(
      new Set(TEMPORARY_PANEL_ACCOUNTS.map(({ username }) => username)).size,
    ).toBe(TEMPORARY_PANEL_ACCOUNTS.length);
    expect(
      TEMPORARY_PANEL_ACCOUNTS.every(({ username }) =>
        username.startsWith('uat.'),
      ),
    ).toBe(true);
  });

  it('defines exactly one reserved phone-login account for AGENCY and USER', () => {
    expect(
      TEMPORARY_PHONE_LOGIN_ACCOUNTS.map(({ role }) => role).sort(),
    ).toEqual(['AGENCY', 'USER'].sort());
    expect(
      new Set(TEMPORARY_PHONE_LOGIN_ACCOUNTS.map(({ phone }) => phone)).size,
    ).toBe(TEMPORARY_PHONE_LOGIN_ACCOUNTS.length);
    expect(
      TEMPORARY_PHONE_LOGIN_ACCOUNTS.every(({ phone }) =>
        /^09\d{9}$/.test(phone),
      ),
    ).toBe(true);
  });

  it('starts at seven days and accepts only owner-controlled deadlines within the UAT ceiling', () => {
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const deadline = createTemporaryPanelExpiry(createdAt);
    expect(deadline.getTime() - createdAt.getTime()).toBe(
      TEMPORARY_PANEL_INITIAL_ACCESS_MS,
    );
    const base = {
      username: 'uat.it',
      twoFactorEnabled: false,
      createdAt,
      temporaryPasswordOnlyUntil: deadline,
    };
    expect(
      getTemporaryPanelAccessState(base, new Date(deadline.getTime() - 1)),
    ).toBe('ACTIVE');
    expect(getTemporaryPanelAccessState(base, deadline)).toBe('EXPIRED');
    const extendedDeadline = new Date(
      deadline.getTime() + TEMPORARY_PANEL_EXTENSION_MS,
    );
    expect(
      getTemporaryPanelAccessState(
        {
          ...base,
          temporaryPasswordOnlyUntil: extendedDeadline,
        },
        new Date(extendedDeadline.getTime() - 1),
      ),
    ).toBe('ACTIVE');
    expect(
      getTemporaryPanelAccessState({
        ...base,
        temporaryPasswordOnlyUntil: new Date(
          createdAt.getTime() + TEMPORARY_PANEL_ACCESS_MAX_MS + 1,
        ),
      }),
    ).toBe('INVALID');
  });

  it('extends active v2 access by seven days and expired access from execution time', () => {
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const now = new Date('2026-08-20T00:00:00.000Z');
    const activeDeadline = new Date('2026-08-23T00:00:00.000Z');
    expect(
      createTemporaryPanelV2ExtensionExpiry(createdAt, activeDeadline, now),
    ).toEqual(new Date('2026-08-30T00:00:00.000Z'));

    const expiredDeadline = new Date('2026-08-19T00:00:00.000Z');
    expect(
      createTemporaryPanelV2ExtensionExpiry(createdAt, expiredDeadline, now),
    ).toEqual(new Date('2026-08-27T00:00:00.000Z'));
  });

  it('caps a v2 extension at the owner-approved absolute ceiling', () => {
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const previousDeadline = new Date('2026-09-05T00:00:00.000Z');
    const deadline = createTemporaryPanelV2ExtensionExpiry(
      createdAt,
      previousDeadline,
      new Date('2026-08-20T00:00:00.000Z'),
    );
    expect(deadline.getTime()).toBe(
      createdAt.getTime() + TEMPORARY_PANEL_ACCESS_MAX_MS,
    );
  });

  it('leaves room for the v3 grant to provide a full seven-day window', () => {
    expect(TEMPORARY_PANEL_ACCESS_MAX_MS).toBe(
      TEMPORARY_PANEL_INITIAL_ACCESS_MS + 4 * TEMPORARY_PANEL_EXTENSION_MS,
    );
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const now = new Date('2026-08-28T00:00:00.000Z');
    const expiredDeadline = new Date('2026-08-27T00:00:00.000Z');
    expect(
      createTemporaryPanelV2ExtensionExpiry(createdAt, expiredDeadline, now),
    ).toEqual(new Date('2026-09-04T00:00:00.000Z'));
  });

  it('never treats ordinary or 2FA-enabled staff as password-only accounts', () => {
    const createdAt = new Date();
    const temporaryPasswordOnlyUntil = createTemporaryPanelExpiry(createdAt);
    expect(
      getTemporaryPanelAccessState({
        username: 'finance',
        twoFactorEnabled: false,
        createdAt,
        temporaryPasswordOnlyUntil,
      }),
    ).toBe('INVALID');
    expect(
      getTemporaryPanelAccessState({
        username: 'uat.finance',
        twoFactorEnabled: true,
        createdAt,
        temporaryPasswordOnlyUntil,
      }),
    ).toBe('INVALID');
  });

  it('generates unique 16-character letters-and-digits-only passwords', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, generateTemporaryPanelPassword),
    );
    expect(passwords.size).toBe(50);
    for (const password of passwords) {
      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[A-Za-z0-9]{16}$/);
    }
  });
});
