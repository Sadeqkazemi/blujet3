import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ManageBookingPage from './ManageBookingPage';
import * as publicSiteApi from '../../api/publicSite';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import { ApiRequestError } from '../../api/envelope';
import type { BookingDetail, RefundRequestView } from '../../types/public-site';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const BOOKING: BookingDetail = {
  id: 'b1',
  pnr: 'BJ4X2K',
  status: 'TICKETED',
  cabin: 'ECONOMY',
  priceIrr: '160000000',
  holdExpiresAt: null,
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-102',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T04:00:00.000Z',
  arrivalAt: '2026-08-01T05:25:00.000Z',
  isPriceLocked: false,
  passengers: [
    { fullName: 'نگار رضایی', seatCode: '12A' },
    { fullName: 'آرش رضایی', seatCode: '12B' },
  ],
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
    <MemoryRouter>
      <ManageBookingPage />
    </MemoryRouter>,
  );
}

describe('ManageBookingPage', () => {
  it('looks up a real booking by PNR + last name and shows it', async () => {
    const lookup = vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockResolvedValue(BOOKING);
    renderPage();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'bj4x2k');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'رضایی');
    await userEvent.click(screen.getByTestId('mb-lookup'));

    expect(await screen.findByTestId('mb-pnr-show')).toHaveTextContent('BJ4X2K');
    expect(screen.getByText('نگار رضایی')).toBeInTheDocument();
    expect(screen.getByText('آرش رضایی')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith('bj4x2k', 'رضایی');
  });

  it('shows the real error message on a lookup failure (wrong PNR/last name)', async () => {
    vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockRejectedValue(
      new ApiRequestError('NOT_FOUND', 'رزرو یافت نشد.', 404),
    );
    renderPage();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'ZZZZZZ');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'ناشناس');
    await userEvent.click(screen.getByTestId('mb-lookup'));

    expect(await screen.findByTestId('mb-lookup-error')).toHaveTextContent('رزرو یافت نشد.');
  });

  it('submits a real anonymous refund and shows the real computed penalty breakdown', async () => {
    vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockResolvedValue(BOOKING);
    const submit = vi.spyOn(publicSiteApi, 'submitAnonymousRefund').mockResolvedValue({
      id: 'r1',
      trackingCode: 'RF-A1B2C3D4',
      bookingId: 'b1',
      pnr: 'BJ4X2K',
      flightNo: 'BJ-100',
      originCode: 'THR',
      destCode: 'MHD',
      departureAt: BOOKING.departureAt,
      status: 'SUBMITTED',
      penaltyPct: 30,
      penaltyAmountIrr: '4800000',
      refundableIrr: '11200000',
      totalPaidIrr: '16000000',
      history: [{ step: 'submitted', labelFa: 'ثبت درخواست', at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      paidAt: null,
    } satisfies RefundRequestView);
    renderPage();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'BJ4X2K');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'رضایی');
    await userEvent.click(screen.getByTestId('mb-lookup'));
    await screen.findByTestId('mb-pnr-show');

    await userEvent.click(screen.getByTestId('mb-open-refund'));
    await userEvent.type(screen.getByTestId('mb-iban'), 'IR820170000000332211009900');
    await userEvent.click(screen.getByTestId('mb-refund-confirm'));

    expect(await screen.findByText('درخواست استرداد ثبت شد')).toBeInTheDocument();
    expect(screen.getByTestId('mb-refundable-result')).toHaveTextContent('۱٬۱۲۰٬۰۰۰');
    expect(submit).toHaveBeenCalledWith('BJ4X2K', 'رضایی', 'IR820170000000332211009900');
  });

  it('keeps change seat disabled but enables download ticket for ticketed bookings', async () => {
    vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockResolvedValue(BOOKING);
    renderPage();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'BJ4X2K');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'رضایی');
    await userEvent.click(screen.getByTestId('mb-lookup'));
    await screen.findByTestId('mb-pnr-show');

    expect(screen.getByRole('button', { name: /تغییر صندلی/ })).toBeDisabled();
    expect(screen.getByTestId('mb-download-ticket')).toBeEnabled();
  });

  it('renders translated heading, labels, and result in English', async () => {
    mockLocale('en');
    vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockResolvedValue(BOOKING);
    const submit = vi.spyOn(publicSiteApi, 'submitAnonymousRefund').mockResolvedValue({
      id: 'r1',
      trackingCode: 'RF-A1B2C3D4',
      bookingId: 'b1',
      pnr: 'BJ4X2K',
      flightNo: 'BJ-100',
      originCode: 'THR',
      destCode: 'MHD',
      departureAt: BOOKING.departureAt,
      status: 'SUBMITTED',
      penaltyPct: 30,
      penaltyAmountIrr: '4800000',
      refundableIrr: '11200000',
      totalPaidIrr: '16000000',
      history: [{ step: 'submitted', labelFa: 'Submitted', at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      paidAt: null,
    } satisfies RefundRequestView);
    renderPage();

    expect(screen.getByRole('heading', { name: 'Manage Your Booking' })).toBeInTheDocument();
    expect(screen.getByText('Booking code')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'BJ4X2K');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'رضایی');
    await userEvent.click(screen.getByTestId('mb-lookup'));
    await screen.findByTestId('mb-pnr-show');

    expect(screen.getByText('Economy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refund Ticket/ })).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('mb-open-refund'));
    await userEvent.type(screen.getByTestId('mb-iban'), 'IR820170000000332211009900');
    await userEvent.click(screen.getByTestId('mb-refund-confirm'));

    expect(await screen.findByText('Refund request submitted')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith('BJ4X2K', 'رضایی', 'IR820170000000332211009900');
  });

  it('renders translated heading and lookup-error message in Arabic', async () => {
    mockLocale('ar');
    vi.spyOn(publicSiteApi, 'lookupBookingByPnrAndLastName').mockRejectedValue(
      new ApiRequestError('NOT_FOUND', 'لم يتم العثور على الحجز.', 404),
    );
    renderPage();

    expect(screen.getByRole('heading', { name: 'إدارة الحجز' })).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('mb-pnr'), 'ZZZZZZ');
    await userEvent.type(screen.getByTestId('mb-lastname'), 'ناشناس');
    await userEvent.click(screen.getByTestId('mb-lookup'));

    expect(await screen.findByTestId('mb-lookup-error')).toHaveTextContent('لم يتم العثور على الحجز.');
  });
});
