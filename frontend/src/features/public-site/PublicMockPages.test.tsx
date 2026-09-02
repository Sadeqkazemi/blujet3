import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerLoginPage from './CustomerLoginPage';
import AboutPage from './AboutPage';
import NotFoundPage from './NotFoundPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

const requestOtp = vi.fn().mockResolvedValue('challenge-1');
const verifyOtp = vi.fn().mockResolvedValue({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    requestOtp,
    verifyOtp,
    passwordLogin: vi.fn(),
    signOut: vi.fn(),
  });
});

afterEach(() => {
  vi.spyOn(useLocaleModule, 'useLocale').mockRestore();
});

function renderWithRouter(node: React.ReactNode, initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
}

describe('CustomerLoginPage', () => {
  it('walks through the two OTP steps with a resend countdown', async () => {
    renderWithRouter(<CustomerLoginPage />);
    expect(screen.getByTestId('signin-tab-login')).toBeInTheDocument();
    expect(screen.queryByTestId('signin-acct-agency')).not.toBeInTheDocument();
    expect(screen.getByTestId('signin-agency-link')).toHaveAttribute('href', '/agency/login');
    expect(screen.getByTestId('signin-forgot')).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByText('ورود به حساب')).toBeInTheDocument();
    expect(screen.getByText(/سفرت را هوشمندانه/)).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('signin-phone'), '09121234567');
    await userEvent.click(screen.getByTestId('signin-request'));
    expect(requestOtp).toHaveBeenCalledWith('09121234567');

    expect(await screen.findByTestId('signin-resend-timer')).toHaveTextContent('ارسال مجدد کد');
    // 6 OTP cells — type into the first; remaining filled via paste/per-cell
    const cells = [0, 1, 2, 3, 4, 5].map((i) =>
      i === 0 ? screen.getByTestId('signin-code') : screen.getByTestId(`signin-otp-${i}`),
    );
    for (let i = 0; i < 6; i++) {
      await userEvent.type(cells[i]!, String(i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : i === 3 ? 4 : i === 4 ? 5 : 6));
    }
    await userEvent.click(screen.getByTestId('signin-verify'));
    expect(verifyOtp).toHaveBeenCalledWith('challenge-1', '123456');
  });

  it('signup tab requires name and terms before requesting OTP', async () => {
    renderWithRouter(<CustomerLoginPage />);

    await userEvent.click(screen.getByTestId('signin-tab-signup'));
    expect(screen.getByTestId('signup-name')).toBeInTheDocument();
    expect(screen.getByTestId('signin-request')).toBeDisabled();

    await userEvent.type(screen.getByTestId('signup-name'), 'نگار رضایی');
    await userEvent.type(screen.getByTestId('signin-phone'), '09121234567');
    await userEvent.click(screen.getByTestId('signup-terms'));
    expect(screen.getByTestId('signin-request')).toBeEnabled();
  });

  it('opens directly on signup when requested by the guest purchase prompt', () => {
    renderWithRouter(<CustomerLoginPage />, '/signin?mode=signup');

    expect(screen.getByTestId('signup-name')).toBeInTheDocument();
    expect(screen.getByText('ساخت حساب کاربری')).toBeInTheDocument();
  });

  it('renders translated tabs, agency link, and forgot-password pill in English', () => {
    mockLocale('en');
    renderWithRouter(<CustomerLoginPage />);
    expect(screen.getByTestId('signin-tab-login')).toHaveTextContent('Log in');
    expect(screen.getByTestId('signin-tab-signup')).toHaveTextContent('Sign up');
    expect(screen.getByTestId('signin-agency-link')).toHaveTextContent('Agency partner login');
    expect(screen.getByTestId('signin-forgot')).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByText('Log in to your account')).toBeInTheDocument();
    expect(screen.getByTestId('customer-login-page')).toHaveStyle({
      fontFamily: "Inter, 'Vazirmatn Variable', Vazirmatn, sans-serif",
    });
  });

  it('renders translated tabs and labels in Arabic', () => {
    mockLocale('ar');
    renderWithRouter(<CustomerLoginPage />);
    expect(screen.getByTestId('signin-tab-login')).toHaveTextContent('تسجيل الدخول');
    expect(screen.getByTestId('signin-tab-signup')).toHaveTextContent('إنشاء حساب');
    expect(screen.getByTestId('signin-agency-link')).toHaveTextContent('دخول الوكالة الشريكة');
  });
});

describe('AboutPage', () => {
  it('renders mission, vision, and values', () => {
    renderWithRouter(<AboutPage />);
    expect(screen.getByText('سفر را ساده، مطمئن و در دسترس می‌کنیم')).toBeInTheDocument();
    expect(screen.getByText('مأموریت ما')).toBeInTheDocument();
    expect(screen.getByText('چشم‌انداز')).toBeInTheDocument();
    expect(screen.getByText('شفافیت')).toBeInTheDocument();
    expect(screen.getByText('مسافر سالانه')).toBeInTheDocument();
  });

  it('renders translated mission, vision, and values in English', () => {
    mockLocale('en');
    renderWithRouter(<AboutPage />);
    expect(screen.getByText('Making air travel simple, reliable, and accessible')).toBeInTheDocument();
    expect(screen.getByText('Our Mission')).toBeInTheDocument();
    expect(screen.getByText('Our Vision')).toBeInTheDocument();
    expect(screen.getByText('Transparency')).toBeInTheDocument();
    expect(screen.getByText('Passengers per year')).toBeInTheDocument();
  });

  it('renders translated mission, vision, and values in Arabic', () => {
    mockLocale('ar');
    renderWithRouter(<AboutPage />);
    expect(screen.getByText('نجعل السفر الجوي بسيطًا وموثوقًا ومتاحًا')).toBeInTheDocument();
    expect(screen.getByText('مهمتنا')).toBeInTheDocument();
    expect(screen.getByText('الرؤية')).toBeInTheDocument();
    expect(screen.getByText('الشفافية')).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  it('renders the designed 404 with home and search links', () => {
    renderWithRouter(<NotFoundPage />);
    expect(screen.getByText('صفحه‌ای که دنبالش بودید پیدا نشد')).toBeInTheDocument();
    expect(screen.getByText('بازگشت به صفحهٔ اصلی')).toHaveAttribute('href', '/');
    expect(screen.getByText('جستجوی پرواز')).toHaveAttribute('href', '/');
  });
});
