import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PassengerReportsPage from './PassengerReportsPage';
import * as reportingApi from '../../api/reporting';
import type { PassengerReportHit } from '../../types/reporting';

const HIT: PassengerReportHit = {
  fullName: 'نگار رضایی',
  maskedNationalId: '049******9',
  pnr: 'BJDEMO1',
  status: 'TICKETED',
  flightNo: 'EP-821',
  originCode: 'THR',
  destCode: 'DXB',
  departureAt: '2026-08-01T05:00:00.000Z',
  seatCode: '4C',
  cabin: 'BUSINESS',
  priceIrr: '420000000',
};

describe('PassengerReportsPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('searches and shows the ticket detail card with a masked national ID', async () => {
    const searchSpy = vi.spyOn(reportingApi, 'searchPassengers').mockResolvedValue([HIT]);

    render(<PassengerReportsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('نام مسافر یا کد ملی'), 'نگار');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));

    expect(searchSpy).toHaveBeenCalledWith('نگار');
    expect((await screen.findAllByText('نگار رضایی')).length).toBeGreaterThan(0);
    expect(screen.getByText('BJDEMO1')).toBeInTheDocument();
    expect(screen.getByText(/۰۴۹\*+۹/)).toBeInTheDocument();
    expect(screen.getByText(/بیزنس/)).toBeInTheDocument();
  });

  it('shows the design no-result state', async () => {
    vi.spyOn(reportingApi, 'searchPassengers').mockResolvedValue([]);

    render(<PassengerReportsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('نام مسافر یا کد ملی'), 'ناموجود');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));

    expect(await screen.findByText('مسافری با این نام یافت نشد.')).toBeInTheDocument();
  });

  it('does not expose demo passenger suggestions before a real search', () => {
    render(<PassengerReportsPage />);

    expect(screen.queryByText('جستجوی سریع:')).not.toBeInTheDocument();
    expect(screen.queryByText('نگار رضایی')).not.toBeInTheDocument();
    expect(screen.queryByText('رضا کریمی')).not.toBeInTheDocument();
    expect(screen.queryByText('سارا محمدی')).not.toBeInTheDocument();
  });

  it('shows Excel/PDF stub toasts matching the design', async () => {
    vi.spyOn(reportingApi, 'searchPassengers').mockResolvedValue([HIT]);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    render(<PassengerReportsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('نام مسافر یا کد ملی'), 'نگار');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));
    await screen.findAllByText('نگار رضایی');

    await user.click(screen.getByRole('button', { name: /Excel/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('خروجی Excel دانلود شد ✓');
  });

  it('adds quick-search chips from successful search hits only', async () => {
    const searchSpy = vi.spyOn(reportingApi, 'searchPassengers').mockResolvedValue([HIT]);

    render(<PassengerReportsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('نام مسافر یا کد ملی'), 'نگار');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));

    expect(await screen.findByText('جستجوی سریع:')).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'نگار رضایی' });
    await user.click(chip);
    expect(searchSpy).toHaveBeenLastCalledWith('نگار رضایی');
  });
});
