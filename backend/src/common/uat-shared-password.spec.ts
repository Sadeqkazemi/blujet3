import {
  UAT_PANEL_SHARED_PASSWORD_ENV_VAR,
  assertUatSandboxWriteAllowed,
  resolveUatSharedPassword,
} from './uat-shared-password';

const STRONG_PASSWORD = 'Blujet@UAT1404';

describe('UAT shared password', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('assertUatSandboxWriteAllowed', () => {
    it('refuses when AUTH_SANDBOX_ENABLED is not true and NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AUTH_SANDBOX_ENABLED;
      expect(() => assertUatSandboxWriteAllowed()).toThrow(
        /AUTH_SANDBOX_ENABLED must be true/,
      );
    });

    it('allows when AUTH_SANDBOX_ENABLED=true even in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_SANDBOX_ENABLED = 'true';
      expect(() => assertUatSandboxWriteAllowed()).not.toThrow();
    });
  });

  describe('resolveUatSharedPassword', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_SANDBOX_ENABLED = 'true';
    });

    it('refuses a real production environment without sandbox enabled', () => {
      delete process.env.AUTH_SANDBOX_ENABLED;
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = STRONG_PASSWORD;
      expect(() => resolveUatSharedPassword()).toThrow(
        /AUTH_SANDBOX_ENABLED must be true/,
      );
    });

    it('refuses an unset password', () => {
      delete process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR];
      expect(() => resolveUatSharedPassword()).toThrow(/is not set or empty/);
    });

    it('refuses an empty/whitespace-only password', () => {
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = '   ';
      expect(() => resolveUatSharedPassword()).toThrow(/is not set or empty/);
    });

    it('refuses a short/weak password', () => {
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = 'weak1';
      expect(() => resolveUatSharedPassword()).toThrow(
        /does not meet the required strength/,
      );
    });

    it('refuses a password with no symbol (fails the strength policy)', () => {
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = 'Password1234';
      expect(() => resolveUatSharedPassword()).toThrow(
        /does not meet the required strength/,
      );
    });

    it('returns the trimmed password when strong and sandbox-enabled', () => {
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = `  ${STRONG_PASSWORD}  `;
      expect(resolveUatSharedPassword()).toBe(STRONG_PASSWORD);
    });

    it('never includes the password value in a thrown error message', () => {
      const secret = 'Weak1!';
      process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR] = secret;
      try {
        resolveUatSharedPassword();
        throw new Error('expected resolveUatSharedPassword to throw');
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    });
  });
});
