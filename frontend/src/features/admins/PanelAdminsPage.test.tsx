import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PanelAdminsPage from './PanelAdminsPage';
import * as adminsApi from '../../api/admins';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { AdminRow } from '../../types/admins';

const ROWS: AdminRow[] = [
  {
    id: 'a1',
    fullName: 'مدیر مالی نمونه',
    username: 'finance.sample',
    email: 'finance@blujet.example',
    role: 'FINANCE_MANAGER',
    roleLabelFa: 'مدیر مالی',
    lastLoginAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    isActive: true,
    online: true,
    managedByCaller: true,
    permissions: ['reports', 'finance', 'refunds'],
  },
];

describe('PanelAdminsPage', () => {
  beforeEach(() => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUserWithRole('SENIOR_MANAGER'),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
  });
  it('renders real admin list from API with dark panel layout', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue(ROWS);
    render(<PanelAdminsPage />);

    expect(await screen.findByText('مدیر مالی نمونه')).toBeInTheDocument();
    expect(screen.getByText('آنلاین')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'مدیران' })).toBeInTheDocument();
    expect(screen.queryByText('حسین صادقی')).not.toBeInTheDocument();
  });

  it('shows empty state when no admins exist', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue([]);
    render(<PanelAdminsPage />);
    expect(
      await screen.findByText('هنوز اطلاعاتی وارد نشده است.'),
    ).toBeInTheDocument();
  });

  it('opens detail view with permissions and security sections', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue(ROWS);
    vi.spyOn(adminsApi, 'resetAdminPassword').mockResolvedValue({
      tempPassword: 'Tmp-1234-Xy',
    });
    render(<PanelAdminsPage />);

    await userEvent.click(await screen.findByText('مدیر مالی نمونه'));
    expect(await screen.findByText('سطح دسترسی')).toBeInTheDocument();
    expect(screen.getByText('امنیت و دسترسی ورود')).toBeInTheDocument();
    expect(screen.getByText('مدیریت پروازها')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'مسدودسازی ورود به پنل' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'تولید رمز' }));
    expect(screen.getByText('پیشنهاد:')).toBeInTheDocument();
  });

  it('validates add-admin form before calling API', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue([]);
    const createSpy = vi.spyOn(adminsApi, 'createAdmin');
    render(<PanelAdminsPage />);
    await screen.findByText('هنوز اطلاعاتی وارد نشده است.');

    await userEvent.click(
      screen.getByRole('button', { name: 'افزودن مدیر / ادمین' }),
    );
    expect(screen.getByText('مدیران و ادمین‌ها')).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText(/نام و نام خانوادگی/),
      'مدیر تازه',
    );
    await userEvent.type(
      screen.getByLabelText(/ایمیل سازمانی/),
      'new@blujet.example',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'افزودن و تعیین دسترسی' }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('matches the senior-manager reference permissions and hides the senior role from its own create form', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue([]);
    render(<PanelAdminsPage />);
    await screen.findByText('هنوز اطلاعاتی وارد نشده است.');

    await userEvent.click(screen.getByRole('button', { name: 'افزودن مدیر / ادمین' }));

    expect(screen.queryByLabelText(/رمز عبور ورود/)).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'داشبورد' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'اولویت‌های راهبردی' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'تأیید درخواست‌ها' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'کارتابل' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'مدیران و ادمین‌ها' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'مدیر ارشد' })).not.toBeInTheDocument();
  });

  it('applies role permission presets when role changes', async () => {
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue([]);
    render(<PanelAdminsPage />);
    await screen.findByText('هنوز اطلاعاتی وارد نشده است.');

    await userEvent.click(
      screen.getByRole('button', { name: 'افزودن مدیر / ادمین' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/نقش \/ سطح دسترسی/),
      'FINANCE_MANAGER',
    );

    expect(
      screen.getByRole('switch', { name: 'مالی و تسویه' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('switch', { name: 'مدیریت پروازها' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('lets the Board Chair open the connected manager-creation form', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUserWithRole('BOARD_CHAIR'),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(adminsApi, 'fetchAdmins').mockResolvedValue([]);

    render(<PanelAdminsPage />);
    await screen.findByText('هنوز اطلاعاتی وارد نشده است.');
    await userEvent.click(screen.getByRole('button', { name: 'افزودن مدیر / ادمین' }));

    expect(screen.getByText('مدیران و ادمین‌ها')).toBeInTheDocument();
    expect(screen.getByLabelText(/نقش \/ سطح دسترسی/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'افزودن و تعیین دسترسی' })).toBeInTheDocument();
  });
});
