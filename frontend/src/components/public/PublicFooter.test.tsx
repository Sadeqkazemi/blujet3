import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicFooter from './PublicFooter';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import * as useCareersEnabledModule from '../../hooks/useCareersEnabled';
import * as useSocialLinksModule from '../../hooks/useSocialLinks';
import * as usePublicSiteSettingsModule from '../../hooks/usePublicSiteSettings';

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

function mockDesktop() {
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
}

function mockMobile() {
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(false);
  vi.spyOn(useSocialLinksModule, 'useSocialLinks').mockReturnValue([]);
  vi.spyOn(usePublicSiteSettingsModule, 'usePublicAppLinks').mockReturnValue({});
  vi.spyOn(usePublicSiteSettingsModule, 'usePublicSupportContact').mockReturnValue({
    phone: '021-44694471',
    email: 'info@blujet.com',
  });
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <PublicFooter />
    </MemoryRouter>,
  );
}

describe('PublicFooter — desktop', () => {
  beforeEach(() => mockDesktop());

  it('renders Persian labels by default', () => {
    mockLocale('fa');
    renderFooter();
    expect(screen.getByText('خدمات')).toBeInTheDocument();
    expect(screen.queryByText('رزرو پرواز')).not.toBeInTheDocument();
    expect(screen.getByText('© ۱۴۰۵ blujet. تمامی حقوق محفوظ است.')).toBeInTheDocument();
    expect(screen.queryByText('استرداد بلیط')).not.toBeInTheDocument();
    expect(screen.queryByText('بلاگ')).not.toBeInTheDocument();
  });

  it('renders English labels when locale is en', () => {
    mockLocale('en');
    renderFooter();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.queryByText('Book a Flight')).not.toBeInTheDocument();
    expect(screen.getByText('© 2026 blujet. All rights reserved.')).toBeInTheDocument();
    expect(screen.getByTestId('footer-desktop-tools')).toHaveClass('items-end');
    expect(screen.getByTestId('footer-desktop-trust-row')).toHaveClass('justify-end');
    expect(screen.getByTestId('public-footer-desktop')).toHaveClass('pt-9', 'pb-5');
  });

  it('renders app download buttons and trust badges', () => {
    mockLocale('fa');
    renderFooter();
    expect(screen.getByTestId('footer-app-store')).toBeInTheDocument();
    expect(screen.getByTestId('footer-google-play')).toBeInTheDocument();
    expect(screen.getByTestId('footer-trust-badges')).toBeInTheDocument();
    expect(screen.getByText('نماد اعتماد الکترونیکی')).toBeInTheDocument();
    expect(screen.getByText('عضو IATA')).toBeInTheDocument();
    const tools = screen.getByTestId('footer-desktop-tools');
    expect(tools).toHaveAttribute('dir', 'ltr');
    expect(tools).toContainElement(screen.getByTestId('footer-app-store'));
    expect(tools).toContainElement(screen.getByTestId('footer-trust-badges'));
  });

  it('uses app links and support contact supplied by site settings', () => {
    mockLocale('fa');
    vi.spyOn(usePublicSiteSettingsModule, 'usePublicAppLinks').mockReturnValue({
      app_store: 'https://apps.example/app-store',
      google_play: 'https://apps.example/google-play',
    });
    vi.spyOn(usePublicSiteSettingsModule, 'usePublicSupportContact').mockReturnValue({
      phone: '021-12345678',
      email: 'support@example.com',
    });
    renderFooter();
    expect(screen.getByTestId('footer-app-store')).toHaveAttribute('href', 'https://apps.example/app-store');
    expect(screen.getByTestId('footer-google-play')).toHaveAttribute('href', 'https://apps.example/google-play');
    expect(screen.getByText('021-12345678')).toBeInTheDocument();
    expect(screen.getByText('support@example.com')).toBeInTheDocument();
  });

  it('renders enabled social links supplied by site settings', () => {
    mockLocale('fa');
    vi.spyOn(useSocialLinksModule, 'useSocialLinks').mockReturnValue([
      {
        id: 'instagram',
        name: 'Instagram',
        url: 'https://instagram.com/blujet',
      },
    ]);
    renderFooter();
    expect(screen.getByTestId('footer-social-instagram')).toHaveAttribute(
      'href',
      'https://instagram.com/blujet',
    );
  });

  it('keeps social icons and trust badges in separate spaced layout groups', () => {
    mockLocale('fa');
    vi.spyOn(useSocialLinksModule, 'useSocialLinks').mockReturnValue([
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        url: 'https://wa.me/989121234567',
      },
    ]);
    renderFooter();

    const social = screen.getByTestId('footer-social-section');
    const trust = screen.getByTestId('footer-trust-section');
    expect(social).not.toContainElement(trust);
    expect(social).toHaveClass('footer-social-section');
    expect(trust).toHaveClass('footer-trust-section');
    expect(screen.getByTestId('footer-social-whatsapp')).toHaveClass('text-[#d9e4ef]');
    expect(screen.getByTestId('social-icon-whatsapp')).toBeInTheDocument();
    expect(screen.getByTestId('footer-desktop-trust-row')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('footer-desktop-trust-row')).toHaveClass('justify-start');
    expect(trust).not.toHaveStyle({ borderTop: '1px solid #ffffff12' });
  });

  it('hides the careers link when disabled, shows it when enabled', () => {
    mockLocale('fa');
    const { rerender } = renderFooter();
    expect(screen.queryByText('فرصت‌های شغلی')).not.toBeInTheDocument();

    vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(true);
    rerender(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>,
    );
    expect(screen.getByText('فرصت‌های شغلی')).toHaveAttribute('href', '/careers');
  });
});

describe('PublicFooter — mobile', () => {
  beforeEach(() => mockMobile());

  it('separates social links from trust badges on narrow screens', () => {
    mockLocale('en');
    vi.spyOn(useSocialLinksModule, 'useSocialLinks').mockReturnValue([
      { id: 'whatsapp', name: 'WhatsApp', url: 'https://wa.me/989121234567' },
    ]);
    renderFooter();

    expect(screen.getByTestId('footer-social-section')).toBeInTheDocument();
    expect(screen.getByTestId('footer-trust-section')).toBeInTheDocument();
  });

  it('renders centered brand block and accordion sections', () => {
    mockLocale('fa');
    renderFooter();
    expect(screen.getByTestId('footer-app-store')).toBeInTheDocument();
    expect(screen.getByText('خدمات')).toBeInTheDocument();
    expect(screen.getByText('شرکت')).toBeInTheDocument();
    expect(screen.getByText('پشتیبانی')).toBeInTheDocument();
  });
});
