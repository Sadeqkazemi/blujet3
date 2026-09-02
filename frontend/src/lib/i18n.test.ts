import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useT, DIR, FONT } from './i18n';
import * as useLocaleModule from '../hooks/useLocale';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

describe('useT', () => {
  it('returns the fa string by default', () => {
    mockLocale('fa');
    const { result } = renderHook(() => useT());
    expect(result.current('navFlights')).toBe('پرواز');
  });

  it('returns the en string when locale is en', () => {
    mockLocale('en');
    const { result } = renderHook(() => useT());
    expect(result.current('navFlights')).toBe('Flights');
  });

  it('returns the ar string when locale is ar', () => {
    mockLocale('ar');
    const { result } = renderHook(() => useT());
    expect(result.current('navFlights')).toBe('الطيران');
  });
});

describe('DIR/FONT', () => {
  it('fa and ar are rtl, en is ltr', () => {
    expect(DIR.fa).toBe('rtl');
    expect(DIR.ar).toBe('rtl');
    expect(DIR.en).toBe('ltr');
  });

  it('en uses Inter, fa/ar use Vazirmatn', () => {
    expect(FONT.en).toContain('Inter');
    expect(FONT.fa).toContain('Vazirmatn');
    expect(FONT.ar).toContain('Vazirmatn');
  });
});
