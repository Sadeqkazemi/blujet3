import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DestinationsPage from './DestinationsPage';
import PublicClubPage from './PublicClubPage';
import SupportPage from './SupportPage';
import TravelInfoPage from './TravelInfoPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as supportTicketsApi from '../../api/support-tickets';
import * as siteContentApi from '../../api/site-content';
import * as settingsApi from '../../api/settings';
import * as useIsMobileModule from '../../hooks/useIsMobile';

const REAL_HOME_CONTENT = {
  blocks: [],
  destinations: [
    { airportCode: 'KIH', cityFa: 'کیش', priceIrr: '14800000', imageUrl: null },
    { airportCode: 'MHD', cityFa: 'مشهد', priceIrr: '9800000', imageUrl: null },
    { airportCode: 'IST', cityFa: 'استانبول', priceIrr: '68000000', imageUrl: null },
    { airportCode: 'DXB', cityFa: 'دبی', priceIrr: '52000000', imageUrl: null },
  ],
  routes: [
    {
      fromAirportCode: 'THR',
      toAirportCode: 'KIH',
      fromCityFa: 'تهران',
      toCityFa: 'کیش',
      priceIrr: '14800000',
    },
  ],
};

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(
    REAL_HOME_CONTENT,
  );
  vi.spyOn(settingsApi, 'fetchPublicSupportContact').mockResolvedValue({
    phone: '021-44694471',
    email: 'info@blujet.com',
  });
  vi.spyOn(settingsApi, 'fetchPublicSiteRules').mockResolvedValue({ categories: [] });
});

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('DestinationsPage', () => {
  it('renders destination and price rows returned by the CMS API', async () => {
    renderWithRouter(<DestinationsPage />);
    expect(screen.getByText('مقصد بعدی شما کجاست؟')).toBeInTheDocument();
    expect(await screen.findByTestId('dest-card-KIH')).toBeInTheDocument();
    expect(await screen.findByTestId('dest-card-IST')).toBeInTheDocument();
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
    expect(screen.getByText('مسیرهای پرتردد')).toBeInTheDocument();
  });

  it('filters by region tab', async () => {
    renderWithRouter(<DestinationsPage />);
    await userEvent.click(screen.getByText('پروازهای خارجی'));
    expect(screen.getByText('مقاصد بین‌المللی')).toBeInTheDocument();
    expect(screen.queryByTestId('dest-card-MHD')).not.toBeInTheDocument();
    expect(await screen.findByTestId('dest-card-DXB')).toBeInTheDocument();
  });

  it('shows the empty state for an unmatched search', async () => {
    renderWithRouter(<DestinationsPage />);
    await userEvent.type(screen.getByPlaceholderText(/نام شهر یا کد فرودگاه/), 'XYZ123');
    expect(screen.getByText('مقصدی با این مشخصات پیدا نشد')).toBeInTheDocument();
  });

  it('links destination cards to the real results page', async () => {
    renderWithRouter(<DestinationsPage />);
    const card = await screen.findByTestId('dest-card-KIH');
    expect(card).toHaveAttribute('href', expect.stringContaining('/results?origin=THR&dest=KIH'));
  });

  it('renders translated catalog with Latin-digit toman prices in English', async () => {
    mockLocale('en');
    renderWithRouter(<DestinationsPage />);
    expect(screen.getByText("Where's your next destination?")).toBeInTheDocument();
    expect((await screen.findAllByText('Kish')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Istanbul').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Toman/).length).toBeGreaterThan(0);
    expect(screen.getByText('Popular routes')).toBeInTheDocument();
    expect(screen.getAllByText(/1,480,000/).length).toBeGreaterThan(0);
    expect(await screen.findByTestId('popular-route-plane')).toHaveStyle({ transform: 'none' });
  });

  it('renders translated catalog with Eastern Arabic-Indic digits in Arabic', async () => {
    mockLocale('ar');
    renderWithRouter(<DestinationsPage />);
    expect(screen.getByText('ما هي وجهتك القادمة؟')).toBeInTheDocument();
    expect((await screen.findAllByText('كيش')).length).toBeGreaterThan(0);
    expect(screen.getByText('المسارات الأكثر طلبًا')).toBeInTheDocument();
    expect(screen.getAllByText(/١٬٤٨٠٬٠٠٠/).length).toBeGreaterThan(0);
    expect(await screen.findByTestId('popular-route-plane')).toHaveStyle({ transform: 'scaleX(-1)' });
  });

  it('points popular-route planes right-to-left in Persian', async () => {
    mockLocale('fa');
    renderWithRouter(<DestinationsPage />);

    expect(await screen.findByTestId('popular-route-plane')).toHaveStyle({ transform: 'scaleX(-1)' });
  });
});

describe('PublicClubPage', () => {
  it('renders tiers, stats, and card issuance steps', () => {
    renderWithRouter(<PublicClubPage />);
    expect(screen.getByText('هر پرواز، یک قدم به مزایای بیشتر')).toBeInTheDocument();
    expect(screen.getAllByText('نقره‌ای').length).toBeGreaterThan(0);
    expect(screen.getAllByText('طلایی').length).toBeGreaterThan(0);
    expect(screen.getAllByText('پلاتین').length).toBeGreaterThan(0);
    expect(screen.getByText('با رسیدن به حد امتیاز، کارت بگیرید')).toBeInTheDocument();
    expect(screen.getByText('کش‌بک در هر خرید')).toBeInTheDocument();
  });

  it('points the join button at the customer sign-in page when logged out', () => {
    renderWithRouter(<PublicClubPage />);
    expect(screen.getByText('عضویت رایگان')).toHaveAttribute('href', '/signin');
  });

  it('renders translated tiers and CTA in English', () => {
    mockLocale('en');
    renderWithRouter(<PublicClubPage />);
    expect(screen.getByText('Every flight, one step closer to more rewards')).toBeInTheDocument();
    expect(screen.getAllByText('Silver').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gold').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Platinum').length).toBeGreaterThan(0);
    expect(screen.getByText('Reach the point threshold, get your card')).toBeInTheDocument();
    expect(screen.getByText('Join for Free')).toHaveAttribute('href', '/signin');
  });

  it('renders translated tiers in Arabic', () => {
    mockLocale('ar');
    renderWithRouter(<PublicClubPage />);
    expect(screen.getByText('كل رحلة خطوة أقرب لمزايا أكبر')).toBeInTheDocument();
    expect(screen.getAllByText('فضي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ذهبي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('بلاتيني').length).toBeGreaterThan(0);
    expect(screen.getByText('عند بلوغ حد النقاط، احصل على بطاقتك')).toBeInTheDocument();
  });
});

describe('SupportPage', () => {
  it('keeps the mobile support hero and search layout readable without horizontal overflow', () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    mockLocale('en');
    renderWithRouter(<SupportPage />);
    expect(screen.getByTestId('support-hero')).toHaveStyle({ minHeight: '440px' });
    expect(screen.getByRole('button', { name: 'Search' })).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('support-search-card')).toHaveStyle({
      width: '100%',
      flexDirection: 'column',
      boxSizing: 'border-box',
    });
    expect(screen.getByTestId('support-category-grid')).toBeInTheDocument();
  });

  it('renders the configured phone with Latin digits in English', async () => {
    mockLocale('en');
    vi.spyOn(settingsApi, 'fetchPublicSupportContact').mockResolvedValue({
      phone: '۰۲۱-۴۴۶۹۴۴۷۱',
      email: 'info@blujet.com',
    });

    renderWithRouter(<SupportPage />);

    expect(await screen.findByText('021-44694471')).toBeInTheDocument();
    expect(screen.queryByText('۰۲۱-۴۴۶۹۴۴۷۱')).not.toBeInTheDocument();
  });

  it('renders FAQ accordion and toggles answers', async () => {
    renderWithRouter(<SupportPage />);
    expect(screen.getByText('چطور می‌توانیم کمک کنیم؟')).toBeInTheDocument();
    expect(await screen.findByText('021-44694471')).toBeInTheDocument();
    expect(screen.getAllByText('info@blujet.com').length).toBeGreaterThan(0);
    expect(screen.getByText(/از بخش «مدیریت رزرو» با وارد کردن کد رزرو/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('میزان بار مجاز هر بلیط چقدر است؟'));
    expect(screen.getByText(/در نرخ اکونومی ۲۰ کیلوگرم/)).toBeInTheDocument();
  });

  it('submits the real ticket form and shows the real tracking code', async () => {
    const submit = vi.spyOn(supportTicketsApi, 'submitSupportTicket').mockResolvedValue({
      id: 't1',
      trackingCode: 'TK1A2B3C4D',
    });
    renderWithRouter(<SupportPage />);
    const submitBtn = screen.getByTestId('ticket-submit');
    expect(submitBtn).toBeDisabled();

    await userEvent.type(screen.getByTestId('ticket-name'), 'نگار رضایی');
    await userEvent.type(screen.getByTestId('ticket-phone'), '09121234567');
    await userEvent.type(screen.getByTestId('ticket-msg'), 'مشکل در پرداخت دارم');
    await userEvent.click(submitBtn);

    expect(await screen.findByText('تیکت شما ثبت شد')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-tracking-code')).toHaveTextContent('TK1A2B3C4D');
    expect(submit).toHaveBeenCalledWith({
      requesterName: 'نگار رضایی',
      requesterPhone: '09121234567',
      subject: 'استرداد و تغییر بلیط',
      body: 'مشکل در پرداخت دارم',
    });
  });

  it('renders translated FAQ and category cards in English, and submits the canonical Persian subject regardless of locale', async () => {
    mockLocale('en');
    const submit = vi.spyOn(supportTicketsApi, 'submitSupportTicket').mockResolvedValue({
      id: 't2',
      trackingCode: 'TK-EN-1',
    });
    renderWithRouter(<SupportPage />);
    expect(screen.getByText('How can we help?')).toBeInTheDocument();
    expect(screen.getByText('Booking & Purchase')).toBeInTheDocument();
    await userEvent.click(screen.getByText('What is the baggage allowance per ticket?'));
    expect(screen.getByText(/20kg free baggage is included in Economy fares/)).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('ticket-name'), 'Negar Rezaei');
    await userEvent.type(screen.getByTestId('ticket-phone'), '09121234567');
    await userEvent.type(screen.getByTestId('ticket-msg'), 'Payment issue');
    await userEvent.click(screen.getByTestId('ticket-submit'));

    expect(await screen.findByText('Your ticket has been submitted')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'استرداد و تغییر بلیط' }),
    );
  });

  it('renders translated FAQ and category cards in Arabic', () => {
    mockLocale('ar');
    renderWithRouter(<SupportPage />);
    expect(screen.getByText('كيف يمكننا المساعدة؟')).toBeInTheDocument();
    expect(screen.getByText('حجز وشراء التذكرة')).toBeInTheDocument();
    expect(screen.getByText('اتصال مباشر')).toBeInTheDocument();
  });
});

describe('TravelInfoPage', () => {
  it('renders all six rule sections with a TOC', () => {
    renderWithRouter(<TravelInfoPage />);
    expect(screen.getAllByText('قوانین و مقررات').length).toBeGreaterThan(0);
    expect(screen.getAllByText('خرید و صدور بلیط').length).toBe(2);
    expect(screen.getAllByText('استرداد و کنسلی').length).toBe(2);
    expect(screen.getAllByText('حریم خصوصی و امنیت').length).toBe(2);
    expect(screen.getByText(/بار مجاز رایگان در نرخ اکونومی ۲۰/)).toBeInTheDocument();
  });

  it('renders translated sections in English', () => {
    mockLocale('en');
    renderWithRouter(<TravelInfoPage />);
    expect(screen.getAllByText('Terms & Conditions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Purchase & Ticket Issuance').length).toBe(2);
    expect(screen.getAllByText('Refunds & Cancellation').length).toBe(2);
    expect(screen.getAllByText('Privacy & Security').length).toBe(2);
    expect(screen.getByText(/The free baggage allowance is 20kg in Economy/)).toBeInTheDocument();
  });

  it('renders translated sections in Arabic', () => {
    mockLocale('ar');
    renderWithRouter(<TravelInfoPage />);
    expect(screen.getAllByText('الشروط والأحكام').length).toBeGreaterThan(0);
    expect(screen.getAllByText('الشراء وإصدار التذكرة').length).toBe(2);
    expect(screen.getByText(/الأمتعة المجانية المسموح بها ٢٠ كجم/)).toBeInTheDocument();
  });

  it('renders published Persian rules from the site-admin API', async () => {
    vi.mocked(settingsApi.fetchPublicSiteRules).mockResolvedValue({
      categories: [
        { id: 'pets', title: 'قوانین تازه حیوانات', text: 'خط اول\nخط دوم' },
      ],
    });
    renderWithRouter(<TravelInfoPage />);
    expect((await screen.findAllByText('قوانین تازه حیوانات')).length).toBe(2);
    expect(screen.getByText('خط دوم')).toBeInTheDocument();
  });
});
