import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotFoundPage from './NotFoundPage';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useAuthModule from '../../hooks/useAuth';
import * as useCareersEnabledModule from '../../hooks/useCareersEnabled';

import * as useIsMobileModule from '../../hooks/useIsMobile';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

beforeEach(() => {
  vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(false);
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
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
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('renders the Persian 404 heading, homepage shell CTAs, and links', () => {
    renderPage();
    expect(screen.getByText('صفحه‌ای که دنبالش بودید پیدا نشد')).toBeInTheDocument();
    expect(screen.getByText('بازگشت به صفحهٔ اصلی')).toHaveAttribute('href', '/');
    expect(screen.getByText('جستجوی پرواز')).toHaveAttribute('href', '/');
    expect(screen.getByText('۴۰۴')).toBeInTheDocument();
    // Homepage header/footer shell
    expect(screen.getByTestId('public-services-menu-toggle')).toHaveTextContent('خدمات');
  });

  it('renders translated heading and links in English', () => {
    mockLocale('en');
    renderPage();
    expect(screen.getByText("The page you're looking for wasn't found")).toBeInTheDocument();
    expect(screen.getByText('Back to homepage')).toBeInTheDocument();
    expect(screen.getByText('Search flights')).toBeInTheDocument();
  });

  it('renders translated heading and links in Arabic', () => {
    mockLocale('ar');
    renderPage();
    expect(screen.getByText('الصفحة التي تبحث عنها غير موجودة')).toBeInTheDocument();
    expect(screen.getByText('العودة إلى الصفحة الرئيسية')).toBeInTheDocument();
  });
});
