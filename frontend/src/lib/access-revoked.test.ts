import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ACCESS_REVOKED_EVENT,
  ACCESS_REVOKED_MESSAGE,
  emitAccessRevoked,
  isAccessRevokedError,
  onAccessRevoked,
} from './access-revoked';

describe('access-revoked', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects ACCESS_REVOKED on 403 (contract)', () => {
    expect(
      isAccessRevokedError({
        status: 403,
        code: 'ACCESS_REVOKED',
        message: 'دسترسی شما به این پنل غیرفعال شده است.',
      }),
    ).toBe(true);
    expect(
      isAccessRevokedError({
        status: 401,
        code: 'ACCESS_REVOKED',
        message: '…',
      }),
    ).toBe(true);
    expect(isAccessRevokedError({ status: 403, code: 'FORBIDDEN', message: 'نه' })).toBe(false);
    expect(
      isAccessRevokedError({
        status: 403,
        code: 'PANEL_DISABLED',
        message: 'این پنل موقتاً غیرفعال شده است.',
      }),
    ).toBe(false);
  });

  it('emits a window event with the fixed Persian message', () => {
    const handler = vi.fn();
    const off = onAccessRevoked(handler);
    emitAccessRevoked({ message: 'x', status: 403, code: 'ACCESS_REVOKED' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ message: ACCESS_REVOKED_MESSAGE }),
    );
    off();
    expect(ACCESS_REVOKED_EVENT).toBe('blujet:access-revoked');
  });
});
