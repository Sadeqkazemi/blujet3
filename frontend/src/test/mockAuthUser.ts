import type { AuthUser, Locale, Role } from '../types/auth';

export function mockAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    fullName: 'کاربر تست',
    role: 'USER',
    preferredLocale: 'FA',
    mustChangePassword: false,
    isSuperAdmin: false,
    ...overrides,
  };
}

export function mockAuthUserWithRole(role: Role, overrides: Omit<Partial<AuthUser>, 'role'> = {}): AuthUser {
  return mockAuthUser({ role, ...overrides });
}

export function mockAuthUserLocale(locale: Locale, overrides: Partial<AuthUser> = {}): AuthUser {
  return mockAuthUser({ preferredLocale: locale, ...overrides });
}
