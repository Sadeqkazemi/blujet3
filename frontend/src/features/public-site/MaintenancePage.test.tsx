import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MaintenancePage from './MaintenancePage';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useAuthModule from '../../hooks/useAuth';
import * as useCareersEnabledModule from '../../hooks/useCareersEnabled';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

beforeEach(() => {
  vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(false);
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MaintenancePage />
    </MemoryRouter>,
  );
}

describe('MaintenancePage', () => {
  it('renders the Persian maintenance notice with homepage shell', () => {
    renderPage();
    expect(screen.getByText('سایت در حال تعمیر و نگهداری است')).toBeInTheDocument();
    expect(screen.getByText('در حال به‌روزرسانی')).toBeInTheDocument();
    expect(screen.getByText(/حدود ۲ ساعت آینده/)).toBeInTheDocument();
    const supportLinks = screen.getAllByRole('link', { name: 'پشتیبانی' });
    expect(supportLinks.some((el) => el.getAttribute('href') === '/support')).toBe(true);
    expect(screen.getAllByText('خدمات').length).toBeGreaterThan(0);
  });

  it('renders translated maintenance notice in English', () => {
    mockLocale('en');
    renderPage();
    expect(screen.getByText('The site is under maintenance')).toBeInTheDocument();
    expect(screen.getByText('Updating')).toBeInTheDocument();
    expect(screen.getByText(/in about 2 hours/)).toBeInTheDocument();
  });

  it('renders translated maintenance notice in Arabic', () => {
    mockLocale('ar');
    renderPage();
    expect(screen.getByText('الموقع قيد الصيانة')).toBeInTheDocument();
    expect(screen.getByText('جارٍ التحديث')).toBeInTheDocument();
  });
});
