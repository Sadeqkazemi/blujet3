import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FinancialSummaryCard from './FinancialSummaryCard';
import type { RevenueMixResult } from '../types/reporting';

const MIX: RevenueMixResult = {
  totalIrr: '5000000000',
  channels: [
    { channel: 'SYSTEM', labelFa: 'فروش سیستمی', amountIrr: '2300000000', pct: 46 },
    { channel: 'CHARTER', labelFa: 'فروش چارتر', amountIrr: '1550000000', pct: 31 },
    { channel: 'AGENCY', labelFa: 'فروش آژانس', amountIrr: '1150000000', pct: 23 },
  ],
};

function renderCard(mix: RevenueMixResult) {
  return render(
    <MemoryRouter>
      <FinancialSummaryCard mix={mix} />
    </MemoryRouter>,
  );
}

describe('FinancialSummaryCard', () => {
  it('renders the channel split bar, legend percentages and total/per-channel boxes', () => {
    renderCard(MIX);

    expect(screen.getByText('گزارش مالی')).toBeInTheDocument();
    expect(screen.getByText('جمع فروش سال')).toBeInTheDocument();
    expect(screen.getByText('۵۰۰٬۰۰۰٬۰۰۰')).toBeInTheDocument();

    expect(screen.getByText('سیستمی ۴۶٪')).toBeInTheDocument();
    expect(screen.getByText('چارتر ۳۱٪')).toBeInTheDocument();
    expect(screen.getByText('آژانس ۲۳٪')).toBeInTheDocument();

    expect(screen.getByText('۲۳۰٬۰۰۰٬۰۰۰')).toBeInTheDocument();
    expect(screen.getByText('۱۵۵٬۰۰۰٬۰۰۰')).toBeInTheDocument();
    expect(screen.getByText('۱۱۵٬۰۰۰٬۰۰۰')).toBeInTheDocument();
  });

  it('links to the finance panel for full details', () => {
    renderCard(MIX);
    const link = screen.getByRole('link', { name: 'مشاهده جزئیات ←' });
    expect(link).toHaveAttribute('href', '/panel/finance');
  });
});
