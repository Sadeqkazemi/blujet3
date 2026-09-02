import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CartablePage from './CartablePage';
import * as cartableApi from '../../api/cartable';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { CartableListResult } from '../../types/cartable';
import type { Role } from '../../types/auth';

const LIST: CartableListResult = {
  tasks: [
    {
      id: 't1',
      category: 'MANAGER',
      title: 'درخواست گزارش فروش سه‌ماهه',
      description: 'گزارش تفکیکی ارسال شود.',
      senderLabelFa: 'محمد رحیمی · مدیر ارشد',
      sender: null,
      sourceType: 'MANAGER_REFERRAL',
      sourceId: 'r1',
      status: 'OPEN',
      resolutionNote: null,
      createdAt: '2026-07-16T10:00:00.000Z',
    },
  ],
  counts: { ADMIN: 2, AGENCY: 1, MANAGER: 1 },
  totalOpen: 4,
  statusCounts: { OPEN: 4, APPROVED: 2, REJECTED: 1, TRANSFERRED: 1 },
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

function renderPage() {
  return render(
    <MemoryRouter>
      <CartablePage />
    </MemoryRouter>,
  );
}

describe('CartablePage', () => {
  it('renders KPI filter cards, count pill, task rows and the compose button', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'کارتابل داخلی' })).toBeInTheDocument();
    expect(screen.getByText('گردش کارهای سازمانی و پیام‌های داخلی در انتظار اقدام شما')).toBeInTheDocument();
    expect(screen.getByText(/درخواست اداری/)).toBeInTheDocument();
    expect(screen.getByText(/همکاری آژانس/)).toBeInTheDocument();
    expect(screen.getByText(/درخواست مدیران/)).toBeInTheDocument();
    expect(screen.getByText('۴ مورد')).toBeInTheDocument();
    expect(screen.getByText('کارتابل من')).toBeInTheDocument();
    expect(screen.getByText('درخواست گزارش فروش سه‌ماهه')).toBeInTheDocument();
    expect(screen.getByText('ارسال از: محمد رحیمی · مدیر ارشد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ایجاد پیام' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'جستجو در کارتابل داخلی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /کارهای باز.*۴/ })).toBeInTheDocument();
    // CEO never sees the chairman gate.
    expect(screen.queryByText('ارجاع و ارسال گزارش به رئیس هیئت مدیره')).not.toBeInTheDocument();
  });

  it('searches only the loaded internal cartable rows', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    const { default: userEvent } = await import('@testing-library/user-event');

    renderPage();
    const search = await screen.findByRole('searchbox', { name: 'جستجو در کارتابل داخلی' });
    await userEvent.type(search, 'عبارت ناموجود');

    expect(screen.queryByText('درخواست گزارش فروش سه‌ماهه')).not.toBeInTheDocument();
    expect(screen.getByText('موردی با این جستجو یافت نشد.')).toBeInTheDocument();
  });

  it('BOARD_CHAIR loads and can act on assigned cartable tasks', async () => {
    mockRole('BOARD_CHAIR');
    const listSpy = vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('درخواست گزارش فروش سه‌ماهه')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بررسی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ایجاد پیام' })).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalled();
  });

  it('loads resolved cartable rows when a status filter is selected', async () => {
    mockRole('CEO');
    const listSpy = vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    const { default: userEvent } = await import('@testing-library/user-event');

    renderPage();
    await screen.findByText('درخواست گزارش فروش سه‌ماهه');
    await userEvent.click(screen.getByRole('button', { name: /تأییدشده.*۲/ }));

    await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'APPROVED' })));
  });

  it('uses the same dark organized cartable for IT manager', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();
    expect(await screen.findByRole('heading', { name: 'کارتابل داخلی' })).toBeInTheDocument();
    expect(screen.getByText('گردش کارهای سازمانی و پیام‌های داخلی در انتظار اقدام شما')).toBeInTheDocument();
  });

  it('Finance Manager sees the chairman-permission gate with the request button', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchChairPermission').mockResolvedValue(null);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('ارجاع و ارسال گزارش به رئیس هیئت مدیره')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست مجوز از رئیس هیئت مدیره' })).toBeInTheDocument();
  });

  it('the review modal requires a manager note before deciding', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    vi.spyOn(cartableApi, 'fetchCartableTask').mockResolvedValue({
      ...LIST.tasks[0],
      history: [
        {
          id: 'h1',
          action: 'ارسال پیام مدیر',
          detail: 'گزارش تفکیکی ارسال شود.',
          actorLabel: 'محمد رحیمی · مدیر ارشد',
          actorRole: 'SENIOR_MANAGER',
          createdAt: '2026-07-16T10:00:00.000Z',
        },
      ],
    });
    const approve = vi.spyOn(cartableApi, 'approveCartableTask').mockResolvedValue(LIST.tasks[0]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'بررسی' }));

    expect(await screen.findByRole('region', { name: 'تاریخچه پیام‌ها و اقدامات' })).toHaveTextContent(
      'ارسال پیام مدیر',
    );

    await userEvent.click(screen.getByRole('button', { name: 'تأیید' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('برای ثبت تصمیم، درج نظر مدیر الزامی است.');
    expect(approve).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('نظر مدیر *'), 'تأیید می‌شود');
    await userEvent.click(screen.getByRole('button', { name: 'تأیید' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('t1', 'تأیید می‌شود'));
    expect(await screen.findByText('درخواست تأیید شد ✓')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'بررسی درخواست' })).not.toBeInTheDocument());
  });

  it('the transfer button stays disabled until a target manager is picked', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([
      { id: 's1', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER', roleLabelFa: 'مدیر مالی' },
    ]);
    const transfer = vi.spyOn(cartableApi, 'transferCartableTask').mockResolvedValue(LIST.tasks[0]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'بررسی' }));

    const transferButton = screen.getByRole('button', { name: 'انتقال' });
    expect(transferButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText('نظر مدیر *'), 'به مالی');
    await userEvent.selectOptions(screen.getByLabelText('انتقال به مدیر دیگر (اختیاری)'), 's1');
    expect(transferButton).toBeEnabled();
    await userEvent.click(transferButton);
    await waitFor(() => expect(transfer).toHaveBeenCalledWith('t1', 's1', 'به مالی'));
  });

  it('shows the empty state when the cartable is empty', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();
    expect(await screen.findByText('کارتابل خالی است ✓')).toBeInTheDocument();
  });

  it('the compose modal validates required fields with the design message', async () => {
    mockRole('CEO');
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    const send = vi.spyOn(cartableApi, 'sendManagerMessage');

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'ایجاد پیام' }));

    await userEvent.click(screen.getByRole('button', { name: 'ارسال پیام' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('گیرنده، موضوع و متن پیام الزامی است.');
    expect(send).not.toHaveBeenCalled();
  });

  it('SITE_ADMIN dark layout shows category KPIs, create message and 10/page', async () => {
    mockRole('SITE_ADMIN');
    const manyTasks = Array.from({ length: 12 }, (_, i) => ({
      ...LIST.tasks[0],
      id: `t${i + 1}`,
      title: `وظیفه ${i + 1}`,
    }));
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: manyTasks,
      counts: { ADMIN: 2, AGENCY: 2, MANAGER: 2 },
      totalOpen: 12,
    });
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    expect(await screen.findByRole('heading', { name: 'کارتابل داخلی' })).toBeInTheDocument();
    expect(screen.getByText('گردش کارهای سازمانی و پیام‌های داخلی در انتظار اقدام شما')).toBeInTheDocument();
    expect(screen.getByText('۲ درخواست اداری')).toBeInTheDocument();
    expect(screen.getByText('۲ همکاری آژانس')).toBeInTheDocument();
    expect(screen.getByText('۲ درخواست مدیران')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ایجاد پیام/ })).toBeInTheDocument();
    expect(screen.getByText('وظیفه 1')).toBeInTheDocument();
    expect(screen.getByText('وظیفه 10')).toBeInTheDocument();
    expect(screen.queryByText('وظیفه 11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(await screen.findByText('وظیفه 11')).toBeInTheDocument();
  });
});
