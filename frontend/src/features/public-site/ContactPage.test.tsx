import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from './ContactPage';
import * as contactApi from '../../api/contact';
import * as settingsApi from '../../api/settings';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import { ApiRequestError } from '../../api/envelope';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(settingsApi, 'fetchPublicSupportContact').mockResolvedValue({
    phone: '021 — 91000000',
    email: 'support@blujet.ir',
  });
  vi.spyOn(settingsApi, 'fetchPublicSiteContent').mockResolvedValue({
    homeHeroTitle: '',
    homeHeroSubtitle: '',
    aboutUsText: '',
    contactAddress: 'تهران، ایران',
    contactOfficeHours: 'شنبه تا چهارشنبه، ۸ تا ۱۷',
    termsText: '',
  });
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  );
}

describe('ContactPage', () => {
  it('requires name, phone, subject and message before submitting', async () => {
    renderPage();
    expect(screen.getByTestId('contact-submit')).toBeDisabled();

    await userEvent.type(screen.getByTestId('contact-name'), 'نگار رضایی');
    await userEvent.type(screen.getByTestId('contact-phone'), '09121234567');
    expect(screen.getByTestId('contact-submit')).toBeDisabled();

    await userEvent.type(screen.getByTestId('contact-subject'), 'مشکل در پرداخت');
    await userEvent.type(screen.getByTestId('contact-msg'), 'سلام، سوال داشتم.');
    expect(screen.getByTestId('contact-submit')).toBeEnabled();
  });

  it('submits a real contact message and shows the sent state', async () => {
    const submit = vi.spyOn(contactApi, 'submitContactMessage').mockResolvedValue({
      id: 'c1',
      name: 'نگار رضایی',
      phone: '09121234567',
      subject: 'مشکل در پرداخت',
      body: 'سلام، سوال داشتم.',
      createdAt: new Date().toISOString(),
    });
    renderPage();

    await userEvent.type(screen.getByTestId('contact-name'), 'نگار رضایی');
    await userEvent.type(screen.getByTestId('contact-phone'), '09121234567');
    await userEvent.type(screen.getByTestId('contact-subject'), 'مشکل در پرداخت');
    await userEvent.type(screen.getByTestId('contact-msg'), 'سلام، سوال داشتم.');
    await userEvent.click(screen.getByTestId('contact-submit'));

    expect(await screen.findByTestId('contact-sent')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith({
      name: 'نگار رضایی',
      phone: '09121234567',
      subject: 'مشکل در پرداخت',
      body: 'سلام، سوال داشتم.',
    });
  });

  it('shows the real error message on a submit failure', async () => {
    vi.spyOn(contactApi, 'submitContactMessage').mockRejectedValue(
      new ApiRequestError('VALIDATION_FAILED', 'خطا در ارسال پیام.', 400),
    );
    renderPage();

    await userEvent.type(screen.getByTestId('contact-name'), 'نگار رضایی');
    await userEvent.type(screen.getByTestId('contact-phone'), '09121234567');
    await userEvent.type(screen.getByTestId('contact-subject'), 'مشکل در پرداخت');
    await userEvent.type(screen.getByTestId('contact-msg'), 'سلام');
    await userEvent.click(screen.getByTestId('contact-submit'));

    expect(await screen.findByText('خطا در ارسال پیام.')).toBeInTheDocument();
  });

  it('renders translated hero, channels, and form in English', async () => {
    mockLocale('en');
    const submit = vi.spyOn(contactApi, 'submitContactMessage').mockResolvedValue({
      id: 'c2',
      name: 'Negar Rezaei',
      phone: '09121234567',
      subject: 'Payment issue',
      body: 'Hello, I had a question.',
      createdAt: new Date().toISOString(),
    });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument();
    expect(screen.getByText('24-Hour Support Line')).toBeInTheDocument();
    expect(screen.getByText('Head Office')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('contact-name'), 'Negar Rezaei');
    await userEvent.type(screen.getByTestId('contact-phone'), '09121234567');
    await userEvent.type(screen.getByTestId('contact-subject'), 'Payment issue');
    await userEvent.type(screen.getByTestId('contact-msg'), 'Hello, I had a question.');
    await userEvent.click(screen.getByTestId('contact-submit'));

    expect(await screen.findByText('Your message has been sent')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith({
      name: 'Negar Rezaei',
      phone: '09121234567',
      subject: 'Payment issue',
      body: 'Hello, I had a question.',
    });
  });

  it('renders translated hero and channels in Arabic', () => {
    mockLocale('ar');
    renderPage();
    expect(screen.getByRole('heading', { name: 'اتصل بنا' })).toBeInTheDocument();
    expect(screen.getByText('خط الدعم على مدار الساعة')).toBeInTheDocument();
    expect(screen.getByText('المكتب الرئيسي')).toBeInTheDocument();
  });

  it('shows support phone and email from GET /settings/support-contact', async () => {
    mockLocale('en');
    vi.spyOn(settingsApi, 'fetchPublicSupportContact').mockResolvedValue({
      phone: '021-48000',
      email: 'help@blujet.example',
    });
    renderPage();
    expect(await screen.findByTestId('contact-support-phone')).toHaveTextContent('021-48000');
    expect(screen.getByTestId('contact-support-email')).toHaveTextContent('help@blujet.example');
  });

  it('shows office hours from CMS site content', async () => {
    mockLocale('fa');
    vi.spyOn(settingsApi, 'fetchPublicSiteContent').mockResolvedValue({
      homeHeroTitle: '',
      homeHeroSubtitle: '',
      aboutUsText: '',
      contactAddress: 'تهران، ایران',
      contactOfficeHours: 'شنبه تا پنج‌شنبه ۸:۰۰ تا ۲۰:۰۰',
      termsText: '',
    });
    renderPage();
    expect(await screen.findByText('ساعات کاری دفتر')).toBeInTheDocument();
    expect(screen.getByText('شنبه تا پنج‌شنبه ۸:۰۰ تا ۲۰:۰۰')).toBeInTheDocument();
  });
});
