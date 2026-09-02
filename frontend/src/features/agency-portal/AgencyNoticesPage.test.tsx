import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgencyNoticesPage from './AgencyNoticesPage';
import * as notificationsApi from '../../api/notifications';
import * as localeHook from '../../hooks/useLocale';
import type { NotificationRow } from '../../types/notifications';

const notification: NotificationRow = {
  id: 'notification-1',
  recipientId: 'agency-1',
  category: 'SYSTEM',
  action: 'CREATED',
  title: 'اصلاح ساعت پرواز',
  body: 'ساعت پرواز شما به ۱۰:۳۰ تغییر کرد.',
  entityType: 'AgencySeatRequest',
  entityId: 'request-1',
  dedupeKey: null,
  readAt: null,
  createdAt: '2026-08-27T08:00:00.000Z',
};

beforeEach(() => {
  vi.spyOn(localeHook, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
  vi.spyOn(notificationsApi, 'fetchNotifications').mockResolvedValue([{
    ...notification,
    entityType: 'AGENCY_BULLETIN',
    action: 'AGENCY_NOTICE_PUBLISHED',
  }]);
  vi.spyOn(notificationsApi, 'markNotificationRead').mockResolvedValue({
    ...notification,
    readAt: '2026-08-28T08:00:00.000Z',
  });
});
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  return render(<MemoryRouter><AgencyNoticesPage /></MemoryRouter>);
}

describe('AgencyNoticesPage', () => {
  it('shows only recipient-scoped site-admin bulletins without deriving notices from flight availability', async () => {
    vi.mocked(notificationsApi.fetchNotifications).mockResolvedValueOnce([
      { ...notification, id: 'flight-noise', entityType: 'FlightInstance', title: 'پرواز جدید XY1235' },
      { ...notification, id: 'workflow-noise', entityType: 'AgencySeatRequest', title: 'پیام فرایندی' },
      { ...notification, entityType: 'AGENCY_BULLETIN', action: 'AGENCY_NOTICE_PUBLISHED' },
    ]);
    renderPage();

    expect(await screen.findByText('اصلاح ساعت پرواز')).toBeInTheDocument();
    expect(screen.queryByText('پرواز جدید XY1235')).not.toBeInTheDocument();
    expect(screen.queryByText('پیام فرایندی')).not.toBeInTheDocument();
    expect(notificationsApi.fetchNotifications).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });

  it('opens the full site-admin bulletin dispatched to this agency', async () => {
    vi.mocked(notificationsApi.fetchNotifications).mockResolvedValueOnce([{
      ...notification,
      entityType: 'AGENCY_BULLETIN',
      entityId: 'dispatch-notice-1',
      action: 'AGENCY_NOTICE_PUBLISHED',
      title: 'مدارک فروش مرداد',
      body: 'لطفاً فایل تسویه را تا پایان روز ارسال کنید.',
    }]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /مدارک فروش مرداد/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('لطفاً فایل تسویه را تا پایان روز ارسال کنید.')).toBeInTheDocument();
  });

  it('marks an unread agency notification as read when opened', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = await screen.findByRole('button', { name: /اصلاح ساعت پرواز/ });
    expect(row).toHaveTextContent('خوانده‌نشده');
    await user.click(row);

    await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('notification-1'));
    expect(screen.getByRole('dialog')).toHaveTextContent('ساعت پرواز شما به ۱۰:۳۰ تغییر کرد.');
  });

  it('classifies a targeted site-admin dispatch as an admin amendment and opens it', async () => {
    vi.mocked(notificationsApi.fetchNotifications).mockResolvedValueOnce([{
      ...notification,
      entityType: 'AGENCY_BULLETIN',
      entityId: 'dispatch-1',
      action: 'AGENCY_AMENDMENT_PUBLISHED',
      title: 'اصلاحیه ساعت پرواز',
      body: 'ساعت پرواز XY1235 اصلاح شد.',
    }]);
    renderPage();
    const user = userEvent.setup();

    const row = await screen.findByRole('button', { name: /اصلاحیه ساعت پرواز/ });
    expect(row).toHaveTextContent('اصلاحیه ادمین');
    await user.click(row);
    expect(screen.getByRole('dialog')).toHaveTextContent('ساعت پرواز XY1235 اصلاح شد.');
  });

  it('filters the list and keeps partial results when one source fails', async () => {
    vi.mocked(notificationsApi.fetchNotifications).mockRejectedValueOnce(new Error('offline'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت اطلاعیه‌ها انجام نشد');
  });

  it('shows exactly ten records per page and paginates the remaining agency notices', async () => {
    vi.mocked(notificationsApi.fetchNotifications).mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, index) => ({
        ...notification,
        id: `notification-${index + 1}`,
        entityType: 'AGENCY_BULLETIN',
        entityId: `dispatch-${index + 1}`,
        action: 'AGENCY_NOTICE_PUBLISHED',
        title: `اطلاعیه شماره ${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 7, 29, 12, 0, index)).toISOString(),
      })),
    );
    renderPage();
    const user = userEvent.setup();

    const list = await screen.findByTestId('agency-notices-list');
    expect(within(list).getAllByRole('button')).toHaveLength(10);
    expect(within(list).getByText('اطلاعیه شماره 12')).toBeInTheDocument();
    expect(within(list).queryByText('اطلاعیه شماره 2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('اطلاعیه شماره 2')).toBeInTheDocument();
  });
});
