import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeatMapCell } from '../../../types/public-site';
import ExtrasStep from './ExtrasStep';
import type { ExtraServiceState } from './checkout-types';
import * as settingsApi from '../../../api/settings';

beforeEach(() => {
  vi.spyOn(settingsApi, 'fetchPublicSiteRules').mockResolvedValue({
    categories: [
      { id: 'pets', title: 'قوانین حیوان خانگی', text: 'قوانین تست حیوان' },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function testExtras(): ExtraServiceState[] {
  return [
    {
      id: 'extra-baggage',
      code: 'EXTRA_BAGGAGE',
      titleFa: 'بار اضافه',
      titleEn: 'Extra baggage',
      titleAr: null,
      descriptionFa: 'به ازای هر کیلوگرم',
      descriptionEn: 'Per kilogram',
      descriptionAr: 'لكل كيلوغرام',
      billingUnit: 'PER_KG',
      priceIrr: '4500000',
      selected: false,
      quantity: 1,
    },
    {
      id: 'extra-cip',
      code: 'CIP',
      titleFa: 'خدمات CIP',
      titleEn: 'CIP',
      titleAr: null,
      descriptionFa: null,
      descriptionEn: null,
      descriptionAr: null,
      billingUnit: 'PER_BOOKING',
      priceIrr: '9000000',
      selected: false,
      quantity: 1,
    },
    {
      id: 'extra-insurance',
      code: 'TRAVEL_INSURANCE',
      titleFa: 'بیمه مسافرتی',
      titleEn: 'Insurance',
      titleAr: null,
      descriptionFa: null,
      descriptionEn: null,
      descriptionAr: null,
      billingUnit: 'PER_PASSENGER',
      priceIrr: '1200000',
      selected: false,
      quantity: 1,
    },
    {
      id: 'extra-seat',
      code: 'SEAT_SELECTION',
      titleFa: 'انتخاب صندلی',
      titleEn: 'Seat selection',
      titleAr: null,
      descriptionFa: 'انتخاب صندلی پیش از پرواز',
      descriptionEn: 'Choose a seat before the flight',
      descriptionAr: 'اختر مقعداً قبل الرحلة',
      billingUnit: 'PER_PASSENGER',
      priceIrr: '1500000',
      selected: false,
      quantity: 1,
    },
    {
      id: 'extra-pet',
      code: 'PET',
      titleFa: 'حمل حیوان خانگی',
      titleEn: 'Pet travel',
      titleAr: null,
      descriptionFa: 'حمل حیوان با قفس مناسب',
      descriptionEn: 'Pet transport in an approved carrier',
      descriptionAr: 'نقل الحيوان في حاملة معتمدة',
      billingUnit: 'PER_BOOKING',
      priceIrr: '2500000',
      selected: false,
      quantity: 1,
    },
  ];
}

const SEATS: SeatMapCell[] = [
  { seatCode: '3A', row: 3, cabin: 'BUSINESS', status: 'FREE' },
  { seatCode: '3B', row: 3, cabin: 'BUSINESS', status: 'FREE' },
  { seatCode: '3E', row: 3, cabin: 'BUSINESS', status: 'TAKEN' },
  { seatCode: '3F', row: 3, cabin: 'BUSINESS', status: 'FREE' },
  { seatCode: '7A', row: 7, cabin: 'ECONOMY', status: 'FREE' },
  { seatCode: '7B', row: 7, cabin: 'ECONOMY', status: 'FREE' },
  { seatCode: '7D', row: 7, cabin: 'ECONOMY', status: 'FREE' },
  { seatCode: '7E', row: 7, cabin: 'ECONOMY', status: 'TAKEN' },
  { seatCode: '7F', row: 7, cabin: 'ECONOMY', status: 'FREE' },
  { seatCode: '12D', row: 12, cabin: 'ECONOMY', status: 'FREE' },
  { seatCode: '12E', row: 12, cabin: 'ECONOMY', status: 'TAKEN' },
];

describe('ExtrasStep — design parity', () => {
  it('renders English service copy without falling back to Persian', () => {
    render(
      <ExtrasStep
        locale="en"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={0}
      />,
    );

    expect(screen.getByText('Extra baggage')).toBeInTheDocument();
    expect(screen.getByText('Per kilogram')).toBeInTheDocument();
    expect(screen.queryByText('بار اضافه')).not.toBeInTheDocument();
    expect(screen.queryByText('به ازای هر کیلوگرم')).not.toBeInTheDocument();
  });

  it('renders design service titles, descriptions and prices', () => {
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    expect(screen.getByText('خدمات جانبی سفر')).toBeInTheDocument();
    expect(screen.getByText('خدماتی که می‌خواهید انتخاب کنید — هزینه به مجموع شما اضافه می‌شود')).toBeInTheDocument();
    expect(screen.getByText('بار اضافه')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-extra-extra-baggage')).toHaveTextContent('۴۵۰٬۰۰۰');
    expect(screen.getByTestId('checkout-extra-extra-cip')).toHaveTextContent('۹۰۰٬۰۰۰');
  });

  it('renders the MD-80 aircraft seat chart from the PDF layout after opening it', async () => {
    const user = userEvent.setup();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));

    const map = screen.getByTestId('checkout-seat-map');
    expect(map).toHaveAttribute('data-aircraft', 'MD-80');
    expect(screen.getByTestId('checkout-seat-toggle')).toHaveTextContent('MD-80');
    expect(screen.getByTestId('checkout-seat-toggle')).toHaveTextContent('فرست‌کلاس');
    expect(screen.getByTestId('checkout-seat-toggle')).toHaveTextContent('بیزینس');
    expect(screen.getByTestId('checkout-seat-toggle')).toHaveTextContent('اکونومی');
    expect(screen.getByText('فرست کلاس')).toBeInTheDocument();
    expect(screen.getByText('بیزینس')).toBeInTheDocument();
    expect(screen.getByText('اکونومی')).toBeInTheDocument();
    expect(screen.getAllByText('خروج').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GALLEY').length).toBeGreaterThan(0);
    expect(screen.getByTestId('checkout-seat-7D')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-seat-3F')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-seat-3A')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-seat-28A')).not.toBeInTheDocument();
  });

  it('prevents selecting seats outside the purchased cabin and already-taken seats', async () => {
    const user = userEvent.setup();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));
    expect(screen.getByTestId('checkout-seat-3A')).toBeDisabled();
    expect(screen.getByTestId('checkout-seat-12E')).toBeDisabled();
    expect(screen.getByTestId('checkout-seat-12D')).toBeEnabled();
  });

  it.each([
    ['BUSINESS', '8A'],
    ['FIRST', '4A'],
  ] as const)(
    'keeps a purchased %s cabin seat selectable even when business access is otherwise locked',
    async (bookedCabin, seatCode) => {
      const user = userEvent.setup();
      const onToggleSeat = vi.fn();
      render(
        <ExtrasStep
          locale="fa"
          extras={testExtras()}
          onToggleExtra={vi.fn()}
          onExtraQuantityChange={vi.fn()}
          passengerCount={1}
          seats={SEATS}
          selectedSeats={[]}
          onToggleSeat={onToggleSeat}
          businessLocked
          bookedCabin={bookedCabin}
          aircraftType="MD-80"
          clubBalance={15_000}
        />,
      );

      await user.click(screen.getByTestId('checkout-seat-toggle'));
      expect(screen.getByTestId(`checkout-seat-${seatCode}`)).toBeEnabled();
      await user.click(screen.getByTestId(`checkout-seat-${seatCode}`));
      expect(onToggleSeat).toHaveBeenCalledWith(seatCode);
    },
  );

  it('uses MD-80 PDF chart when API still returns legacy A320 lettering', async () => {
    const user = userEvent.setup();
    const legacyA320: SeatMapCell[] = [
      { seatCode: '3A', row: 3, cabin: 'BUSINESS', status: 'FREE' },
      { seatCode: '3B', row: 3, cabin: 'BUSINESS', status: 'FREE' },
      { seatCode: '3C', row: 3, cabin: 'BUSINESS', status: 'TAKEN' },
      { seatCode: '3D', row: 3, cabin: 'BUSINESS', status: 'FREE' },
      { seatCode: '7A', row: 7, cabin: 'ECONOMY', status: 'FREE' },
      { seatCode: '7B', row: 7, cabin: 'ECONOMY', status: 'FREE' },
      { seatCode: '7C', row: 7, cabin: 'ECONOMY', status: 'TAKEN' },
      { seatCode: '7D', row: 7, cabin: 'ECONOMY', status: 'FREE' },
      { seatCode: '7E', row: 7, cabin: 'ECONOMY', status: 'FREE' },
    ];
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={legacyA320}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="Airbus A320"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));

    expect(screen.getByTestId('checkout-seat-map')).toHaveAttribute('data-aircraft', 'MD-80');
    expect(screen.getByTestId('checkout-seat-7D')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-seat-7C')).not.toBeInTheDocument();
  });

  it('still shows all MD-80 seats when the API seat list is empty', async () => {
    const user = userEvent.setup();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={[]}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));

    expect(screen.getByTestId('checkout-seat-map')).toHaveAttribute('data-capacity', '140');
    expect(screen.getByTestId('checkout-seat-7A')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-seat-12F')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-seat-32A')).toBeInTheDocument();
  });

  it('toggles an extra service when the card is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={onToggle}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={0}
      />,
    );

    await user.click(screen.getByTestId('checkout-extra-extra-insurance-toggle'));
    expect(onToggle).toHaveBeenCalledWith('extra-insurance');
  });

  it('requires accepting pet rules before adding the pet service', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={onToggle}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={0}
      />,
    );

    await user.click(screen.getByTestId('checkout-extra-extra-pet-toggle'));
    expect(screen.getByTestId('checkout-pet-rules')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-pet-accept')).toBeDisabled();
    expect(onToggle).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('checkout-pet-rules-accept'));
    await user.click(screen.getByTestId('checkout-pet-accept'));
    expect(onToggle).toHaveBeenCalledWith('extra-pet');
  });

  it('only allows selecting seats in the booked cabin', async () => {
    const user = userEvent.setup();
    const onToggleSeat = vi.fn();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={onToggleSeat}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));

    expect(screen.getByTestId('checkout-seat-3A')).toBeDisabled();
    expect(screen.getByTestId('checkout-seat-7A')).toBeDisabled();
    await user.click(screen.getByTestId('checkout-seat-12A'));
    expect(onToggleSeat).toHaveBeenCalledWith('12A');
  });

  it('keeps the seat map closed until a low-point customer accepts the fee', async () => {
    const user = userEvent.setup();
    const onToggleExtra = vi.fn();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={onToggleExtra}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={0}
      />,
    );

    expect(screen.getByTestId('checkout-seat-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('checkout-seat-toggle')).toBeDisabled();
    expect(screen.getByTestId('checkout-seat-toggle')).not.toHaveTextContent('MD-80');
    expect(screen.queryByTestId('checkout-seat-instructions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkout-seat-map')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-seat-toggle'));
    expect(screen.queryByTestId('checkout-seat-map')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-seat-accept-fee'));
    expect(onToggleExtra).toHaveBeenCalledWith('extra-seat');
  });

  it('shows the ticket-based selection limit with the map and blocks an additional seat', async () => {
    const user = userEvent.setup();
    const onToggleSeat = vi.fn();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={2}
        seatSelectionLimit={1}
        seats={SEATS}
        selectedSeats={['12A']}
        onToggleSeat={onToggleSeat}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));
    expect(screen.getByTestId('checkout-seat-instructions')).toHaveTextContent('۱ صندلی');
    expect(screen.getByTestId('checkout-seat-instructions')).toHaveTextContent('۰');
    await user.click(screen.getByTestId('checkout-seat-12B'));
    expect(onToggleSeat).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('checkout-seat-12A'));
    expect(onToggleSeat).toHaveBeenCalledWith('12A');
  });

  it('localizes Arabic map labels while keeping GALLEY in English', async () => {
    const user = userEvent.setup();
    render(
      <ExtrasStep
        locale="ar"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    await user.click(screen.getByTestId('checkout-seat-toggle'));
    expect(screen.getAllByText('GALLEY').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('خروج')).toHaveLength(0);
    expect(screen.getAllByText('مخرج').length).toBeGreaterThan(0);
  });

  it('lets a high-point customer open the seat map without selecting the paid extra', async () => {
    const user = userEvent.setup();
    render(
      <ExtrasStep
        locale="fa"
        extras={testExtras()}
        onToggleExtra={vi.fn()}
        onExtraQuantityChange={vi.fn()}
        passengerCount={1}
        seats={SEATS}
        selectedSeats={[]}
        onToggleSeat={vi.fn()}
        businessLocked={false}
        bookedCabin="ECONOMY"
        aircraftType="MD-80"
        clubBalance={15_000}
      />,
    );

    expect(screen.queryByTestId('checkout-seat-map')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-seat-toggle'));
    expect(screen.getByTestId('checkout-seat-map')).toBeInTheDocument();
  });
});
