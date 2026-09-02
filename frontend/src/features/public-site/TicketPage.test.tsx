import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TicketPage from './TicketPage';
import * as publicSiteApi from '../../api/publicSite';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import type { BookingDetail } from '../../types/public-site';

const TICKETED: BookingDetail = {
  id: 'b1',
  pnr: 'BJABC123',
  status: 'TICKETED',
  cabin: 'ECONOMY',
  priceIrr: '380000000',
  holdExpiresAt: null,
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T05:00:00.000Z',
  arrivalAt: '2026-08-01T06:30:00.000Z',
  isPriceLocked: false,
  passengers: [
    {
      id: 'p1',
      fullName: 'علی رضایی',
      seatCode: '2A',
      ticketNo: '7800000000001',
      ticketIssuedAt: '2026-08-01T04:58:00.000Z',
    },
  ],
};

function renderPage(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
  return render(
    <MemoryRouter initialEntries={['/ticket/BJABC123']}>
      <Routes>
        <Route path="/ticket/:pnr" element={<TicketPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TicketPage', () => {
  it('renders the e-ticket with PNR and passenger/seat', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue(TICKETED);
    renderPage();

    expect(await screen.findByText('BJABC123')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-barcode')).toBeInTheDocument();
    expect(screen.getByText('7800000000001')).toBeInTheDocument();
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.queryByTestId('open-refund-form')).not.toBeInTheDocument();
  });

  it('prints the immutable purchased fare class on the ticket', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue({
      ...TICKETED,
      cabin: 'ECONOMY',
      fareClassCode: 'Y',
    } as BookingDetail);

    renderPage();
    expect(await screen.findByText('Y')).toBeInTheDocument();
    expect(screen.getByText('اکونومی')).toBeInTheDocument();
  });

  it('renders English strings when locale is en', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue(TICKETED);
    renderPage('en');

    expect(await screen.findByText('E-ticket')).toBeInTheDocument();
    expect(screen.queryByText('Request ticket refund')).not.toBeInTheDocument();
  });

  it('keeps route direction origin→destination per locale', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue(TICKETED);
    const view = renderPage('fa');
    expect(await screen.findByTestId('ticket-route')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('ticket-origin')).toHaveClass('order-3');
    expect(screen.getByTestId('ticket-destination')).toHaveClass('order-1');
    expect(screen.getByTestId('ticket-route-airplane')).toHaveAttribute('data-direction', 'left');

    view.unmount();
    vi.restoreAllMocks();
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue(TICKETED);
    renderPage('en');
    expect(await screen.findAllByTestId('ticket-route')).toHaveLength(1);
    expect(screen.getByTestId('ticket-route')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('ticket-origin')).toHaveClass('order-1');
    expect(screen.getByTestId('ticket-destination')).toHaveClass('order-3');
    expect(screen.getByTestId('ticket-route-airplane')).toHaveAttribute('data-direction', 'right');
  });

  it('uses the Persian route placement for Arabic tickets', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue(TICKETED);
    renderPage('ar');

    expect(await screen.findByTestId('ticket-route')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('ticket-origin')).toHaveClass('order-3');
    expect(screen.getByTestId('ticket-destination')).toHaveClass('order-1');
  });

  it('renders one complete persisted e-ticket for every passenger', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue({
      ...TICKETED,
      passengers: [
        TICKETED.passengers[0],
        {
          ...TICKETED.passengers[0],
          id: 'p2',
          fullName: 'مریم رضایی',
          seatCode: '2B',
          ticketNo: '7800000000002',
        },
      ],
    });
    renderPage();

    expect(await screen.findAllByTestId('passenger-ticket')).toHaveLength(2);
    expect(screen.getByText('7800000000001')).toBeInTheDocument();
    expect(screen.getByText('7800000000002')).toBeInTheDocument();
    expect(screen.getAllByTestId('ticket-barcode')).toHaveLength(2);
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('مریم رضایی')).toBeInTheDocument();
  });

  it('blocks the boarding-pass view for unpaid HELD bookings', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue({
      ...TICKETED,
      status: 'HELD',
      holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    renderPage();

    expect(await screen.findByTestId('ticket-unpaid-block')).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-barcode')).not.toBeInTheDocument();
  });

  it('shows expiry message when the 15-minute hold has elapsed', async () => {
    vi.spyOn(publicSiteApi, 'fetchBookingByPnr').mockResolvedValue({
      ...TICKETED,
      status: 'EXPIRED',
      holdExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    renderPage();

    expect(await screen.findByText('مهلت پرداخت به پایان رسید')).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-barcode')).not.toBeInTheDocument();
  });
});
