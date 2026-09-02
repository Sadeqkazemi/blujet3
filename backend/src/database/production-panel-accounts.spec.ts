import {
  generatePanelTemporaryPassword,
  parsePanelAccountsJson,
  toPanelAccountDryRun,
} from './production-panel-accounts';

const validAccounts = [
  {
    fullName: 'مالک حساب مدیر فناوری',
    username: 'panel.it',
    role: 'IT_MANAGER',
    phone: '09121234567',
    email: 'IT.Owner@blujet.example',
  },
  {
    fullName: 'مالک حساب مدیرعامل',
    username: 'panel.ceo',
    role: 'CEO',
    phone: '09121234568',
  },
];

describe('production panel account bootstrap input', () => {
  it('normalizes safe account input and optional email', () => {
    expect(parsePanelAccountsJson(JSON.stringify(validAccounts))).toEqual([
      {
        ...validAccounts[0],
        phone: '+989121234567',
        email: 'it.owner@blujet.example',
      },
      {
        ...validAccounts[1],
        phone: '+989121234568',
        email: null,
      },
    ]);
  });

  it.each([
    ['username', { ...validAccounts[1], username: 'panel.it' }],
    ['phone', { ...validAccounts[1], phone: '09121234567' }],
    ['email', { ...validAccounts[1], email: 'it.owner@blujet.example' }],
  ])('rejects duplicate %s values', (_field, duplicate) => {
    expect(() =>
      parsePanelAccountsJson(JSON.stringify([validAccounts[0], duplicate])),
    ).toThrow(/Duplicate/);
  });

  it('rejects unsupported roles and invalid 2FA phones', () => {
    expect(() =>
      parsePanelAccountsJson(
        JSON.stringify([{ ...validAccounts[0], role: 'USER' }]),
      ),
    ).toThrow(/unsupported panel role/);
    expect(() =>
      parsePanelAccountsJson(
        JSON.stringify([{ ...validAccounts[0], phone: '02112345678' }]),
      ),
    ).toThrow(/valid Iranian mobile/);
  });

  it('redacts owner contact data from dry-run output', () => {
    const parsed = parsePanelAccountsJson(JSON.stringify(validAccounts));
    expect(toPanelAccountDryRun(parsed)).toEqual([
      { username: 'panel.it', role: 'IT_MANAGER' },
      { username: 'panel.ceo', role: 'CEO' },
    ]);
  });
});

describe('generatePanelTemporaryPassword', () => {
  it('creates unique, strong temporary passwords', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, generatePanelTemporaryPassword),
    );
    expect(passwords.size).toBe(50);
    for (const password of passwords) {
      expect(password).toHaveLength(29);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });
});
