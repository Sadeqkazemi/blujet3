import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TravelCostsTab from './TravelCostsTab';
import * as travelCostsApi from '../../api/travel-costs';

vi.mock('../../api/travel-costs');

const cost = {
  id: 'cost-1',
  code: 'TRAVEL_INSURANCE' as const,
  titleFa: 'بیمه مسافرتی',
  titleEn: null,
  titleAr: null,
  descriptionFa: null,
  billingUnit: 'PER_PASSENGER' as const,
  priceIrr: '3200000',
  active: true,
  purchaseEnabled: true,
  sortOrder: 0,
};

describe('TravelCostsTab', () => {
  beforeEach(() => {
    vi.mocked(travelCostsApi.fetchTravelCosts).mockResolvedValue([cost]);
    vi.mocked(travelCostsApi.deleteTravelCost).mockResolvedValue({ id: cost.id });
  });

  it('confirms destructive removal inside the application', async () => {
    const user = userEvent.setup();
    render(<TravelCostsTab />);
    await screen.findByText('بیمه مسافرتی');

    await user.click(screen.getByRole('button', { name: 'حذف' }));
    expect(screen.getByTestId('delete-travel-cost-dialog')).toHaveTextContent('بیمه مسافرتی');
    expect(travelCostsApi.deleteTravelCost).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('delete-travel-cost-dialog-confirm'));
    await waitFor(() => expect(travelCostsApi.deleteTravelCost).toHaveBeenCalledWith(cost.id));
    expect(await screen.findByText('هزینه سفر حذف شد.')).toBeInTheDocument();
  });
});
