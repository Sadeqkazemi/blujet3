import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AircraftListPage from './AircraftListPage';
import AircraftDetailPage from './AircraftDetailPage';
import AircraftFormPage from './AircraftFormPage';
import * as aircraftApi from '../../api/aircraft';
import type { AircraftDefinition, AircraftDefinitionListItem } from '../../types/aircraft';

const LIST: AircraftDefinitionListItem[] = [
  {
    id: 'ac1',
    code: 'MD-80',
    model: 'MD-80',
    title: 'مک‌دانل داگلاس MD-80',
    status: 'ACTIVE',
    totalCapacity: 140,
    version: 1,
    cabins: [
      { cabinType: 'ECONOMY', capacity: 120 },
      { cabinType: 'BUSINESS', capacity: 20 },
    ],
  },
  {
    id: 'ac2',
    code: 'A320',
    model: 'Airbus A320',
    title: 'ایرباس A320',
    status: 'INACTIVE',
    totalCapacity: 180,
    version: 2,
    cabins: [
      { cabinType: 'ECONOMY', capacity: 150 },
      { cabinType: 'BUSINESS', capacity: 30 },
    ],
  },
];

function seat(
  row: number,
  column: string,
  cabinType: 'BUSINESS' | 'ECONOMY',
  side: 'LEFT' | 'RIGHT',
) {
  return {
    row,
    column,
    label: `${row}${column}`,
    cabinType,
    side,
    isBlocked: false as const,
  };
}

/** Compact map: business 1×3 + economy 1×6 = 9 seats (matches totalCapacity). */
const DETAIL_SEATS = [
  seat(1, 'A', 'BUSINESS', 'LEFT'),
  seat(1, 'C', 'BUSINESS', 'RIGHT'),
  seat(1, 'D', 'BUSINESS', 'RIGHT'),
  seat(3, 'A', 'ECONOMY', 'LEFT'),
  seat(3, 'B', 'ECONOMY', 'LEFT'),
  seat(3, 'C', 'ECONOMY', 'LEFT'),
  seat(3, 'D', 'ECONOMY', 'RIGHT'),
  seat(3, 'E', 'ECONOMY', 'RIGHT'),
  seat(3, 'F', 'ECONOMY', 'RIGHT'),
];

const DETAIL: AircraftDefinition = {
  id: 'ac2',
  code: 'A320',
  model: 'Airbus A320',
  title: 'ایرباس A320',
  status: 'INACTIVE',
  totalCapacity: 9,
  version: 2,
  cabins: [
    { cabinType: 'ECONOMY', capacity: 6 },
    { cabinType: 'BUSINESS', capacity: 3 },
  ],
  seats: DETAIL_SEATS,
  seatMap: {
    aircraftDefinitionId: 'ac2',
    cabinLayout: {
      BUSINESS: {
        colsLeft: ['A'],
        colsRight: ['C', 'D'],
        aisleAfterIndex: 1,
      },
      ECONOMY: {
        colsLeft: ['A', 'B', 'C'],
        colsRight: ['D', 'E', 'F'],
        aisleAfterIndex: 3,
      },
    },
    excludedSeatCodes: [],
    seats: DETAIL_SEATS,
  },
};

describe('AircraftListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading then list rows from API', async () => {
    vi.spyOn(aircraftApi, 'fetchAircraftDefinitions').mockResolvedValue(LIST);

    render(
      <MemoryRouter>
        <AircraftListPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('aircraft-list-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('aircraft-card-grid')).toBeInTheDocument();
    });

    expect(screen.getByText('مک‌دانل داگلاس MD-80')).toBeInTheDocument();
    expect(screen.getByText('ایرباس A320')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-kpi-total')).toHaveTextContent('۲');
    expect(screen.getAllByTestId('aircraft-card')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '+ تعریف هواپیمای جدید' })).toHaveAttribute(
      'href',
      '/panel/aircraft/new',
    );
  });

  it('shows error when list API fails', async () => {
    vi.spyOn(aircraftApi, 'fetchAircraftDefinitions').mockRejectedValue(
      new Error('سرویس در دسترس نیست'),
    );

    render(
      <MemoryRouter>
        <AircraftListPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('aircraft-list-error')).toHaveTextContent('سرویس در دسترس نیست');
    });
  });

  it('shows empty state when API returns no rows', async () => {
    vi.spyOn(aircraftApi, 'fetchAircraftDefinitions').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AircraftListPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('aircraft-list-empty')).toHaveTextContent('اطلاعاتی یافت نشد');
    });
  });
});

describe('AircraftDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders aircraft detail', async () => {
    vi.spyOn(aircraftApi, 'fetchAircraftDefinition').mockResolvedValue(DETAIL);

    render(
      <MemoryRouter initialEntries={['/panel/aircraft/ac2']}>
        <Routes>
          <Route path="/panel/aircraft/:id" element={<AircraftDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ایرباس A320' })).toBeInTheDocument();
    });

    expect(screen.getByText('غیرفعال')).toBeInTheDocument();
    expect(screen.getByTestId('seat-map-editor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ویرایش' })).toHaveAttribute(
      'href',
      '/panel/aircraft/ac2/edit',
    );
  });

  it('shows MD-80 locked message instead of seat map editor', async () => {
    vi.spyOn(aircraftApi, 'fetchAircraftDefinition').mockResolvedValue({
      ...DETAIL,
      id: 'ac1',
      code: 'MD-80',
      model: 'MD-80',
      title: 'مک‌دانل داگلاس MD-80',
      seatMap: { ...DETAIL.seatMap, seats: [] },
      seats: [],
    });

    render(
      <MemoryRouter initialEntries={['/panel/aircraft/ac1']}>
        <Routes>
          <Route path="/panel/aircraft/:id" element={<AircraftDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('md80-locked-message')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('seat-map-editor')).not.toBeInTheDocument();
  });
});

describe('AircraftFormPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the MD-80 seat map editable so commercial can define its cabins', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/panel/aircraft/new']}>
        <Routes>
          <Route path="/panel/aircraft/new" element={<AircraftFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId('aircraft-code'), 'MD-80');
    await user.type(screen.getByTestId('aircraft-name'), 'MD-80');

    expect(screen.queryByTestId('md80-locked-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('seat-map-editor')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-cabin-capacity-FIRST')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-cabin-capacity-BUSINESS')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-cabin-capacity-COMFORT')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-cabin-capacity-ECONOMY')).toBeInTheDocument();
    expect(screen.getByTestId('aircraft-cabin-class-FIRST')).toHaveValue('F');
    expect(screen.getByTestId('aircraft-cabin-class-BUSINESS')).toHaveValue('C');
    expect(screen.getByTestId('aircraft-cabin-class-COMFORT')).toHaveValue('W');
    expect(screen.getByTestId('aircraft-cabin-class-ECONOMY')).toHaveValue('Y');
  });

  it('validates cabin seat sum before submit', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(aircraftApi, 'createAircraftDefinition');

    render(
      <MemoryRouter initialEntries={['/panel/aircraft/new']}>
        <Routes>
          <Route path="/panel/aircraft/new" element={<AircraftFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId('aircraft-name'), 'بوئینگ ۷۳۷');
    await user.type(screen.getByTestId('aircraft-code'), 'B737');
    await user.type(screen.getByTestId('aircraft-model'), 'Boeing 737');
    await user.clear(screen.getByTestId('aircraft-total-seats'));
    await user.type(screen.getByTestId('aircraft-total-seats'), '100');

    await user.click(screen.getByTestId('aircraft-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('aircraft-form-error')).toHaveTextContent('مجموع صندلی');
    });

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('loads edit form and submits update', async () => {
    const user = userEvent.setup();
    vi.spyOn(aircraftApi, 'fetchAircraftDefinition').mockResolvedValue(DETAIL);
    const updateSpy = vi.spyOn(aircraftApi, 'updateAircraftDefinition').mockResolvedValue({
      ...DETAIL,
      title: 'ایرباس A320neo',
    });

    render(
      <MemoryRouter initialEntries={['/panel/aircraft/ac2/edit']}>
        <Routes>
          <Route path="/panel/aircraft/:id/edit" element={<AircraftFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('ایرباس A320')).toBeInTheDocument();
    });

    expect(screen.getByTestId('aircraft-cabin-capacity-BUSINESS')).toHaveValue('3');
    expect(screen.getByTestId('aircraft-cabin-capacity-ECONOMY')).toHaveValue('6');
    expect(screen.getByTestId('aircraft-cabin-capacity-FIRST')).toHaveValue('');

    await user.clear(screen.getByTestId('aircraft-name'));
    await user.type(screen.getByTestId('aircraft-name'), 'ایرباس A320neo');
    await user.click(screen.getByTestId('aircraft-form-submit'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });
    expect(updateSpy.mock.calls[0]?.[1]).toMatchObject({
      cabinCapacities: [
        { cabinType: 'BUSINESS', capacity: 3, defaultClassCode: 'C' },
        { cabinType: 'ECONOMY', capacity: 6, defaultClassCode: 'Y' },
      ],
    });
  });
});
