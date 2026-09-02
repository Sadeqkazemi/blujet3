/** Shared access-revoked signal — contract: 403 + code ACCESS_REVOKED. */

export const ACCESS_REVOKED_MESSAGE = 'اجازه دسترسی برای شما امکان‌پذیر نیست.';
export const ACCESS_REVOKED_EVENT = 'blujet:access-revoked';

export type AccessRevokedDetail = {
  message: string;
  status?: number;
  code?: string;
  source?: 'http' | 'event' | 'manual';
};

export function isAccessRevokedError(err: {
  status?: number;
  code?: string;
  message?: string;
}): boolean {
  if (err.code === 'ACCESS_REVOKED') return true;
  if (err.status === 403 && err.code === 'ACCESS_REVOKED') return true;
  return false;
}

export function emitAccessRevoked(detail: AccessRevokedDetail = { message: ACCESS_REVOKED_MESSAGE }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AccessRevokedDetail>(ACCESS_REVOKED_EVENT, {
      detail: { ...detail, message: ACCESS_REVOKED_MESSAGE },
    }),
  );
}

export function onAccessRevoked(handler: (detail: AccessRevokedDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AccessRevokedDetail>;
    handler(ce.detail ?? { message: ACCESS_REVOKED_MESSAGE });
  };
  window.addEventListener(ACCESS_REVOKED_EVENT, listener);
  return () => window.removeEventListener(ACCESS_REVOKED_EVENT, listener);
}
