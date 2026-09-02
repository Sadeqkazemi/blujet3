import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import CheckoutPage from './CheckoutPage';
import * as publicSiteApi from '../../api/publicSite';
import * as travelCostsApi from '../../api/travel-costs';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import type { BookingDetail, SeatMapResult } from '../../types/public-site';
import { mockAuthUser } from '../../test/mockAuthUser';

const BOOKING: BookingDetail = {
  id: 'b1',
  pnr: 'BJABC123',
  status: 'HELD',
  cabin: 'ECONOMY',
  priceIrr: '380000000',
  holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T05:00:00.000Z',
  arrivalAt: '2026-08-01T06:30:00.000Z',
  isPriceLocked: false,
  passengers: [{ fullName: 'ALI REZAEI', seatCode: '7A' }],
};

const SEATMAP: SeatMapResult = {
  flightInstanceId: 'fi-1',
  seats: [
    { seatCode: '7A', row: 7, cabin: 'ECONOMY', status: 'FREE' },
    { seatCode: '7B', row: 7, cabin: 'ECONOMY', status: 'FREE' },
    { seatCode: '7E', row: 7, cabin: 'ECONOMY', status: 'TAKEN' },
  ],
};

const FLIGHT_STATE = {
  cabin: 'ECONOMY' as const,
  flight: {
    flightInstanceId: 'fi-1',
    flightNo: 'BJ-100',
    originCode: 'THR',
    destCode: 'MHD',
    departureAt: '2026-08-01T05:00:00.000Z',
    arrivalAt: '2026-08-01T06:30:00.000Z',
    aircraftType: 'A320',
    priceIrr: '380000000',
  },
};

const BAGGAGE_ID = '11111111-1111-4111-8111-111111111111';

function mockAuth(status: 'authenticated' | 'unauthenticated' = 'authenticated') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status,
    user: status === 'authenticated' ? mockAuthUser() : null,
    requestOtp: vi.fn().mockResolvedValue('challenge-1'),
    verifyOtp: vi.fn().mockResolvedValue(mockAuthUser()),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({
      locale: 'fa',
      setLocale: vi.fn(),
    });
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
    vi.spyOn(publicSiteApi, 'fetchSavedPassengers').mockResolvedValue([
      {
        id: 'saved-1',
        fullName: 'سارا احمدی',
        latinName: 'SARA AHMADI',
        gender: 'female',
        birthDate: '1994-08-20',
        nationalId: '0499370899',
        passportNo: null,
        mobile: null,
        isChild: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({
      isMember: true,
      level: 'GOLD',
      balance: 20_000,
    });
    vi.spyOn(publicSiteApi, 'fetchSeatMap').mockResolvedValue(SEATMAP);
    vi.spyOn(travelCostsApi, 'fetchPublicTravelCosts').mockResolvedValue([
      {
        id: BAGGAGE_ID,
        code: 'EXTRA_BAGGAGE',
        titleFa: 'بار اضافه',
        titleEn: 'Extra baggage',
        titleAr: null,
        descriptionFa: 'به ازای هر کیلوگرم',
        billingUnit: 'PER_KG',
        priceIrr: '4500000',
        purchaseEnabled: true,
        sortOrder: 0,
      },
    ]);
  });

  it('renders the passenger wizard step for /checkout/new', async () => {
    mockAuth();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-pax-step')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-flight-summary')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-route-label')).toHaveTextContent('تهران به مشهد');
    expect(screen.getByTestId('checkout-pricing-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-step-pax')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-from-saved-0')).toHaveTextContent('از مسافران ذخیره‌شده');
  });

  it('shows the approved add/remove passenger controls in checkout', async () => {
    mockAuth();
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const add = await screen.findByTestId('checkout-add-pax');
    expect(add).toHaveTextContent('مسافر جدید');
    await user.click(add);

    expect(screen.getByTestId('checkout-pax-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-remove-pax-0')).toHaveTextContent('حذف');
    expect(screen.getByTestId('checkout-remove-pax-1')).toHaveTextContent('حذف');
    expect(screen.getByTestId('checkout-pricing-sidebar')).toHaveTextContent(
      'قیمت بلیط (بزرگسال × ۲)',
    );

    await user.click(screen.getByTestId('checkout-remove-pax-1'));
    expect(screen.queryByTestId('checkout-pax-card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-pricing-sidebar')).toHaveTextContent(
      'قیمت بلیط (بزرگسال × ۱)',
    );
  });

  it('shows the actual adult, child, and infant mix in the pricing sidebar', async () => {
    mockAuth();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search:
              '?flightInstanceId=fi-1&cabin=ECONOMY&adults=2&children=1&infants=1',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-pricing-sidebar')).toHaveTextContent(
      'قیمت بلیط (بزرگسال × ۲، کودک × ۱، نوزاد × ۱)',
    );
  });

  it('opens saved-passenger chips from the passenger step', async () => {
    mockAuth();
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('checkout-from-saved-0');
    await user.click(screen.getByTestId('checkout-from-saved-0'));
    expect(await screen.findByTestId('checkout-saved-panel-0')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-saved-chip-saved-1')).toHaveTextContent('سارا احمدی');
  });

  it('keeps checkout confirmation disabled for guests and opens OTP from the dedicated sign-in action', async () => {
    mockAuth('unauthenticated');
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-pax-step')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-login-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-from-saved-0')).toBeDisabled();
    expect(screen.getByTestId('checkout-next')).toBeDisabled();
    expect(screen.getByTestId('checkout-sign-in-required')).toBeInTheDocument();

    await user.type(screen.getByTestId('checkout-pax-first-0'), 'ALI');
    await user.type(screen.getByTestId('checkout-pax-last-0'), 'REZAEI');
    await user.selectOptions(screen.getByTestId('checkout-pax-gender-0'), 'male');
    await user.type(screen.getByTestId('checkout-pax-nid-0'), '0012345679');
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1]!, '1');
    await user.selectOptions(selects[2]!, '1');
    await user.selectOptions(selects[3]!, '1370');

    expect(screen.getByTestId('checkout-next')).toBeDisabled();
    await user.click(screen.getByTestId('checkout-sign-in-required'));
    expect(await screen.findByTestId('checkout-login-modal')).toBeInTheDocument();
    expect(screen.getByTestId('otp-phone')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-step')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-first-0')).toHaveValue('ALI');
    expect(screen.getByTestId('checkout-pax-last-0')).toHaveValue('REZAEI');

    await user.click(screen.getByTestId('checkout-login-close'));
    expect(screen.queryByTestId('checkout-login-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-step')).toBeInTheDocument();
  });

  it('defers passenger field errors until confirm is pressed', async () => {
    mockAuth('unauthenticated');
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('checkout-pax-step');
    expect(screen.getByTestId('checkout-next')).toBeDisabled();
    await user.type(screen.getByTestId('checkout-pax-first-0'), 'A');

    expect(screen.queryByTestId('checkout-login-modal')).not.toBeInTheDocument();
    expect(screen.queryByText('نام خانوادگی را وارد کنید.')).not.toBeInTheDocument();
    expect(screen.queryByText('کد ملی را وارد کنید.')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-last-0')).toHaveAttribute('aria-invalid', 'false');

    await user.click(screen.getByTestId('checkout-sign-in-required'));

    expect(screen.getByText('نام خانوادگی را وارد کنید.')).toBeInTheDocument();
    expect(screen.getByText('کد ملی را وارد کنید.')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-last-0')).toHaveAttribute('aria-invalid', 'true');
  });

  it('checks the national-id checksum only after confirm and marks only that filled invalid field', async () => {
    mockAuth();
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('checkout-pax-step');
    await user.type(screen.getByTestId('checkout-pax-first-0'), 'ALI');
    await user.type(screen.getByTestId('checkout-pax-last-0'), 'REZAEI');
    await user.selectOptions(screen.getByTestId('checkout-pax-gender-0'), 'male');
    await user.type(screen.getByTestId('checkout-pax-nid-0'), '0012345678');
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1]!, '1');
    await user.selectOptions(selects[2]!, '1');
    await user.selectOptions(selects[3]!, '1370');

    expect(screen.queryByText('کد ملی اشتباه وارد شده است.')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-nid-0')).toHaveAttribute('aria-invalid', 'false');
    await user.click(screen.getByTestId('checkout-next'));

    expect(screen.getByText('کد ملی اشتباه وارد شده است.')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pax-nid-0')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('checkout-pax-first-0')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByTestId('checkout-pax-last-0')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByTestId('checkout-pax-gender-0')).toHaveAttribute('aria-invalid', 'false');
  });

  it('mobile layout shows flight route + passenger form above pricing', async () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    mockAuth();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY&origin=THR&dest=MHD',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-mobile-main')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-mobile-titlebar')).toHaveTextContent('تکمیل خرید');
    expect(screen.getByTestId('checkout-route-label')).toHaveTextContent('تهران به مشهد');
    expect(screen.getByTestId('checkout-pax-step')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pricing-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-next')).toHaveTextContent('تأیید و ادامه');
    expect(screen.getByTestId('checkout-mobile-sticky')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-mobile-sticky')).toHaveClass('sticky');
    expect(screen.getByTestId('checkout-mobile-sticky')).not.toHaveClass('fixed');
    expect(screen.getByTestId('checkout-next-mobile')).toHaveTextContent('تأیید و ادامه');
    expect(screen.getByTestId('checkout-pax-name-grid-0')).toHaveStyle({
      gridTemplateColumns: '1fr',
    });
    expect(screen.getByTestId('checkout-pax-doc-grid-0')).toHaveStyle({
      gridTemplateColumns: '1fr',
    });
  });

  it('mobile extras and review steps use single-column service/review grids', async () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    mockAuth();
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY&origin=THR&dest=MHD',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-pax-step')).toBeInTheDocument();
    await user.type(screen.getByTestId('checkout-pax-first-0'), 'ALI');
    await user.type(screen.getByTestId('checkout-pax-last-0'), 'REZAEI');
    await user.selectOptions(screen.getByTestId('checkout-pax-gender-0'), 'male');
    await user.type(screen.getByTestId('checkout-pax-nid-0'), '0012345679');
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1]!, '1');
    await user.selectOptions(selects[2]!, '1');
    await user.selectOptions(selects[3]!, '1370');

    await user.click(screen.getByTestId('checkout-next-mobile'));
    expect(await screen.findByTestId('checkout-extras-step')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-extras-grid')).toHaveStyle({
      gridTemplateColumns: '1fr',
    });

    await user.click(screen.getByTestId('checkout-next-mobile'));
    expect(await screen.findByTestId('checkout-review-step')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-review-extras-grid')).toHaveStyle({
      gridTemplateColumns: '1fr',
    });
    expect(screen.getByTestId('checkout-edit-pax-from-review')).toBeInTheDocument();
  });

  it('keeps origin/destination from sessionStorage after auth remount', async () => {
    sessionStorage.setItem(
      'blujet_checkout_draft',
      JSON.stringify({
        flightInstanceId: 'fi-1',
        cabin: 'ECONOMY',
        selectedSeats: [],
        flight: FLIGHT_STATE.flight,
      }),
    );
    mockAuth();
    render(
      <MemoryRouter initialEntries={['/checkout/new?flightInstanceId=fi-1&cabin=ECONOMY&origin=THR&dest=MHD']}>
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-route-label')).toHaveTextContent('تهران به مشهد');
  });

  it('advances pax → extras → review and creates a booking', async () => {
    mockAuth();
    const createBooking = vi.spyOn(publicSiteApi, 'createBooking').mockResolvedValue(BOOKING);

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/checkout/new',
            search: '?flightInstanceId=fi-1&cabin=ECONOMY',
            state: FLIGHT_STATE,
          },
        ]}
      >
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
          <Route path="/payment/:bookingId" element={<div data-testid="payment-page">payment</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('checkout-pax-step');
    await userEvent.type(screen.getByTestId('checkout-pax-first-0'), 'ALI');
    await userEvent.type(screen.getByTestId('checkout-pax-last-0'), 'REZAEI');
    await userEvent.selectOptions(screen.getByTestId('checkout-pax-gender-0'), 'male');
    await userEvent.type(screen.getByTestId('checkout-pax-nid-0'), '0012345679');
    await userEvent.click(screen.getByTestId('checkout-extra-seat-0'));
    expect(screen.getByTestId('checkout-pricing-sidebar')).toHaveTextContent(
      'صندلی اضافه کنار مسافر',
    );

    // DOB selects — first select in each group is day/month/year
    const selects = screen.getAllByRole('combobox');
    // gender is first; then day, month, year
    await userEvent.selectOptions(selects[1]!, '1');
    await userEvent.selectOptions(selects[2]!, '1');
    await userEvent.selectOptions(selects[3]!, '1370');

    await userEvent.click(screen.getByTestId('checkout-next'));
    expect(await screen.findByTestId('checkout-extras-step')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('checkout-seat-toggle'));
    await userEvent.click(await screen.findByTestId('checkout-seat-7A'));
    await userEvent.click(screen.getByTestId(`checkout-extra-${BAGGAGE_ID}-toggle`));
    await userEvent.click(screen.getByTestId('checkout-next'));

    expect(await screen.findByTestId('checkout-review-step')).toBeInTheDocument();
    expect(screen.getByText('ALI REZAEI')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('checkout-next'));
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        flightInstanceId: 'fi-1',
        cabin: 'ECONOMY',
        passengers: [
          expect.objectContaining({
            fullName: 'ALI REZAEI',
            nationalId: '0012345679',
            gender: 'male',
            seatCode: '7A',
            extraSeatRequested: true,
          }),
        ],
        extras: [{ id: BAGGAGE_ID, quantity: 1 }],
      }),
    );
    expect(await screen.findByTestId('payment-page')).toBeInTheDocument();
  });

  it('shows held-booking summary with continue-to-payment for existing ids', async () => {
    mockAuth();
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue(BOOKING);
    render(
      <MemoryRouter initialEntries={['/checkout/b1']}>
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
          <Route path="/payment/:bookingId" element={<div data-testid="payment-page">payment</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('continue-to-payment')).toBeInTheDocument();
    expect(screen.getByText('ALI REZAEI')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('continue-to-payment'));
    expect(await screen.findByTestId('payment-page')).toBeInTheDocument();
  });

  it('shows an expired-hold state without a continue button', async () => {
    mockAuth();
    vi.spyOn(publicSiteApi, 'fetchMyBooking').mockResolvedValue({
      ...BOOKING,
      status: 'EXPIRED',
    });
    render(
      <MemoryRouter initialEntries={['/checkout/b1']}>
        <Routes>
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('مهلت نگهداری این رزرو به پایان رسیده است.')).toBeInTheDocument();
    expect(screen.queryByTestId('continue-to-payment')).not.toBeInTheDocument();
  });
});
