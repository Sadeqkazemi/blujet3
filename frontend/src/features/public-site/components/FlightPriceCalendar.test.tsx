import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as publicSiteApi from '../../../api/publicSite';
import { ApiRequestError } from '../../../api/envelope';
import FlightPriceCalendar from './FlightPriceCalendar';

const DAYS = [
  { date: '2026-07-29', minPriceIrr: '40000000', dateLabelFa: '2026-07-29', isCenter: false },
  { date: '2026-07-30', minPriceIrr: '0', dateLabelFa: '2026-07-30', isCenter: false },
  { date: '2026-07-31', minPriceIrr: '35000000', dateLabelFa: '2026-07-31', isCenter: false },
  { date: '2026-08-01', minPriceIrr: '38000000', dateLabelFa: '2026-08-01', isCenter: true },
  { date: '2026-08-02', minPriceIrr: '42000000', dateLabelFa: '2026-08-02', isCenter: false },
  { date: '2026-08-03', minPriceIrr: '39000000', dateLabelFa: '2026-08-03', isCenter: false },
  { date: '2026-08-04', minPriceIrr: '41000000', dateLabelFa: '2026-08-04', isCenter: false },
];

function daysAround(center: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${center}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index - 3);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      date: isoDate,
      minPriceIrr: '40000000',
      dateLabelFa: isoDate,
      isCenter: index === 3,
    };
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('FlightPriceCalendar', () => {
  it('scrolls one day forward while keeping 2 Shahrivar selected and blue from the Persian physical left arrow', async () => {
    const onSelect = vi.fn();
    const fetchCalendar = vi
      .spyOn(publicSiteApi, 'fetchPriceCalendar')
      .mockImplementation(async (_origin, _dest, center) => daysAround(center));

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-24"
        locale="fa"
        onSelectDate={onSelect}
      />,
    );

    const strip = await screen.findByTestId('price-calendar-strip');
    const daysTrack = screen.getByTestId('price-calendar-days-track');
    const physicalLeftArrow = strip.firstElementChild;
    expect(physicalLeftArrow).toBe(
      screen.getByTestId('price-calendar-next'),
    );
    expect(daysTrack.firstElementChild).toBe(
      screen.getByTestId('price-calendar-day-2026-08-26'),
    );
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveTextContent(
      '۲ شهریور',
    );
    expect(screen.getByTestId('price-calendar-day-2026-08-25')).toHaveTextContent(
      '۳ شهریور',
    );

    await userEvent.click(screen.getByTestId('price-calendar-next'));

    await waitFor(() => {
      expect(fetchCalendar).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-25');
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveStyle({
      background: '#1668c4',
    });
    expect(screen.getByTestId('price-calendar-day-2026-08-25')).toHaveAttribute(
      'data-selected',
      'false',
    );
    expect(screen.queryByTestId('price-calendar-day-2026-08-21')).not.toBeInTheDocument();
    expect(screen.getByTestId('price-calendar-day-2026-08-27')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('price-calendar-previous'));
    await waitFor(() => {
      expect(fetchCalendar).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-24');
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('keeps the selected strip visible while a one-day arrow browse is loading', async () => {
    const nextWindow = deferred<ReturnType<typeof daysAround>>();
    vi.spyOn(publicSiteApi, 'fetchPriceCalendar')
      .mockResolvedValueOnce(daysAround('2026-08-24'))
      .mockImplementationOnce(() => nextWindow.promise);

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-24"
        locale="fa"
        onSelectDate={vi.fn()}
      />,
    );

    const strip = await screen.findByTestId('price-calendar-strip');
    await userEvent.click(screen.getByTestId('price-calendar-next'));

    expect(strip).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('price-calendar-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveStyle({
      background: '#1668c4',
    });

    nextWindow.resolve(daysAround('2026-08-25'));
    await waitFor(() => expect(strip).toHaveAttribute('aria-busy', 'false'));
    expect(screen.getByTestId('price-calendar-days-track')).toHaveAttribute(
      'data-slide-from',
      'left',
    );
    expect(screen.getByTestId('price-calendar-day-2026-08-24')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('ignores a stale slower response after two rapid one-day arrow clicks', async () => {
    const firstWindow = deferred<ReturnType<typeof daysAround>>();
    const secondWindow = deferred<ReturnType<typeof daysAround>>();
    const fetchCalendar = vi
      .spyOn(publicSiteApi, 'fetchPriceCalendar')
      .mockResolvedValueOnce(daysAround('2026-08-24'))
      .mockImplementationOnce(() => firstWindow.promise)
      .mockImplementationOnce(() => secondWindow.promise);

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-24"
        locale="fa"
        onSelectDate={vi.fn()}
      />,
    );

    await screen.findByTestId('price-calendar-strip');
    await userEvent.click(screen.getByTestId('price-calendar-next'));
    await waitFor(() =>
      expect(fetchCalendar).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-25'),
    );
    await userEvent.click(screen.getByTestId('price-calendar-next'));
    await waitFor(() =>
      expect(fetchCalendar).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-26'),
    );

    secondWindow.resolve(daysAround('2026-08-26'));
    await screen.findByTestId('price-calendar-day-2026-08-28');
    firstWindow.resolve(daysAround('2026-08-25'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('price-calendar-day-2026-08-28')).toBeInTheDocument();
    expect(screen.queryByTestId('price-calendar-day-2026-08-22')).not.toBeInTheDocument();
  });

  it('loads real API days, marks selected + cheapest, and shows empty day as —', async () => {
    const onSelect = vi.fn();
    vi.spyOn(publicSiteApi, 'fetchPriceCalendar').mockResolvedValue(DAYS);

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-01"
        locale="fa"
        onSelectDate={onSelect}
      />,
    );

    expect(screen.getByTestId('price-calendar-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('price-calendar-strip')).toBeInTheDocument();
    });

    expect(publicSiteApi.fetchPriceCalendar).toHaveBeenCalledWith('THR', 'MHD', '2026-08-01');
    expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveStyle({
      background: '#1668c4',
    });
    expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveTextContent('تومان');
    expect(screen.getByTestId('price-calendar-day-2026-07-30')).toHaveAttribute('data-empty', 'true');
    expect(screen.getByTestId('price-calendar-cheapest-2026-07-31')).toBeInTheDocument();
    expect(screen.getByTestId('price-calendar')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByText('تقویم قیمت')).not.toBeInTheDocument();
    expect(screen.queryByText('مقایسه قیمت پرواز در روزهای نزدیک')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^price-calendar-visible-day-/)).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'روز بعد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'روز قبل' })).toBeInTheDocument();

    const strip = screen.getByTestId('price-calendar-strip');
    const previous = screen.getByTestId('price-calendar-previous');
    const next = screen.getByTestId('price-calendar-next');
    expect(strip.firstElementChild).toBe(next);
    expect(strip.lastElementChild).toBe(previous);
    expect(next).toHaveTextContent('‹');
    expect(previous).toHaveTextContent('›');

    await userEvent.click(screen.getByTestId('price-calendar-day-2026-08-02'));
    expect(onSelect).toHaveBeenCalledWith('2026-08-02');
  });

  it('shows error state with retry', async () => {
    const spy = vi
      .spyOn(publicSiteApi, 'fetchPriceCalendar')
      .mockRejectedValueOnce(new ApiRequestError('INTERNAL_ERROR', 'fail', 500))
      .mockResolvedValueOnce(DAYS);

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-01"
        locale="fa"
        onSelectDate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('price-calendar-error')).toBeInTheDocument();
    });

    const callsBeforeRetry = spy.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    await waitFor(() => {
      expect(screen.getByTestId('price-calendar-strip')).toBeInTheDocument();
    });
    expect(spy.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('loads further date windows in both directions without disabling navigation', async () => {
    const spy = vi
      .spyOn(publicSiteApi, 'fetchPriceCalendar')
      .mockImplementation(async (_origin, _dest, center) => daysAround(center));
    const onSelect = vi.fn();

    render(
      <FlightPriceCalendar
        origin="THR"
        dest="MHD"
        selectedDate="2026-08-01"
        locale="fa"
        onSelectDate={onSelect}
      />,
    );

    await screen.findByTestId('price-calendar-strip');
    const next = screen.getByTestId('price-calendar-next');
    const previous = screen.getByTestId('price-calendar-previous');

    expect(next).not.toBeDisabled();
    expect(previous).not.toBeDisabled();

    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(await screen.findByTestId('price-calendar-next'));
    }
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-05'),
    );

    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(await screen.findByTestId('price-calendar-previous'));
    }
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith('THR', 'MHD', '2026-08-02'),
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it.each(['fa', 'en', 'ar'] as const)(
    'keeps physical arrow semantics aligned with direction for %s',
    async (locale) => {
      vi.spyOn(publicSiteApi, 'fetchPriceCalendar').mockResolvedValue(DAYS);
      const onSelect = vi.fn();

      render(
        <FlightPriceCalendar
          origin="THR"
          dest="MHD"
          selectedDate="2026-08-01"
          locale={locale}
          onSelectDate={onSelect}
        />,
      );

      const strip = await screen.findByTestId('price-calendar-strip');
      const previous = screen.getByTestId('price-calendar-previous');
      const next = screen.getByTestId('price-calendar-next');

      expect(strip).toHaveAttribute('dir', 'ltr');
      if (locale === 'en') {
        expect(strip.firstElementChild).toBe(previous);
        expect(strip.lastElementChild).toBe(next);
      } else {
        expect(strip.firstElementChild).toBe(next);
        expect(strip.lastElementChild).toBe(previous);
      }
      expect(strip.firstElementChild).toHaveTextContent('‹');
      expect(strip.lastElementChild).toHaveTextContent('›');

      await userEvent.click(strip.firstElementChild as HTMLElement);
      await waitFor(() => expect(publicSiteApi.fetchPriceCalendar).toHaveBeenLastCalledWith(
        'THR',
        'MHD',
        locale === 'en' ? '2026-07-31' : '2026-08-02',
      ));
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveAttribute(
        'data-selected',
        'true',
      );
      expect(screen.getByTestId('price-calendar-day-2026-08-01')).toHaveStyle({
        background: '#1668c4',
      });
    },
  );
});
