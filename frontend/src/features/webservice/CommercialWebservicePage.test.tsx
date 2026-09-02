import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CommercialWebservicePage from './CommercialWebservicePage';
import * as wsApi from '../../api/webservice-pricing';

describe('CommercialWebservicePage', () => {
  it('loads current prices and saves an updated plan price', async () => {
    vi.spyOn(wsApi, 'fetchWebservicePricing').mockResolvedValue({
      prices: { 1: 45_000_000, 3: 120_000_000, 12: 420_000_000 },
    });
    const updateSpy = vi.spyOn(wsApi, 'updateWebservicePricing').mockResolvedValue({
      prices: { 1: 50_000_000, 3: 120_000_000, 12: 420_000_000 },
    });

    render(<CommercialWebservicePage />);
    expect(await screen.findByText('وب سرویس')).toBeInTheDocument();
    expect(screen.getByText('وب‌سرویس جستجو و رزرو پرواز')).toBeInTheDocument();
    expect(screen.getByText('وب‌سرویس فروش کامل')).toBeInTheDocument();

    const user = userEvent.setup();
    const month1 = screen.getByLabelText('۱ ماهه (تومان)');
    await user.clear(month1);
    await user.type(month1, '5000000');
    await user.click(screen.getByRole('button', { name: 'ذخیره قیمت‌گذاری' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith({
        month1PriceIrr: 50_000_000,
        month3PriceIrr: 120_000_000,
        month12PriceIrr: 420_000_000,
      }),
    );
    expect(await screen.findByText('قیمت‌گذاری وب‌سرویس‌ها ذخیره شد ✓')).toBeInTheDocument();
  });
});
