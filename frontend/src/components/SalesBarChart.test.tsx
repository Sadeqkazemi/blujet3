import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SalesBarChart from './SalesBarChart';
import type { SalesChartPeriod } from '../types/reporting';

const PERIODS: SalesChartPeriod[] = [
  {
    periodKey: '2026-02-01',
    startDate: '2026-02-01T00:00:00.000Z',
    endDate: '2026-03-01T00:00:00.000Z',
    // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
    // on the backend).
    systemIrr: '9120000000',
    charterIrr: '7600000000',
    agencyIrr: '4560000000',
  },
  {
    periodKey: '2026-03-01',
    startDate: '2026-03-01T00:00:00.000Z',
    endDate: '2026-04-01T00:00:00.000Z',
    systemIrr: '1000000000',
    charterIrr: '500000000',
    agencyIrr: '200000000',
  },
];

describe('SalesBarChart', () => {
  it('renders the legend for all 3 channels', () => {
    render(<SalesBarChart periods={PERIODS} selectedPeriodKey={null} onSelectPeriod={vi.fn()} />);
    expect(screen.getByText('سیستمی')).toBeInTheDocument();
    expect(screen.getByText('چارتر')).toBeInTheDocument();
    expect(screen.getByText('آژانس')).toBeInTheDocument();
  });

  it('renders one bar per period', () => {
    render(<SalesBarChart periods={PERIODS} selectedPeriodKey={null} onSelectPeriod={vi.fn()} />);
    const chart = screen.getByRole('img', { name: 'نمودار فروش دوره‌ای' });
    expect(chart.querySelectorAll('button')).toHaveLength(PERIODS.length);
  });

  it('clicking a bar calls onSelectPeriod with its periodKey', async () => {
    const onSelectPeriod = vi.fn();
    render(<SalesBarChart periods={PERIODS} selectedPeriodKey={null} onSelectPeriod={onSelectPeriod} />);
    const chart = screen.getByRole('img', { name: 'نمودار فروش دوره‌ای' });
    const [firstBar] = chart.querySelectorAll('button');
    await userEvent.click(firstBar);
    expect(onSelectPeriod).toHaveBeenCalledWith('2026-02-01');
  });

  it('clicking the already-selected bar deselects it (toggle)', async () => {
    const onSelectPeriod = vi.fn();
    render(<SalesBarChart periods={PERIODS} selectedPeriodKey="2026-02-01" onSelectPeriod={onSelectPeriod} />);
    const chart = screen.getByRole('img', { name: 'نمودار فروش دوره‌ای' });
    const [firstBar] = chart.querySelectorAll('button');
    await userEvent.click(firstBar);
    expect(onSelectPeriod).toHaveBeenCalledWith(null);
  });

  it('switches to a table view with the same data', async () => {
    render(<SalesBarChart periods={PERIODS} selectedPeriodKey={null} onSelectPeriod={vi.fn()} />);
    await userEvent.click(screen.getByText('نمایش جدولی'));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(PERIODS.length + 1); // + header row
  });
});
