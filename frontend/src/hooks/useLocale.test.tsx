import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from './useLocale';
import * as authApi from '../api/auth';
import * as useAuthModule from './useAuth';

function mockAuth(overrides: Partial<ReturnType<typeof useAuthModule.useAuth>>) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  });
}

describe('useLocale', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'fa';
    document.documentElement.dir = 'rtl';
    vi.restoreAllMocks();
  });

  it('defaults to fa when localStorage has nothing set', () => {
    mockAuth({});
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });
    expect(result.current.locale).toBe('fa');
  });

  it('reads an existing localStorage value on mount', () => {
    localStorage.setItem('blujet_lang', 'en');
    mockAuth({});
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });
    expect(result.current.locale).toBe('en');
  });

  it('setLocale writes localStorage and updates state; no API call when anonymous', async () => {
    mockAuth({});
    const update = vi.spyOn(authApi, 'updateMyLocale');
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    act(() => result.current.setLocale('en'));

    expect(result.current.locale).toBe('en');
    expect(localStorage.getItem('blujet_lang')).toBe('en');
    expect(update).not.toHaveBeenCalled();
  });

  it('setLocale syncs to the backend when authenticated', async () => {
    mockAuth({
      status: 'authenticated',
      user: { id: 'u1', fullName: 'کاربر تست', role: 'USER', preferredLocale: 'FA' },
    });
    const update = vi.spyOn(authApi, 'updateMyLocale').mockResolvedValue({ preferredLocale: 'AR' });
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    act(() => result.current.setLocale('ar'));

    await waitFor(() => expect(update).toHaveBeenCalledWith('AR'));
    expect(localStorage.getItem('blujet_lang')).toBe('ar');
  });

  it('keeps the public-site locale selected before login and syncs it to the user account', async () => {
    localStorage.setItem('blujet_lang', 'en');
    mockAuth({
      status: 'authenticated',
      user: { id: 'u1', fullName: 'کاربر تست', role: 'USER', preferredLocale: 'FA' },
    });
    const update = vi.spyOn(authApi, 'updateMyLocale').mockResolvedValue({ preferredLocale: 'EN' });
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    await waitFor(() => expect(result.current.locale).toBe('en'));
    expect(localStorage.getItem('blujet_lang')).toBe('en');
    expect(update).toHaveBeenCalledWith('EN');
  });

  it('keeps an agency locale selected before login instead of reverting to Persian', async () => {
    localStorage.setItem('blujet_lang', 'ar');
    mockAuth({
      status: 'authenticated',
      user: { id: 'a1', fullName: 'آژانس تست', role: 'AGENCY', preferredLocale: 'FA' },
    });
    const update = vi.spyOn(authApi, 'updateMyLocale').mockResolvedValue({ preferredLocale: 'AR' });
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    await waitFor(() => expect(result.current.locale).toBe('ar'));
    expect(localStorage.getItem('blujet_lang')).toBe('ar');
    expect(update).toHaveBeenCalledWith('AR');
  });

  it('adopts the account locale when this browser has no public-site locale yet', async () => {
    mockAuth({
      status: 'authenticated',
      user: { id: 'u1', fullName: 'کاربر تست', role: 'USER', preferredLocale: 'EN' },
    });
    const update = vi.spyOn(authApi, 'updateMyLocale');
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    await waitFor(() => expect(result.current.locale).toBe('en'));
    expect(localStorage.getItem('blujet_lang')).toBe('en');
    expect(update).not.toHaveBeenCalled();
  });

  it('forces manager and employee panels to Persian even if a public locale was stored', async () => {
    localStorage.setItem('blujet_lang', 'en');
    mockAuth({
      status: 'authenticated',
      user: { id: 'm1', fullName: 'مدیر تست', role: 'COMMERCIAL_MANAGER', preferredLocale: 'EN' },
    });
    const update = vi.spyOn(authApi, 'updateMyLocale');
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    await waitFor(() => expect(result.current.locale).toBe('fa'));
    expect(localStorage.getItem('blujet_lang')).toBe('fa');
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the root document language and direction in sync', async () => {
    localStorage.setItem('blujet_lang', 'en');
    mockAuth({});
    const { result } = renderHook(() => useLocale(), { wrapper: LocaleProvider });

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
    });

    act(() => result.current.setLocale('ar'));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    });
  });

  it('falls back to fa with a no-op setter when used outside a LocaleProvider', () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe('fa');
    expect(() => result.current.setLocale('en')).not.toThrow();
  });
});
