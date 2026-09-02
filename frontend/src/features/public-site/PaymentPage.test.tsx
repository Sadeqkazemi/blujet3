import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaymentPage from './PaymentPage';
import * as publicSiteApi from '../../api/publicSite';
import * as useAuthModule from '../../hooks/useAuth';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import * as useLocaleModule from '../../hooks/useLocale';
import type { BookingDetail } from '../../types/public-site';

const BOOKING: BookingDetail = {
  id: 'b1',
  pnr: 'BJABC123',
  status: 'HELD',
  cabin: 'ECONOMY',
  priceIrr: '380000000',
  taxIrr: '17000000',
  holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T05:00:00.000Z',
  arrivalAt: '2026-08-01T06:30:00.000Z',
  isPriceLocked: false,
  passengers: [{ fullName: 'علی رضایی', seatCode: '2A' }],
};

function renderPage() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={['/payment/b1']}>
      <Routes>
        <Route path="/payment/:bookingId" element={<PaymentPage />} />
        <Route path="/ticket/:pnr" element={<div data-testid="ticket-page">ticket</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaymentPage', () => {
  it('renders payment methods and hold timer', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    renderPage();

    expect(await screen.findByTestId('pay-submit')).toBeInTheDocument();
    expect(screen.getByTestId('hold-timer')).toBeInTheDocument();
    expect(screen.getByTestId('payment-method-GATEWAY')).toBeInTheDocument();
    expect(screen.getByTestId('payment-tax-amount')).toHaveTextContent('۱٬۷۰۰٬۰۰۰');
    expect(screen.getByTestId('payment-ticket-amount')).toHaveTextContent('۳۶٬۳۰۰٬۰۰۰');
  });

  it('renders only the persisted selected extra with its English title and separates it from fare', async () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'en', setLocale: vi.fn() });
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue({
      ...BOOKING,
      extrasIrr: '20000000',
      extras: [{
        id: 'bag', code: 'EXTRA_BAGGAGE', titleFa: 'بار اضافه',
        titleEn: 'Extra baggage', titleAr: 'أمتعة إضافية',
        billingUnit: 'PER_BOOKING', unitPriceIrr: '20000000', quantity: 1,
        totalIrr: '20000000',
      }],
    });
    renderPage();

    expect(await screen.findByText('Extra baggage')).toBeInTheDocument();
    expect(screen.queryByText('بار اضافه')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-ticket-amount')).toHaveTextContent('34,300,000');
  });

  it('pays successfully and navigates to the ticket page', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    const payBooking = vi.spyOn(publicSiteApi, 'payBooking').mockResolvedValue({
      priceChanged: false,
      booking: { ...BOOKING, status: 'TICKETED' },
    });
    renderPage();
    await screen.findByTestId('pay-submit');

    await userEvent.click(screen.getByTestId('pay-submit'));
    expect(payBooking).toHaveBeenCalledWith('b1', {
      confirmedPriceIrr: undefined,
      promoCode: undefined,
      paymentMethod: 'GATEWAY',
    });
    expect(await screen.findByTestId('ticket-page')).toBeInTheDocument();
  });

  it('sends the entered promo code and selected payment method', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '1000000000' });
    const payBooking = vi.spyOn(publicSiteApi, 'payBooking').mockResolvedValue({
      priceChanged: false,
      booking: { ...BOOKING, status: 'TICKETED' },
    });
    renderPage();
    await screen.findByTestId('pay-submit');

    await userEvent.type(screen.getByTestId('promo-code-input'), 'BLUE20');
    await userEvent.click(screen.getByTestId('payment-method-WALLET'));
    await userEvent.click(screen.getByTestId('pay-submit'));

    expect(payBooking).toHaveBeenCalledWith('b1', {
      confirmedPriceIrr: undefined,
      promoCode: 'BLUE20',
      paymentMethod: 'WALLET',
    });
  });

  it('disables the pay-with-points option for a non-club-member', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({
      isMember: false,
      level: null,
      balance: 0,
    });
    renderPage();
    await screen.findByTestId('pay-submit');

    expect(screen.getByTestId('payment-method-POINTS')).toBeDisabled();
  });

  it('shows the re-price confirmation UI when the price changed', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    vi.spyOn(publicSiteApi, 'payBooking').mockResolvedValueOnce({
      priceChanged: true,
      previousPriceIrr: '380000000',
      currentPriceIrr: '400000000',
    });
    renderPage();
    await screen.findByTestId('pay-submit');

    await userEvent.click(screen.getByTestId('pay-submit'));
    expect(await screen.findByTestId('confirm-new-price')).toBeInTheDocument();
    expect(screen.getByText('قیمت این پرواز تغییر کرده است.')).toBeInTheDocument();
  });

  it('shows an expired-hold state without a pay button', async () => {
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue({ ...BOOKING, status: 'EXPIRED' });
    renderPage();

    expect(await screen.findByText('مهلت نگهداری این رزرو به پایان رسیده است.')).toBeInTheDocument();
    expect(screen.queryByTestId('pay-submit')).not.toBeInTheDocument();
  });

  it('shows pay button inside pricing aside on mobile without a sticky footer', async () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    renderPage();

    expect(await screen.findByTestId('pay-submit')).toBeInTheDocument();
    expect(screen.getByTestId('payment-pricing-aside')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-mobile-sticky')).not.toBeInTheDocument();
  });
});
