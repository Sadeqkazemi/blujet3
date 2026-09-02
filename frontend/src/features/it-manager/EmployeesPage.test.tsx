import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeesPage from './EmployeesPage';
import * as itApi from '../../api/it-manager';
import type { EmployeeDetail, EmployeeListRow, PermissionCatalog } from '../../types/it-manager';

const EMPLOYEES: EmployeeListRow[] = [
  {
    id: 'e1',
    fullName: 'رضا کاظمی',
    username: 'reza.kazemi',
    dept: 'commercial',
    rank: 'کارشناس',
    isActive: true,
    lastLoginAt: '2026-07-17T08:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

const DETAIL: EmployeeDetail = {
  ...EMPLOYEES[0],
  phone: '+989121234567',
  referralScope: 'MANAGERS_ONLY',
  mustChangePassword: false,
  permissions: [{ key: 'ag_list', labelFa: 'مشاهدهٔ فهرست آژانس‌ها', sectionLabelFa: 'مدیریت آژانس‌ها' }],
  available: [{ key: 'fl_view', labelFa: 'مشاهدهٔ پروازها' }],
};

const CATALOG: PermissionCatalog = {
  commercial: [
    { sectionKey: 'agencies', sectionLabelFa: 'مدیریت آژانس‌ها', perms: [{ key: 'ag_list', labelFa: 'مشاهدهٔ فهرست آژانس‌ها' }] },
  ],
};

const GRANULAR_CATALOG: PermissionCatalog = {
  commercial: [
    {
      sectionKey: 'routes',
      sectionLabelFa: 'مسیرهای پروازی',
      perms: [
        { key: 'rt_view', labelFa: 'مشاهده مسیرهای پروازی' },
        { key: 'rt_create', labelFa: 'افزودن مسیر پروازی' },
        { key: 'rt_manage', labelFa: 'مدیریت مسیرهای فعال' },
      ],
    },
    {
      sectionKey: 'flights',
      sectionLabelFa: 'مدیریت پروازها',
      perms: [{ key: 'fl_add', labelFa: 'افزودن پرواز' }],
    },
    {
      sectionKey: 'reports',
      sectionLabelFa: 'گزارش‌ها',
      perms: [{ key: 'rp_passengers', labelFa: 'گزارش مسافران' }],
    },
    {
      sectionKey: 'webservice',
      sectionLabelFa: 'وب‌سرویس',
      perms: [{ key: 'ws_manage', labelFa: 'مدیریت وب‌سرویس‌ها' }],
    },
  ],
  finance: [
    {
      sectionKey: 'credit',
      sectionLabelFa: 'اعتبار و تسویه',
      perms: [{ key: 'cr_manage', labelFa: 'مدیریت اعتبار و تسویه آژانس‌ها' }],
    },
    {
      sectionKey: 'reports',
      sectionLabelFa: 'گزارش‌ها و خروجی',
      perms: [{ key: 'rp_exports', labelFa: 'گزارش‌ها و خروجی‌ها' }],
    },
  ],
  it: [
    {
      sectionKey: 'users',
      sectionLabelFa: 'مدیریت کاربران',
      perms: [{ key: 'us_permissions', labelFa: 'مدیریت دسترسی کاربران' }],
    },
  ],
};

describe('EmployeesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the reference access matrix and IT scope next to the real empty state', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue({});

    render(<EmployeesPage />);

    expect(await screen.findAllByText('کارمندی ثبت نشده است.')).not.toHaveLength(0);
    expect(screen.getByText('دسترسی و سطوح کارمندان')).toBeInTheDocument();
    expect(screen.getByText('سطح دسترسی واحد IT')).toBeInTheDocument();
    expect(screen.getByText('مدیریت کاربران و حساب‌ها')).toBeInTheDocument();
  });

  it('renders the employee list and validates the create form (short password)', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue(EMPLOYEES);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    const createSpy = vi.spyOn(itApi, 'createEmployee');

    render(<EmployeesPage />);
    expect(await screen.findByRole('button', { name: 'رضا کاظمی' })).toBeInTheDocument();
    expect(screen.getAllByText('فعال').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارمند جدید');
    await user.type(screen.getByLabelText('نام کاربری'), 'new.user');
    await user.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), '123');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('رمز عبور باید حداقل ۶ کاراکتر باشد');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('requires a valid Iranian mobile before creating an employee', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    const createSpy = vi.spyOn(itApi, 'createEmployee');
    render(<EmployeesPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارمند جدید');
    await user.type(screen.getByLabelText('نام کاربری'), 'new.employee');
    await user.type(screen.getByLabelText('شماره موبایل'), '0912');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), 'Assigned@1405');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('شماره موبایل معتبر وارد کنید');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('detail modal shows granted + available permissions and grants a new one', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue(EMPLOYEES);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    vi.spyOn(itApi, 'fetchEmployee').mockResolvedValue(DETAIL);
    const grantSpy = vi.spyOn(itApi, 'setEmployeePermission').mockResolvedValue({
      ...DETAIL,
      permissions: [...DETAIL.permissions, { key: 'fl_view', labelFa: 'مشاهدهٔ پروازها', sectionLabelFa: 'مدیریت پروازها' }],
      available: [],
    });

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'رضا کاظمی' }));

    expect(await screen.findByText('مشاهدهٔ فهرست آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByText('+ مشاهدهٔ پروازها')).toBeInTheDocument();

    await user.click(screen.getByText('+ مشاهدهٔ پروازها'));
    await waitFor(() => expect(grantSpy).toHaveBeenCalledWith('e1', 'fl_view', true));
  });

  it('shows suspend confirmation before deactivating an employee', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue(EMPLOYEES);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    const statusSpy = vi.spyOn(itApi, 'setEmployeeStatus').mockResolvedValue({ id: 'e1', isActive: false });

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تعلیق' }));
    expect(screen.getByText(/آیا حساب «رضا کاظمی» معلق شود/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تعلیق حساب' }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith('e1', false));
  });

  it('requires confirmation and archives an employee account', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue(EMPLOYEES);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    const removeSpy = vi.spyOn(itApi, 'removeEmployee').mockResolvedValue({
      id: 'e1',
      deletedAt: '2026-08-13T12:00:00.000Z',
    });

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'حذف' }));

    expect(screen.getByRole('dialog', { name: 'حذف حساب کارمند' })).toBeInTheDocument();
    expect(screen.getByText(/سوابق مالی و لاگ‌های امنیتی/)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'حذف و بایگانی حساب' }));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText(/حذف و بایگانی شد/)).toBeInTheDocument();
  });

  it('creates a custom organizational unit in the add-user form', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));
    await user.click(screen.getByRole('button', { name: '+ ایجاد واحد سازمانی جدید' }));
    await user.type(screen.getByPlaceholderText('نام واحد جدید (مثلاً بازاریابی)'), 'بازاریابی');
    await user.click(screen.getByRole('button', { name: 'افزودن' }));
    expect(screen.getByRole('button', { name: /بازاریابی/ })).toBeInTheDocument();
  });

  it('shows the reference add-user form inline and then shows the assigned credentials', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    vi.spyOn(itApi, 'createEmployee').mockResolvedValue({
      ...DETAIL,
      id: 'created-1',
      fullName: 'کارمند تازه',
      username: 'fresh.user',
    });

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));
    expect(screen.getByTestId('inline-create-employee')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'ایجاد کارمند جدید' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارمند تازه');
    await user.type(screen.getByLabelText('نام کاربری'), 'fresh.user');
    await user.type(screen.getByLabelText('شماره موبایل'), '۰۹۱۲۱۲۳۴۵۶۷');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), 'Assigned@1405');
    await user.click(screen.getByLabelText('مشاهدهٔ فهرست آژانس‌ها'));
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    expect(await screen.findByRole('dialog', { name: 'اطلاعات ورود کارمند' })).toBeInTheDocument();
    expect(screen.getByText('fresh.user')).toBeInTheDocument();
    expect(screen.getByText('۰۹۱۲۱۲۳۴۵۶۷')).toBeInTheDocument();
    expect(screen.getByText('Assigned@1405')).toBeInTheDocument();
    expect(itApi.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '09121234567' }),
    );
  });

  it('identifies each unit manager and clears stale permissions when the unit changes', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue({
      ...CATALOG,
      finance: [
        { sectionKey: 'refund', sectionLabelFa: 'استرداد بلیط', perms: [{ key: 'rf_list', labelFa: 'مشاهده درخواست‌ها' }] },
      ],
    });
    const createSpy = vi.spyOn(itApi, 'createEmployee').mockResolvedValue(DETAIL);
    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));

    expect(screen.getAllByText('زیرمجموعه مدیر بازرگانی')).toHaveLength(2);
    expect(screen.getByText('زیرمجموعه مدیر مالی')).toBeInTheDocument();
    await user.click(screen.getByLabelText('مشاهدهٔ فهرست آژانس‌ها'));
    await user.click(screen.getByRole('button', { name: /واحد مالی/ }));
    await user.click(screen.getByLabelText('مشاهده درخواست‌ها'));
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارمند مالی');
    await user.type(screen.getByLabelText('نام کاربری'), 'finance.employee');
    await user.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), 'Assigned@1405');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dept: 'finance', permissionKeys: ['rf_list'] }),
    );
  });

  it('does not create a catalog-backed employee until at least one explicit permission is selected', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(CATALOG);
    const createSpy = vi.spyOn(itApi, 'createEmployee');
    render(<EmployeesPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارمند بدون دسترسی');
    await user.type(screen.getByLabelText('نام کاربری'), 'no.permission');
    await user.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), 'Assigned@1405');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('حداقل یک دسترسی');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('shows the requested action-level groups and submits selected granular permissions', async () => {
    vi.spyOn(itApi, 'fetchEmployees').mockResolvedValue([]);
    vi.spyOn(itApi, 'fetchPermissionCatalog').mockResolvedValue(GRANULAR_CATALOG);
    const createSpy = vi.spyOn(itApi, 'createEmployee').mockResolvedValue(DETAIL);

    render(<EmployeesPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن کاربر' }));

    expect(screen.getByText('مسیرهای پروازی')).toBeInTheDocument();
    expect(screen.getByLabelText('افزودن مسیر پروازی')).toBeInTheDocument();
    expect(screen.getByLabelText('گزارش مسافران')).toBeInTheDocument();
    expect(screen.getByLabelText('مدیریت وب‌سرویس‌ها')).toBeInTheDocument();

    await user.click(screen.getByLabelText('افزودن مسیر پروازی'));
    await user.click(screen.getByLabelText('گزارش مسافران'));
    await user.type(screen.getByLabelText('نام و نام خانوادگی'), 'کارشناس پرواز');
    await user.type(screen.getByLabelText('نام کاربری'), 'flight.staff');
    await user.type(screen.getByLabelText('شماره موبایل'), '09121234567');
    await user.type(screen.getByLabelText('رمز عبور اولیه'), 'Assigned@1405');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionKeys: expect.arrayContaining(['rt_create', 'rt_view', 'rp_passengers']),
        }),
      ),
    );
  });
});
