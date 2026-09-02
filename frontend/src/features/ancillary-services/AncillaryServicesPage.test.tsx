import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AncillaryServicesPage from './AncillaryServicesPage';
import * as mockApi from '../../api/ancillary-services';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { AncillaryServiceRow, SeatServiceRow } from '../../types/ancillary-services';
import type { Role } from '../../types/auth';

const SEAT_SERVICES: SeatServiceRow[] = [
  { key: 'seat-normal', titleFa: 'صندلی عادی', descriptionFa: 'صندلی استاندارد بدون هزینه اضافه', priceIrr: '0', enabled: true },
  { key: 'seat-legroom', titleFa: 'صندلی با فضای پای بیشتر', descriptionFa: 'ردیف خروج اضطراری یا ردیف اول', priceIrr: '3500000', enabled: true },
];

const OTHER_SERVICES: AncillaryServiceRow[] = [
  { key: 'baggage', titleFa: 'بار اضافه', descriptionFa: 'هر ۵ کیلوگرم بار اضافه بر مجاز', priceIrr: '2000000', enabled: true, isCustom: false },
  { key: 'custom-1', titleFa: 'اینترنت پروازی', descriptionFa: '', priceIrr: '1000000', enabled: true, isCustom: true },
];

const LEGACY_REFUND_SERVICE: AncillaryServiceRow = {
  key: 'refund-fee',
  titleFa: 'هزینه استرداد بلیط',
  descriptionFa: 'کسر از مبلغ استرداد طبق قوانین بلیط',
  priceIrr: '500000',
  enabled: true,
  isCustom: false,
};

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('AncillaryServicesPage', () => {
  it('renders seat-type pricing and other services for Commercial Manager', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(mockApi, 'fetchSeatServices').mockResolvedValue(SEAT_SERVICES);
    vi.spyOn(mockApi, 'fetchOtherServices').mockResolvedValue(OTHER_SERVICES);

    render(<AncillaryServicesPage />);

    expect(await screen.findByText('قیمت انواع صندلی')).toBeInTheDocument();
    expect(screen.getByText('صندلی با فضای پای بیشتر')).toBeInTheDocument();
    expect(screen.getByText('سایر خدمات جانبی')).toBeInTheDocument();
    expect(screen.getByText('بار اضافه')).toBeInTheDocument();
    // Custom service has a delete button, built-in does not
    expect(screen.getByText('اینترنت پروازی')).toBeInTheDocument();
  });

  it('hides the legacy refund fee from Commercial Manager services', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(mockApi, 'fetchSeatServices').mockResolvedValue(SEAT_SERVICES);
    vi.spyOn(mockApi, 'fetchOtherServices').mockResolvedValue([...OTHER_SERVICES, LEGACY_REFUND_SERVICE]);

    render(<AncillaryServicesPage />);

    expect(await screen.findByText('بار اضافه')).toBeInTheDocument();
    expect(screen.queryByText('هزینه استرداد بلیط')).not.toBeInTheDocument();
  });

  it('shows the coming-soon placeholder for a non-Commercial role (temp client-side guard)', async () => {
    mockRole('SITE_ADMIN');
    vi.spyOn(mockApi, 'fetchSeatServices').mockResolvedValue(SEAT_SERVICES);
    vi.spyOn(mockApi, 'fetchOtherServices').mockResolvedValue(OTHER_SERVICES);

    render(<AncillaryServicesPage />);

    expect(await screen.findByText('این بخش به‌زودی راه‌اندازی می‌شود')).toBeInTheDocument();
    expect(screen.queryByText('قیمت انواع صندلی')).not.toBeInTheDocument();
  });

  it('saving a price calls the adapter and shows a confirmation toast', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(mockApi, 'fetchSeatServices').mockResolvedValue(SEAT_SERVICES);
    vi.spyOn(mockApi, 'fetchOtherServices').mockResolvedValue(OTHER_SERVICES);
    const setPrice = vi
      .spyOn(mockApi, 'setSeatServicePrice')
      .mockResolvedValue(SEAT_SERVICES.map((s) => (s.key === 'seat-normal' ? { ...s, priceIrr: '5000000' } : s)));

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<AncillaryServicesPage />);
    await screen.findByText('صندلی عادی');

    const saveButtons = screen.getAllByRole('button', { name: 'ثبت قیمت' });
    await userEvent.click(saveButtons[0]!);

    await waitFor(() => expect(setPrice).toHaveBeenCalledWith('seat-normal', '0'));
    expect(await screen.findByText('قیمت ثبت شد ✓')).toBeInTheDocument();
  });

  it('adding a custom service submits title/description/price', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(mockApi, 'fetchSeatServices').mockResolvedValue(SEAT_SERVICES);
    vi.spyOn(mockApi, 'fetchOtherServices').mockResolvedValue(OTHER_SERVICES);
    const addService = vi.spyOn(mockApi, 'addCustomService').mockResolvedValue([
      ...OTHER_SERVICES,
      { key: 'custom-2', titleFa: 'بیمه ویژه', descriptionFa: '', priceIrr: '1500000', enabled: true, isCustom: true },
    ]);

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<AncillaryServicesPage />);
    await screen.findByText('سایر خدمات جانبی');

    await userEvent.click(screen.getByRole('button', { name: 'افزودن خدمت جدید' }));
    await userEvent.type(screen.getByLabelText('عنوان خدمت *'), 'بیمه ویژه');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت خدمت' }));

    await waitFor(() =>
      expect(addService).toHaveBeenCalledWith({ titleFa: 'بیمه ویژه', descriptionFa: '', priceIrr: '0' }),
    );
    expect(await screen.findByText('بیمه ویژه')).toBeInTheDocument();
  });
});
