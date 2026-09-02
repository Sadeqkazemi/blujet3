import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyTicketPage from './AgencyTicketPage';
import * as publicApi from '../../api/publicSite';

vi.mock('../../components/JalaliDatePicker', () => ({
  default: ({ onChange, testId }: { onChange: (value: string) => void; testId: string }) => (
    <button type="button" data-testid={testId} onClick={() => onChange('2026-09-10T00:00:00.000Z')}>date</button>
  ),
}));

function ResultsLocation() {
  const location = useLocation();
  return <div data-testid="results-location">{location.pathname}{location.search}</div>;
}

afterEach(() => vi.restoreAllMocks());

describe('AgencyTicketPage', () => {
  it('uses the public airport catalog and opens the public flight results with the selected search', async () => {
    vi.spyOn(publicApi, 'fetchAirports').mockResolvedValue([
      { code: 'THR', nameFa: 'مهرآباد', cityFa: 'تهران', countryFa: 'ایران', active: true },
      { code: 'MHD', nameFa: 'شهید هاشمی‌نژاد', cityFa: 'مشهد', countryFa: 'ایران', active: true },
    ]);
    vi.spyOn(publicApi, 'fetchSearchCabins').mockResolvedValue(['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST']);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/agency/tickets']}>
        <Routes>
          <Route path="/agency/tickets" element={<AgencyTicketPage />} />
          <Route path="/results" element={<ResultsLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.selectOptions(await screen.findByTestId('agency-ticket-origin'), 'THR');
    await user.selectOptions(screen.getByTestId('agency-ticket-destination'), 'MHD');
    expect(screen.getByTestId('agency-ticket-route-fields')).toContainElement(screen.getByTestId('agency-ticket-swap'));
    expect(screen.getByTestId('agency-ticket-route-fields')).not.toContainElement(screen.getByTestId('agency-ticket-date'));
    await user.click(screen.getByTestId('agency-ticket-date'));
    await user.click(screen.getByTestId('agency-ticket-passengers'));
    await user.click(screen.getByTestId('agency-ticket-pax-adults-inc'));
    await user.click(screen.getByTestId('agency-ticket-pax-children-inc'));
    await user.click(screen.getByTestId('agency-ticket-pax-confirm'));
    await user.selectOptions(screen.getByTestId('agency-ticket-cabin'), 'COMFORT');
    await user.click(screen.getByTestId('agency-ticket-search'));

    const location = await screen.findByTestId('results-location');
    expect(location).toHaveTextContent('/results?origin=THR&dest=MHD&date=2026-09-10&adults=2&children=1&infants=0&cabin=COMFORT');
  });

  it('does not navigate until origin, destination, and date are complete', async () => {
    vi.spyOn(publicApi, 'fetchAirports').mockResolvedValue([]);
    vi.spyOn(publicApi, 'fetchSearchCabins').mockResolvedValue(['ECONOMY']);
    const user = userEvent.setup();
    render(<MemoryRouter><AgencyTicketPage /></MemoryRouter>);

    await user.click(screen.getByTestId('agency-ticket-search'));
    expect(screen.getByRole('alert')).toHaveTextContent('مبدا، مقصد و تاریخ رفت را کامل کنید.');
  });

  it('scopes domestic and international airport choices to the approved catalogs', async () => {
    vi.spyOn(publicApi, 'fetchAirports').mockResolvedValue([
      { code: 'THR', cityFa: 'تهران', airportNameFa: 'مهرآباد', tz: 'Asia/Tehran', isInternational: false },
      { code: 'IKA', cityFa: 'تهران', airportNameFa: 'فرودگاه بین‌المللی امام خمینی', tz: 'Asia/Tehran', isInternational: false },
      { code: 'DXB', cityFa: 'دبی', airportNameFa: 'Dubai International', tz: 'Asia/Dubai', isInternational: true },
    ]);
    vi.spyOn(publicApi, 'fetchSearchCabins').mockResolvedValue(['ECONOMY']);
    const user = userEvent.setup();
    render(<MemoryRouter><AgencyTicketPage /></MemoryRouter>);

    const origin = await screen.findByTestId('agency-ticket-origin');
    expect(within(origin).getByRole('option', { name: /\(THR\)/ })).toBeInTheDocument();
    expect(within(origin).queryByRole('option', { name: /\(DXB\)/ })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('agency-ticket-service-intl'));
    expect(within(origin).getByRole('option', { name: /\(DXB\)/ })).toBeInTheDocument();
    expect(within(origin).getByRole('option', { name: /\(IKA\)/ })).toBeInTheDocument();
    expect(within(origin).queryByRole('option', { name: /\(THR\)/ })).not.toBeInTheDocument();
  });
});
