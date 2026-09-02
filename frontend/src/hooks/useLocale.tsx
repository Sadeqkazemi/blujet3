import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { updateMyLocale } from '../api/auth';
import { useAuth } from './useAuth';
import type { Locale, Role } from '../types/auth';

const STORAGE_KEY = 'blujet_lang';

export type StoredLocale = 'fa' | 'en' | 'ar';

function readStoredOrNull(): StoredLocale | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'fa' || v === 'en' || v === 'ar' ? v : null;
}

function readStored(): StoredLocale {
  return readStoredOrNull() ?? 'fa';
}

function toBackend(l: StoredLocale): Locale {
  return l.toUpperCase() as Locale;
}

function toStored(l: Locale): StoredLocale {
  return l.toLowerCase() as StoredLocale;
}

interface LocaleContextValue {
  locale: StoredLocale;
  setLocale: (next: StoredLocale) => void;
}

// Falls back to plain fa/no-op when rendered without a LocaleProvider (e.g.
// a test that renders a shared component in isolation and doesn't care
// about locale) rather than throwing — the real app always wraps routes in
// LocaleProvider via App.tsx, so this default is never hit in production.
const defaultContextValue: LocaleContextValue = { locale: 'fa', setLocale: () => {} };

const LocaleContext = createContext<LocaleContextValue>(defaultContextValue);

const LOCALIZED_ACCOUNT_ROLES = new Set<Role>(['USER', 'AGENCY']);

/** An anonymous visitor's choice lives only in localStorage — there's no
 * User row to attach it to yet. `preferredLocale` in the DB is purely the
 * cross-device sync point for a logged-in USER/AGENCY. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<StoredLocale>(() => readStored());
  const { status, user } = useAuth();
  const lastSyncedAccountLocale = useRef<string | null>(null);

  // A locally-directed wrapper does not update browser or screen-reader
  // semantics; keep the root document metadata aligned with the UI locale.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'en' ? 'ltr' : 'rtl';
  }, [locale]);

  // Public customer and agency flows keep the language that was active
  // before authentication. This prevents checkout from switching back to
  // Persian after the sign-in/OTP round-trip. Manager/staff panels remain
  // Persian-only by product policy.
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;

    if (!LOCALIZED_ACCOUNT_ROLES.has(user.role)) {
      lastSyncedAccountLocale.current = null;
      localStorage.setItem(STORAGE_KEY, 'fa');
      setLocaleState('fa');
      return;
    }

    const storedLocale = readStoredOrNull();
    const dbLocale = toStored(user.preferredLocale);

    if (!storedLocale) {
      localStorage.setItem(STORAGE_KEY, dbLocale);
      setLocaleState(dbLocale);
      lastSyncedAccountLocale.current = `${user.id}:${dbLocale}`;
      return;
    }

    setLocaleState(storedLocale);
    const syncKey = `${user.id}:${storedLocale}`;
    if (storedLocale !== dbLocale && lastSyncedAccountLocale.current !== syncKey) {
      lastSyncedAccountLocale.current = syncKey;
      void updateMyLocale(toBackend(storedLocale)).catch(() => {
        if (lastSyncedAccountLocale.current === syncKey) {
          lastSyncedAccountLocale.current = null;
        }
      });
    } else {
      lastSyncedAccountLocale.current = syncKey;
    }
  }, [status, user]);

  const setLocale = useCallback(
    (next: StoredLocale) => {
      if (status === 'authenticated' && user && !LOCALIZED_ACCOUNT_ROLES.has(user.role)) {
        localStorage.setItem(STORAGE_KEY, 'fa');
        setLocaleState('fa');
        return;
      }

      localStorage.setItem(STORAGE_KEY, next);
      setLocaleState(next);
      if (status === 'authenticated' && user && LOCALIZED_ACCOUNT_ROLES.has(user.role)) {
        lastSyncedAccountLocale.current = `${user.id}:${next}`;
        // Fire-and-forget: the UI already reflects the choice; a failed
        // sync isn't user-visible and simply retries on the next change.
        void updateMyLocale(toBackend(next)).catch(() => {});
      }
    },
    [status, user],
  );

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
