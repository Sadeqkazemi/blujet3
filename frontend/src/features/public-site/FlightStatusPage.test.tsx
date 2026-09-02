import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightStatusPage from './FlightStatusPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as publicSiteApi from '../../api/publicSite';
import * as flightStatusApi from '../../api/flight-status';
import * as useLocaleModule from '../../hooks/useLocale';
import { ApiRequestError } from '../../api/envelope';
import type { Airport } from '../../types/public-site';
import type { FlightStatusResult } from '../../types/flight-status';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

const AIRPORTS: Airport[] = [
  { id: 'a1', code: 'THR', cityFa: 'تهران' } as Airport,
  { id: 'a2', code: 'MHD', cityFa: 'مشهد' } as Airport,
];

const RESULT: FlightStatusResult = {
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-410',
  aircraftType: 'Airbus A320',
  originCode: 'THR',
  originCityFa: 'تهران',
  destCode: 'MHD',
  destCityFa: 'مشهد',
  departureAt: '2026-08-15T14:50:00.000Z',
  arrivalAt: '2026-08-15T16:15:00.000Z',
  status: 'SCHEDULED',
  statusLabelFa: 'برنامه‌ریزی‌شده',
};

beforeEach(() => {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <FlightStatusPage />
    </MemoryRouter>,
  );
}

describe('FlightStatusPage', () => {
  it('aligns flight-status form controls to the approved field dimensions', async () => {
    renderPage();

    expect(screen.getByTestId('fs-flightno')).toHaveStyle({
      height: '56px',
      borderRadius: '12px',
      background: '#fafbfd',
      direction: 'ltr',
      textAlign: 'right',
    });
    expect(screen.getByTestId('fs-date-control')).toHaveStyle({
      height: '56px',
      borderRadius: '12px',
      background: '#fafbfd',
    });

    await userEvent.click(screen.getByTestId('fs-mode-route'));
    expect(screen.getByTestId('fs-origin')).toHaveStyle({ height: '56px' });
    expect(screen.getByTestId('fs-dest')).toHaveStyle({ height: '56px' });
    expect(screen.getByTestId('fs-search')).toHaveStyle({ height: '56px' });
  });

  it('looks up a real flight by flight number and shows the real result', async () => {
    const lookup = vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockResolvedValue(RESULT);
    renderPage();

    await userEvent.type(screen.getByTestId('fs-flightno'), 'bj-410');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByTestId('fs-result')).toBeInTheDocument();
    expect(screen.getByTestId('fs-status-pill')).toHaveTextContent('برنامه‌ریزی‌شده');
    expect(screen.getByText('تهران')).toBeInTheDocument();
    expect(screen.getByText('مشهد')).toBeInTheDocument();
    expect(screen.getByText('Airbus A320')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ flightNo: 'bj-410' }),
    );
  });

  it('shows not-found for a real 404 response', async () => {
    vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockRejectedValue(
      new ApiRequestError('NOT_FOUND', 'پروازی یافت نشد.', 404),
    );
    renderPage();

    await userEvent.type(screen.getByTestId('fs-flightno'), 'ZZ-999');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByTestId('fs-not-found')).toBeInTheDocument();
  });

  it('shows the real error message on a non-404 failure', async () => {
    vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockRejectedValue(
      new ApiRequestError('VALIDATION_FAILED', 'شماره پرواز یا مبدأ و مقصد لازم است.', 400),
    );
    renderPage();

    await userEvent.type(screen.getByTestId('fs-flightno'), 'BJ-410');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByText('شماره پرواز یا مبدأ و مقصد لازم است.')).toBeInTheDocument();
  });

  it('switches to route mode and searches by origin/dest airport codes', async () => {
    const lookup = vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockResolvedValue(RESULT);
    renderPage();

    await userEvent.click(screen.getByTestId('fs-mode-route'));
    expect(screen.getByTestId('fs-search')).toBeDisabled();

    await userEvent.selectOptions(screen.getByTestId('fs-origin'), 'THR');
    await userEvent.selectOptions(screen.getByTestId('fs-dest'), 'MHD');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByTestId('fs-result')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'THR', dest: 'MHD' }),
    );
  });

  it('disables the delay-SMS toggle as not-yet-built', async () => {
    vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockResolvedValue(RESULT);
    renderPage();

    await userEvent.type(screen.getByTestId('fs-flightno'), 'BJ-410');
    await userEvent.click(screen.getByTestId('fs-search'));
    await screen.findByTestId('fs-result');

    expect(screen.getByTestId('fs-sms-toggle')).toBeDisabled();
  });

  it('renders translated heading, labels, and a translated status pill in English', async () => {
    mockLocale('en');
    vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockResolvedValue(RESULT);
    renderPage();

    expect(screen.getByRole('heading', { name: 'Flight Status' })).toBeInTheDocument();
    expect(screen.getByTestId('fs-mode-flightNo')).toHaveTextContent('Flight number');

    await userEvent.type(screen.getByTestId('fs-flightno'), 'BJ-410');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByTestId('fs-result')).toBeInTheDocument();
    expect(screen.getByTestId('fs-status-pill')).toHaveTextContent('Scheduled');
    expect(screen.getByText('Aircraft')).toBeInTheDocument();
    expect(screen.getByText('Manage booking')).toBeInTheDocument();
  });

  it('renders translated heading and not-found message in Arabic', async () => {
    mockLocale('ar');
    vi.spyOn(flightStatusApi, 'lookupFlightStatus').mockRejectedValue(
      new ApiRequestError('NOT_FOUND', 'لم يتم العثور على الرحلة', 404),
    );
    renderPage();

    expect(screen.getByRole('heading', { name: 'حالة الرحلة' })).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('fs-flightno'), 'ZZ-999');
    await userEvent.click(screen.getByTestId('fs-search'));

    expect(await screen.findByTestId('fs-not-found')).toBeInTheDocument();
    expect(screen.getByText('لم يتم العثور على الرحلة')).toBeInTheDocument();
  });
});
