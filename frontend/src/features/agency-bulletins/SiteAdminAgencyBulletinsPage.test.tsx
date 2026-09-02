import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/agency-bulletins';
import SiteAdminAgencyBulletinsPage from './SiteAdminAgencyBulletinsPage';

const recipients = [
  { id: 'a1', fullName: 'آژانس اول', managerName: 'مدیر اول', city: 'تهران' },
  { id: 'a2', fullName: 'آژانس دوم', managerName: 'مدیر دوم', city: 'شیراز' },
];

beforeEach(() => {
  vi.spyOn(api, 'fetchAgencyBulletinRecipients').mockResolvedValue(recipients);
  vi.spyOn(api, 'fetchAgencyBulletinHistory').mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe('SiteAdminAgencyBulletinsPage', () => {
  it('sends a notice to all active agencies', async () => {
    const create = vi.spyOn(api, 'createAgencyBulletin').mockResolvedValue({
      id: 'dispatch-1',
      kind: 'NOTICE',
      title: 'پرواز جدید',
      body: 'دستورالعمل فروش پرواز جدید',
      recipientCount: 2,
      readCount: 0,
      createdAt: '2026-08-28T08:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<SiteAdminAgencyBulletinsPage />);

    await screen.findByText(/تعداد گیرندگان:/);
    await user.type(screen.getByPlaceholderText('عنوان اطلاعیه یا اصلاحیه…'), 'پرواز جدید');
    await user.type(screen.getByPlaceholderText('متن پیام را کامل بنویسید…'), 'دستورالعمل فروش پرواز جدید');
    await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      kind: 'NOTICE',
      title: 'پرواز جدید',
      body: 'دستورالعمل فروش پرواز جدید',
      audienceMode: 'ALL',
      recipientIds: undefined,
    }));
    expect(await screen.findByText('پیام برای ۲ آژانس ارسال شد ✓')).toBeInTheDocument();
  });

  it('sends an amendment to one exact selected agency', async () => {
    const create = vi.spyOn(api, 'createAgencyBulletin').mockResolvedValue({
      id: 'dispatch-2',
      kind: 'AMENDMENT',
      title: 'اصلاح ساعت',
      body: 'ساعت پرواز اصلاح شد.',
      recipientCount: 1,
      readCount: 0,
      createdAt: '2026-08-28T09:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<SiteAdminAgencyBulletinsPage />);

    await user.click(await screen.findByRole('button', { name: 'اصلاحیه' }));
    await user.click(screen.getByRole('button', { name: 'یک آژانس' }));
    await user.click(screen.getByRole('button', { name: /آژانس دوم/ }));
    await user.type(screen.getByPlaceholderText('عنوان اطلاعیه یا اصلاحیه…'), 'اصلاح ساعت');
    await user.type(screen.getByPlaceholderText('متن پیام را کامل بنویسید…'), 'ساعت پرواز اصلاح شد.');
    await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'AMENDMENT',
      audienceMode: 'SELECTED',
      recipientIds: ['a2'],
    })));
  });

  it('sends to an exact selected set of agencies', async () => {
    const create = vi.spyOn(api, 'createAgencyBulletin').mockResolvedValue({
      id: 'dispatch-3',
      kind: 'NOTICE',
      title: 'دستورالعمل فروش',
      body: 'متن دستورالعمل فروش پرواز جدید',
      recipientCount: 2,
      createdAt: '2026-08-28T10:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<SiteAdminAgencyBulletinsPage />);

    await user.click(await screen.findByRole('button', { name: 'چند آژانس' }));
    await user.click(screen.getByRole('button', { name: /آژانس اول/ }));
    await user.click(screen.getByRole('button', { name: /آژانس دوم/ }));
    await user.type(screen.getByPlaceholderText('عنوان اطلاعیه یا اصلاحیه…'), 'دستورالعمل فروش');
    await user.type(screen.getByPlaceholderText('متن پیام را کامل بنویسید…'), 'متن دستورالعمل فروش پرواز جدید');
    await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      audienceMode: 'SELECTED',
      recipientIds: ['a1', 'a2'],
    })));
  });

  it('shows persisted recipient and read counts in send history', async () => {
    vi.mocked(api.fetchAgencyBulletinHistory).mockResolvedValueOnce([{
      id: 'dispatch-history',
      kind: 'NOTICE',
      title: 'اطلاعیه ثبت‌شده',
      body: 'متن ذخیره‌شده',
      recipientCount: 2,
      readCount: 1,
      createdAt: '2026-08-28T08:00:00.000Z',
    }]);

    render(<SiteAdminAgencyBulletinsPage />);

    expect(await screen.findByText('اطلاعیه ثبت‌شده')).toBeInTheDocument();
    expect(screen.getByText('۲ گیرنده · ۱ خوانده‌شده')).toBeInTheDocument();
  });
});
