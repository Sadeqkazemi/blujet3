import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reservationApi from '../../api/reservation';
import type { FlightRow } from '../../types/flights';
import type { SeatMap } from '../../types/reservation';
import MdSeatMapModal from './MdSeatMapModal';

const FLIGHT: FlightRow = {
  id: 'fi-md80',
  flightNo: 'EP-821',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-20T08:30:00.000Z',
  capacity: 140,
  charterSeats: 0,
  sold: 0,
  basePriceIrr: '38000000',
  derivedStatus: 'ACTIVE',
};

const MAP: SeatMap = {
  flightInstanceId: FLIGHT.id,
  aircraftType: 'MD-80',
  flightNo: FLIGHT.flightNo,
  originCode: FLIGHT.originCode,
  destCode: FLIGHT.destCode,
  departureAt: FLIGHT.departureAt,
  rows: [
    {
      row: 3,
      cabin: 'BUSINESS',
      seats: [
        { seatCode: '3A', status: 'FREE', lockId: null, occupant: null },
        { seatCode: '3B', status: 'FREE', lockId: null, occupant: null },
      ],
    },
  ],
  cabinLayout: { BUSINESS: { aisleAfterIndex: 2 } },
  capacity: 140,
  soldCount: 0,
  lockedCount: 0,
  freeCount: 140,
  occupancyPct: 0,
};

function setupApi() {
  vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue(MAP);
  vi.spyOn(reservationApi, 'fetchSeatLockAgencies').mockResolvedValue([
    { id: 'agency-1', name: 'آژانس سپهر', licenseNo: 'LIC-1' },
  ]);
  vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue([]);
  vi.spyOn(reservationApi, 'lockSeat').mockResolvedValue({
    id: 'lock-1',
    flightInstanceId: FLIGHT.id,
    seatCode: '3A',
    lockedById: 'commercial-1',
    passengerName: null,
    releasedById: null,
    releasedAt: null,
    createdAt: '2026-08-13T00:00:00.000Z',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('MdSeatMapModal managerial locking', () => {
  it('loads real agencies and submits an agency-targeted seat lock', async () => {
    setupApi();
    const user = userEvent.setup();
    render(
      <MdSeatMapModal
        canManageOverride
        flight={FLIGHT}
        onClose={vi.fn()}
        onNotice={vi.fn()}
        onError={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await screen.findByTestId('reservation-md80-seat-map');
    await user.click(screen.getByRole('button', { name: '3A' }));
    await user.click(screen.getByRole('button', { name: 'قفل برای آژانس' }));
    await user.selectOptions(screen.getByRole('combobox'), 'agency-1');
    await user.click(
      screen.getByRole('button', { name: 'ثبت درخواست قفل صندلی' }),
    );

    await waitFor(() =>
      expect(reservationApi.lockSeat).toHaveBeenCalledWith(
        FLIGHT.id,
        expect.objectContaining({
          seatCode: '3A',
          agencyId: 'agency-1',
          classification: 'PAYABLE',
        }),
      ),
    );
  });

  it('supports an anonymous passenger hold without creating a ticket', async () => {
    setupApi();
    const user = userEvent.setup();
    render(
      <MdSeatMapModal
        canManageOverride
        flight={FLIGHT}
        onClose={vi.fn()}
        onNotice={vi.fn()}
        onError={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await screen.findByTestId('reservation-md80-seat-map');
    await user.click(screen.getByRole('button', { name: '3B' }));
    await user.click(
      screen.getByRole('checkbox', { name: /لاک بدون نام مسافر/ }),
    );
    await user.click(
      screen.getByRole('button', { name: 'ثبت درخواست قفل صندلی' }),
    );

    await waitFor(() =>
      expect(reservationApi.lockSeat).toHaveBeenCalledWith(
        FLIGHT.id,
        expect.objectContaining({ seatCode: '3B', agencyId: undefined }),
      ),
    );
  });

  it('keeps IT/read-only viewers from opening managerial lock controls', async () => {
    setupApi();
    const user = userEvent.setup();
    render(
      <MdSeatMapModal
        canManageOverride={false}
        flight={FLIGHT}
        onClose={vi.fn()}
        onNotice={vi.fn()}
        onError={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    await screen.findByTestId('reservation-md80-seat-map');
    await user.click(screen.getByRole('button', { name: '3A' }));
    expect(screen.queryByRole('dialog', { name: /لاک دستی صندلی/ })).not.toBeInTheDocument();
    expect(reservationApi.fetchSeatLockAgencies).not.toHaveBeenCalled();
  });
});
