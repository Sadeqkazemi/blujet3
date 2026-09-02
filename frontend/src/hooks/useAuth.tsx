import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import type { AuthUser } from '../types/auth';
import type { StaffLoginResult } from '../api/auth';
import type { SandboxTenantAccount } from '../api/auth';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  requestLogin: (username: string, password: string) => Promise<StaffLoginResult>;
  confirmTwoFactor: (challengeId: string, code: string) => Promise<AuthUser>;
  agencyLogin: (
    phone: string,
    password: string,
  ) => Promise<AuthUser | { challengeId: string }>;
  confirmAgencyTwoFactor?: (
    challengeId: string,
    code: string,
  ) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<AuthUser>;
  // Public purchase engine (customer phone+OTP login) — optional so every
  // existing staff/agency test's mocked AuthContextValue literal (which
  // predates the customer track) keeps type-checking without change.
  requestOtp?: (phone: string) => Promise<string>;
  verifyOtp?: (challengeId: string, code: string) => Promise<AuthUser>;
  // Phase 21 — optional customer email/phone+password login, alongside OTP.
  passwordLogin?: (phone: string, password: string) => Promise<AuthUser>;
  // Phase 51 — فراموشی رمز email path, alongside the phone+OTP path above.
  requestPasswordResetEmail?: (email: string) => Promise<string>;
  verifyPasswordResetEmail?: (challengeId: string, code: string) => Promise<AuthUser>;
  listSandboxTenantAccounts?: () => Promise<SandboxTenantAccount[]>;
  startSandboxImpersonation?: (targetUserId: string) => Promise<AuthUser>;
  returnFromSandboxImpersonation?: () => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await authApi.refreshSession();
        const me = await authApi.fetchMe();
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestLogin = useCallback(async (username: string, password: string) => {
    const result = await authApi.staffLogin(username, password);
    if (
      result.loginMode === 'TEMPORARY_PASSWORD_ONLY' ||
      result.loginMode === 'PASSWORD_ONLY'
    ) {
      setUser(result.user);
      setStatus('authenticated');
    }
    return result;
  }, []);

  const confirmTwoFactor = useCallback(async (challengeId: string, code: string) => {
    const { user: loggedInUser } = await authApi.verifyTwoFactor(challengeId, code);
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const agencyLogin = useCallback(async (phone: string, password: string) => {
    const result = await authApi.agencyLogin(phone, password);
    if ('challengeId' in result) return { challengeId: result.challengeId };
    const loggedInUser = result.user;
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const confirmAgencyTwoFactor = useCallback(
    async (challengeId: string, code: string) => {
      const { user: loggedInUser } = await authApi.verifyAgencyLogin(
        challengeId,
        code,
      );
      setUser(loggedInUser);
      setStatus('authenticated');
      return loggedInUser;
    },
    [],
  );

  const requestOtp = useCallback(async (phone: string) => {
    const { challengeId } = await authApi.requestOtp(phone);
    return challengeId;
  }, []);

  const verifyOtp = useCallback(async (challengeId: string, code: string) => {
    const { user: loggedInUser } = await authApi.verifyOtp(challengeId, code);
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const passwordLogin = useCallback(async (phone: string, password: string) => {
    const { user: loggedInUser } = await authApi.customerPasswordLogin(phone, password);
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const requestPasswordResetEmail = useCallback(async (email: string) => {
    const { challengeId } = await authApi.requestPasswordResetEmail(email);
    return challengeId;
  }, []);

  const verifyPasswordResetEmail = useCallback(async (challengeId: string, code: string) => {
    const { user: loggedInUser } = await authApi.verifyPasswordResetEmail(challengeId, code);
    setUser(loggedInUser);
    setStatus('authenticated');
    return loggedInUser;
  }, []);

  const listSandboxTenantAccounts = useCallback(() => authApi.fetchSandboxTenantAccounts(), []);

  const startSandboxImpersonation = useCallback(async (targetUserId: string) => {
    const { user: impersonatedUser } = await authApi.startSandboxImpersonation(targetUserId);
    setUser(impersonatedUser);
    setStatus('authenticated');
    return impersonatedUser;
  }, []);

  const returnFromSandboxImpersonation = useCallback(async () => {
    await authApi.refreshSession();
    const owner = await authApi.fetchMe();
    setUser(owner);
    setStatus('authenticated');
    return owner;
  }, []);

  const signOut = useCallback(async () => {
    // Best-effort server-side revoke — a failed/rate-limited call must never
    // trap the user in a session they clicked "sign out" on.
    try {
      await authApi.logout();
    } catch {
      // The local authentication state is authoritative for the browser UI;
      // the short-lived server token will expire even if revocation is down.
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      requestLogin,
      confirmTwoFactor,
      agencyLogin,
      confirmAgencyTwoFactor,
      signOut,
      refreshMe,
      requestOtp,
      verifyOtp,
      passwordLogin,
      requestPasswordResetEmail,
      verifyPasswordResetEmail,
      listSandboxTenantAccounts,
      startSandboxImpersonation,
      returnFromSandboxImpersonation,
    }),
    [
      status,
      user,
      requestLogin,
      confirmTwoFactor,
      agencyLogin,
      confirmAgencyTwoFactor,
      signOut,
      refreshMe,
      requestOtp,
      verifyOtp,
      passwordLogin,
      requestPasswordResetEmail,
      verifyPasswordResetEmail,
      listSandboxTenantAccounts,
      startSandboxImpersonation,
      returnFromSandboxImpersonation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Read-only presentation surfaces may also render in isolated tests or
 * previews. Mutating auth flows must keep using useAuth(). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
