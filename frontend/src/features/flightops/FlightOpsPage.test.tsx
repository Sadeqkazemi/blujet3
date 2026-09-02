import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FlightOpsPage from './FlightOpsPage';
import * as flightopsApi from '../../api/flightops';
import type { FlightopsDetail, FlightopsList } from '../../types/flightops';

const LIST: FlightopsList = {
  kpis: { total: 2, open: 1, closed: 1, soldTotal: 5 },
  rows: [
    {
      id: 'fi-1',
      flightNo: 'EP-821',
      originCode: 'THR',
      destCode: 'DXB',
      departureAt: '2026-08-01T02:45:00.000Z',
      capacity: 180,
      sold: 3,
      free: 177,
      closed: true,
      niraSubmittedAt: '2026-07-31T21:45:00.000Z',
    },
    {
      id: 'fi-2',
      flightNo: 'W5-112',
      originCode: 'MHD',
      destCode: 'THR',
      departureAt: '2026-08-03T05:00:00.000Z',
      capacity: 150,
      sold: 2,
      free: 148,
      closed: false,
      niraSubmittedAt: null,
    },
  ],
};

const DETAIL: FlightopsDetail = {
  ...LIST.rows[0],
  occupancyPct: 2,
  manifest: [
    { fullName: 'علی رضایی', nationalId: '0012345678', seatCode: '12A', pnr: 'ABC123' },
  ],
};

describe('FlightOpsPage', () => {
  it('renders KPI cards and the flight list with real status/نیرا pills', async () => {
    vi.spyOn(flightopsApi, 'fetchFlightops').mockResolvedValue(LIST);
    render(<FlightOpsPage />);

    expect(await screen.findByText('EP-821')).toBeInTheDocument();
    expect(screen.getByText('W5-112')).toBeInTheDocument();
    expect(screen.getAllByText('بسته‌شده')).toHaveLength(1);
    expect(screen.getAllByText('باز')).toHaveLength(1);
    expect(screen.getByText('بارگذاری در نیرا')).toBeInTheDocument();
    expect(screen.getByText('در انتظار بسته‌شدن')).toBeInTheDocument();
    expect(screen.getByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByText('مشهد ← تهران')).toBeInTheDocument();
  });

  it("opens a flight's detail view with stat boxes, نیرا status, and the passenger manifest", async () => {
    vi.spyOn(flightopsApi, 'fetchFlightops').mockResolvedValue(LIST);
    const detailSpy = vi.spyOn(flightopsApi, 'fetchFlightopsDetail').mockResolvedValue(DETAIL);
    render(<FlightOpsPage />);

    await screen.findByText('EP-821');
    await userEvent.click(screen.getByTestId('fo-row-fi-1'));

    expect(detailSpy).toHaveBeenCalledWith('fi-1');
    expect(await screen.findByTestId('fo-detail')).toBeInTheDocument();
    expect(screen.getByTestId('fo-nira-done')).toBeInTheDocument();
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();

    expect(screen.getByTestId('fo-back')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('fo-back'));
    expect(await screen.findByText('W5-112')).toBeInTheDocument();
  });

  it('shows the نیرا-pending banner for an open flight detail', async () => {
    vi.spyOn(flightopsApi, 'fetchFlightops').mockResolvedValue(LIST);
    vi.spyOn(flightopsApi, 'fetchFlightopsDetail').mockResolvedValue({
      ...LIST.rows[1],
      occupancyPct: 1,
      manifest: [],
    });
    render(<FlightOpsPage />);

    await screen.findByText('W5-112');
    await userEvent.click(screen.getByTestId('fo-row-fi-2'));

    expect(await screen.findByTestId('fo-nira-pending')).toBeInTheDocument();
    expect(screen.getByText('مسافری برای این پرواز ثبت نشده است.')).toBeInTheDocument();
  });

  it('offers a manual نیرا retry when automatic submission failed after closing sales', async () => {
    const closedWithoutNira: FlightopsList = {
      ...LIST,
      rows: [{ ...LIST.rows[0], niraSubmittedAt: null }],
      kpis: { ...LIST.kpis, total: 1, open: 0, closed: 1 },
    };
    vi.spyOn(flightopsApi, 'fetchFlightops').mockResolvedValue(closedWithoutNira);
    vi.spyOn(flightopsApi, 'fetchFlightopsDetail').mockResolvedValue({
      ...closedWithoutNira.rows[0],
      occupancyPct: 2,
      manifest: [],
    });
    const submitSpy = vi.spyOn(flightopsApi, 'submitFlightopsToNira').mockResolvedValue({
      id: 'fi-1',
      niraSubmittedAt: '2026-07-31T21:45:00.000Z',
    });

    render(<FlightOpsPage />);
    await screen.findByText('EP-821');
    await userEvent.click(screen.getByTestId('fo-row-fi-1'));

    expect(await screen.findByTestId('fo-nira-submit')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('fo-nira-submit'));
    expect(submitSpy).toHaveBeenCalledWith('fi-1');
  });

  it('paginates the flight list at 10 rows per page', async () => {
    const many: FlightopsList = {
      kpis: { total: 12, open: 12, closed: 0, soldTotal: 0 },
      rows: Array.from({ length: 12 }, (_, i) => ({
        id: `fi-${i + 1}`,
        flightNo: `EP-${800 + i}`,
        originCode: 'THR',
        destCode: 'DXB',
        departureAt: '2026-08-10T05:00:00.000Z',
        capacity: 180,
        sold: i,
        free: 180 - i,
        closed: false,
        niraSubmittedAt: null,
      })),
    };
    vi.spyOn(flightopsApi, 'fetchFlightops').mockResolvedValue(many);
    render(<FlightOpsPage />);

    expect(await screen.findByText('EP-800')).toBeInTheDocument();
    expect(screen.getByText('EP-809')).toBeInTheDocument();
    expect(screen.queryByText('EP-810')).not.toBeInTheDocument();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(await screen.findByText('EP-810')).toBeInTheDocument();
    expect(screen.queryByText('EP-800')).not.toBeInTheDocument();
  });
});
