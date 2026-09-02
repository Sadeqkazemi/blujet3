import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import SiteAdminCustomersPage from './SiteAdminCustomersPage';
import * as customersApi from '../../api/customers';
import type { CustomerDetail, CustomersListResult } from '../../types/customers';

const LIST: CustomersListResult = {
  total: 2,
  incompleteCount: 1,
  customers: [
    {
      id: 'c1',
      fullName: 'نگار رضایی',
      phone: '09123456789',
      email: 'negar@email.com',
      nationalId: '0012345678',
      profileIncomplete: false,
      completionPct: 100,
      missingProfileFields: [],
      createdAt: '2025-05-31T00:00:00.000Z',
      club: { isMember: true, level: 'GOLD', points: 12450 },
    },
    {
      id: 'c2',
      fullName: '',
      phone: '09120000099',
      email: null,
      nationalId: null,
      profileIncomplete: true,
      completionPct: 0,
      missingProfileFields: ['fullName', 'nationalId', 'birthDate', 'passportNo', 'verifiedEmail'],
      createdAt: '2026-01-01T00:00:00.000Z',
      club: { isMember: false, level: null, points: 0 },
    },
  ],
};

const DETAIL: CustomerDetail = {
  id: 'c1',
  fullName: 'نگار رضایی',
  phone: '09123456789',
  email: 'negar@email.com',
  nationalId: '0012345678',
  profileIncomplete: false,
  completionPct: 100,
  missingProfileFields: [],
  registeredAt: '2025-05-31T00:00:00.000Z',
  club: {
    isMember: true,
    level: 'GOLD',
    points: 12450,
    cardStatus: 'ISSUED',
    cardNo: 'GOLD-8842',
  },
  docs: [{ type: 'کارت ملی', file: 'national-id-negar.jpg', status: 'verified' }],
  purchases: [
    {
      id: 'b1',
      route: 'تهران ← دبی',
      pnr: 'AS5K2P',
      date: '2026-06-18T00:00:00.000Z',
      priceIrr: '38000000',
      status: 'TICKETED',
    },
  ],
  contacts: [
    {
      id: 't1',
      channel: 'تیکت',
      subject: 'استعلام مانده امتیاز باشگاه',
      date: '2026-05-04T00:00:00.000Z',
      status: 'CLOSED',
    },
  ],
  refunds: [
    {
      id: 'rf1',
      trackingCode: 'RF-1001',
      passengerName: 'نگار رضایی',
      route: 'تهران ← دبی',
      pnr: 'AS5K2P',
      status: 'PAID',
      totalPaidIrr: '38000000',
      penaltyPct: 30,
      penaltyAmountIrr: '11400000',
      refundableIrr: '26600000',
      createdAt: '2026-06-01T00:00:00.000Z',
      paidAt: '2026-06-02T00:00:00.000Z',
    },
  ],
};

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/panel/customers']}>
      <Routes>
        <Route path="/panel/customers" element={<SiteAdminCustomersPage />} />
        <Route path="/panel/customers/:customerId" element={<SiteAdminCustomersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/panel/customers/c1']}>
      <Routes>
        <Route path="/panel/customers" element={<SiteAdminCustomersPage />} />
        <Route path="/panel/customers/:customerId" element={<SiteAdminCustomersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SiteAdminCustomersPage', () => {
  beforeEach(() => {
    vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue(LIST);
    vi.spyOn(customersApi, 'fetchCustomer').mockResolvedValue(DETAIL);
  });

  it('renders the registered customers table with status badges', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('نگار رضایی')).toBeInTheDocument();
    });
    expect(screen.getByText('مشتریان ثبت‌نام‌شده')).toBeInTheDocument();
    expect(screen.getByText('کامل')).toBeInTheDocument();
    expect(screen.getByText('ناقص')).toBeInTheDocument();
    expect(screen.getByText('— بدون نام —')).toBeInTheDocument();
    expect(customersApi.fetchCustomers).toHaveBeenCalled();
  });

  it('searches by mobile query', async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getByText('نگار رضایی')).toBeInTheDocument());
    await user.clear(screen.getByLabelText('جستجوی موبایل مشتری'));
    await user.type(screen.getByLabelText('جستجوی موبایل مشتری'), '0912');
    await waitFor(() => {
      expect(customersApi.fetchCustomers).toHaveBeenCalledWith('0912');
    });
  });

  it('shows detail tabs: info, purchases, contacts, club', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => {
      expect(screen.getAllByText('نگار رضایی').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('اطلاعات شخصی')).toBeInTheDocument();
    expect(screen.getByText('مدارک هویتی بارگذاری‌شده')).toBeInTheDocument();
    expect(screen.getByText('تأییدشده')).toBeInTheDocument();
    expect(screen.getByText('موبایل')).toBeInTheDocument();
    expect(screen.getByText('کد ملی')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تاریخچه خرید' }));
    expect(screen.getByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByText('صادر شده')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تاریخچه استرداد' }));
    expect(screen.getByText('تاریخچه استرداد مبالغ بلیط')).toBeInTheDocument();
    expect(screen.getByText('پرداخت‌شده')).toBeInTheDocument();
    expect(screen.getByText(/جریمه/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تماس‌ها و تیکت‌ها' }));
    expect(screen.getByText('استعلام مانده امتیاز باشگاه')).toBeInTheDocument();
    expect(screen.getByText('بسته شده')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'باشگاه مشتریان' }));
    expect(screen.getByText('وضعیت باشگاه مشتریان')).toBeInTheDocument();
    expect(screen.getByText(/سطح: طلایی/)).toBeInTheDocument();
  });
});
