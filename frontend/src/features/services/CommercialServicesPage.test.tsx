import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as travelCostsApi from '../../api/travel-costs';
import type { TravelCost } from '../../types/travel-costs';
import CommercialServicesPage from './CommercialServicesPage';

vi.mock('../../api/travel-costs');

const insurance = {
  id: 'cost-1',
  code: 'TRAVEL_INSURANCE' as const,
  titleFa: 'بیمه مسافرتی',
  titleEn: null,
  titleAr: null,
  descriptionFa: 'پوشش کامل تأخیر و خسارت',
  billingUnit: 'PER_PASSENGER' as const,
  priceIrr: '3200000',
  active: true,
  purchaseEnabled: true,
  sortOrder: 0,
};

describe('CommercialServicesPage', () => {
  beforeEach(() => {
    vi.mocked(travelCostsApi.fetchTravelCosts).mockResolvedValue([insurance]);
    vi.mocked(travelCostsApi.updateTravelCost).mockImplementation(async (_id, payload) => ({
      ...insurance,
      ...payload,
    }));
  });

  it('renders real API rows and saves the edited toman price as rial', async () => {
    const user = userEvent.setup();
    render(<CommercialServicesPage />);

    expect(await screen.findByText('بیمه مسافرتی')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'قیمت بیمه مسافرتی' });
    await user.clear(input);
    await user.type(input, '450000');
    await user.click(screen.getByRole('button', { name: 'ثبت قیمت' }));

    await waitFor(() => {
      expect(travelCostsApi.updateTravelCost).toHaveBeenCalledWith('cost-1', {
        priceIrr: '4500000',
      });
    });
    expect(await screen.findByText('قیمت «بیمه مسافرتی» ذخیره شد.')).toBeInTheDocument();
  });

  it('updates active and purchase visibility together from the design toggle', async () => {
    const user = userEvent.setup();
    render(<CommercialServicesPage />);
    await screen.findByText('بیمه مسافرتی');

    await user.click(screen.getByRole('switch', { name: '' }));

    await waitFor(() => {
      expect(travelCostsApi.updateTravelCost).toHaveBeenCalledWith('cost-1', {
        active: false,
        purchaseEnabled: false,
      });
    });
  });

  it('creates a custom service with a backend-valid stable code', async () => {
    const user = userEvent.setup();
    const customService: TravelCost = {
      ...insurance,
      id: 'cost-custom-1',
      code: 'CUSTOM_test-12345678',
      titleFa: 'خدمت سفارشی تست',
      descriptionFa: 'شرح خدمت سفارشی',
      billingUnit: 'PER_BOOKING',
      priceIrr: '750000',
      sortOrder: 1,
    };
    vi.mocked(travelCostsApi.createTravelCost).mockResolvedValue(customService);

    render(<CommercialServicesPage />);
    await screen.findByText('بیمه مسافرتی');

    await user.click(screen.getByRole('button', { name: /افزودن خدمت جدید/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'نوع خدمت' }), 'CUSTOM');
    await user.type(screen.getByRole('textbox', { name: 'عنوان خدمت' }), 'خدمت سفارشی تست');
    await user.type(screen.getByRole('textbox', { name: 'توضیح خدمت' }), 'شرح خدمت سفارشی');
    await user.type(screen.getByRole('textbox', { name: 'عنوان انگلیسی خدمت' }), 'Custom test service');
    await user.type(screen.getByRole('textbox', { name: 'توضیح انگلیسی خدمت' }), 'Custom service description');
    await user.type(screen.getByRole('textbox', { name: 'عنوان عربی خدمت' }), 'خدمة اختبار مخصصة');
    await user.type(screen.getByRole('textbox', { name: 'توضیح عربی خدمت' }), 'وصف الخدمة المخصصة');
    await user.type(screen.getByRole('textbox', { name: 'قیمت خدمت جدید' }), '75000');
    await user.click(screen.getByRole('button', { name: 'ثبت خدمت' }));

    await waitFor(() => {
      expect(travelCostsApi.createTravelCost).toHaveBeenCalledWith({
        code: expect.stringMatching(/^CUSTOM_[A-Za-z0-9-]{8,64}$/),
        titleFa: 'خدمت سفارشی تست',
        titleEn: 'Custom test service',
        titleAr: 'خدمة اختبار مخصصة',
        descriptionFa: 'شرح خدمت سفارشی',
        descriptionEn: 'Custom service description',
        descriptionAr: 'وصف الخدمة المخصصة',
        billingUnit: 'PER_BOOKING',
        priceIrr: '750000',
        active: true,
        purchaseEnabled: true,
        sortOrder: 1,
      });
    });
    expect(await screen.findByText('خدمت «خدمت سفارشی تست» اضافه شد.')).toBeInTheDocument();
  });
});
