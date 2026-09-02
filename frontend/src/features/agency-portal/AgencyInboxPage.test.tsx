import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyInboxPage from './AgencyInboxPage';
import * as portalApi from '../../api/agency-portal';
import * as supportTicketsApi from '../../api/support-tickets';
import * as useLocaleModule from '../../hooks/useLocale';
import type { AgencyMessage } from '../../types/agency-portal';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const MESSAGES: AgencyMessage[] = [
  {
    id: 'm1',
    senderId: 'staff1',
    senderIsAgency: false,
    body: 'لطفاً فاکتور را تسویه بفرمایید.',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('AgencyInboxPage', () => {
  beforeEach(() => {
    vi.spyOn(supportTicketsApi, 'fetchMySupportTickets').mockResolvedValue([]);
  });

  it('renders the thread and sends a reply', async () => {
    vi.spyOn(portalApi, 'fetchInbox').mockResolvedValue(MESSAGES);
    const postSpy = vi.spyOn(portalApi, 'postInboxMessage').mockResolvedValue({
      id: 'm2',
      senderId: 'agency1',
      senderIsAgency: true,
      body: 'حتماً تا پنجشنبه پرداخت می‌شود.',
      createdAt: '2026-07-02T00:00:00.000Z',
    });

    render(<AgencyInboxPage />);
    expect(await screen.findByTestId('support-conversation-center')).toHaveAttribute('data-theme', 'light');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مکاتبات بازرگانی/ }));
    expect(screen.getByTestId('agency-commercial-inbox')).toBeInTheDocument();
    expect((await screen.findAllByText('لطفاً فاکتور را تسویه بفرمایید.')).length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText('پاسخ خود را بنویسید…'), 'حتماً تا پنجشنبه پرداخت می‌شود.');
    await user.click(screen.getByRole('button', { name: 'ارسال' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'موضوع: پیام مدیریت\n\nحتماً تا پنجشنبه پرداخت می‌شود.',
      [],
    ));
  });

  it('renders translated heading, placeholder, and send button in English', async () => {
    mockLocale('en');
    vi.spyOn(portalApi, 'fetchInbox').mockResolvedValue(MESSAGES);
    render(<AgencyInboxPage />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /New message/ }));
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    expect(screen.getByPlaceholderText('Write your message…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('renders translated heading and empty state in Arabic', async () => {
    mockLocale('ar');
    vi.spyOn(portalApi, 'fetchInbox').mockResolvedValue([]);
    render(<AgencyInboxPage />);

    await userEvent.click(await screen.findByRole('button', { name: /المراسلات التجارية/ }));
    expect(await screen.findByText('لا توجد رسائل بعد.')).toBeInTheDocument();
  });

  it('submits a support ticket through New message and shows its tracking code', async () => {
    vi.spyOn(portalApi, 'fetchInbox').mockResolvedValue([]);
    const submit = vi.spyOn(supportTicketsApi, 'submitMySupportTicket').mockResolvedValue({
      id: 'ticket-1',
      trackingCode: 'TKABC12345',
    });

    render(<AgencyInboxPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /پیام جدید/ }));

    const dialog = screen.getByRole('dialog', { name: 'پیام جدید' });
    await user.click(within(dialog).getByRole('button', { name: 'ارسال' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('نام، شماره تماس معتبر، موضوع و متن پیام را کامل کنید.');
    expect(submit).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('نام درخواست‌کننده'), 'آژانس آزمون');
    await user.type(within(dialog).getByLabelText('شماره تماس'), '09121234567');
    await user.type(within(dialog).getByLabelText('موضوع'), 'خطا در صدور بلیط');
    await user.type(within(dialog).getByLabelText('پیام خود را بنویسید…'), 'پس از پرداخت بلیط صادر نشد.');
    await user.click(within(dialog).getByRole('button', { name: 'ارسال' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      requesterName: 'آژانس آزمون',
      requesterPhone: '09121234567',
      subject: 'خطا در صدور بلیط',
      body: 'پس از پرداخت بلیط صادر نشد.',
      attachmentIds: [],
    }));
    expect(await screen.findByText(/TKABC12345/)).toBeInTheDocument();
  });
});
