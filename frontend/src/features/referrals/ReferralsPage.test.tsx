import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReferralsPage from './ReferralsPage';
import * as cartableApi from '../../api/cartable';
import * as filesApi from '../../api/files';
import type { Referral, ReferralListResult } from '../../types/cartable';

afterEach(() => {
  vi.restoreAllMocks();
});

const REFERRAL: Referral = {
  id: 'r1',
  title: 'درخواست گزارش فروش سه‌ماهه',
  body: 'گزارش تفکیکی ارسال شود.',
  priority: 'HIGH',
  dueAt: '2026-07-25T00:00:00.000Z',
  status: 'REPORTED',
  createdAt: '2026-07-16T08:00:00.000Z',
  recipients: [{ recipientId: 'u2', recipient: { id: 'u2', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER' } }],
  attachments: [],
};

const LIST: ReferralListResult = {
  referrals: [REFERRAL],
  kpis: { total: 4, awaitingReport: 2, reported: 1, closed: 1 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ReferralsPage />
    </MemoryRouter>,
  );
}

describe('ReferralsPage', () => {
  it('renders the 4 KPI cards and the table with status/priority labels and Jalali dates', async () => {
    vi.spyOn(cartableApi, 'fetchReferrals').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('کل ارجاعات')).toBeInTheDocument();
    expect(screen.getByText('در انتظار گزارش')).toBeInTheDocument();
    expect(screen.getByText('گزارش دریافت‌شده')).toBeInTheDocument();
    expect(screen.getByText('بسته‌شده')).toBeInTheDocument();

    expect(screen.getByText('درخواست گزارش فروش سه‌ماهه')).toBeInTheDocument();
    expect(screen.getByText('گزارش دریافت‌شد')).toBeInTheDocument();
    expect(screen.getByText('بالا')).toBeInTheDocument();
    // No raw ISO date leaks into the table.
    expect(screen.queryByText(/2026-07/)).not.toBeInTheDocument();
  });

  it('the creation modal requires title, body and at least one recipient', async () => {
    vi.spyOn(cartableApi, 'fetchReferrals').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([
      { id: 's1', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER', roleLabelFa: 'مدیر مالی' },
    ]);
    const create = vi.spyOn(cartableApi, 'createReferral').mockResolvedValue(REFERRAL);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'ایجاد ارجاع جدید' }));
    await userEvent.click(screen.getByRole('button', { name: 'ارسال ارجاع' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'موضوع، شرح درخواست و حداقل یک مدیر مقصد الزامی است.',
    );
    expect(create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('موضوع ارجاع *'), 'موضوع تست');
    await userEvent.type(screen.getByLabelText('شرح درخواست *'), 'شرح تست');
    await userEvent.click(screen.getByRole('button', { name: 'سحر کاظمی — مدیر مالی' }));
    await userEvent.click(screen.getByRole('button', { name: 'ارسال ارجاع' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'موضوع تست', body: 'شرح تست', recipientIds: ['s1'] }),
      ),
    );
    expect(await screen.findByText('ارجاع به «سحر کاظمی» ارسال شد ✓')).toBeInTheDocument();
  });

  it('the detail view shows reports and the REPORTED-state sender actions', async () => {
    vi.spyOn(cartableApi, 'fetchReferrals').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    vi.spyOn(cartableApi, 'fetchReferralDetail').mockResolvedValue({
      ...REFERRAL,
      reports: [
        {
          id: 'rep1',
          body: 'گزارش پیوست شد.',
          createdAt: '2026-07-17T09:00:00.000Z',
          from: { id: 'u2', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER' },
          attachments: [],
        },
      ],
    });
    const close = vi.spyOn(cartableApi, 'closeReferral').mockResolvedValue({ ...REFERRAL, status: 'CLOSED' });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    await userEvent.click(await screen.findByText('درخواست گزارش فروش سه‌ماهه'));
    expect(await screen.findByText('گزارش پیوست شد.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست اصلاح گزارش' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'تأیید دریافت گزارش و بستن' }));
    await waitFor(() => expect(close).toHaveBeenCalledWith('r1'));
  });

  it('uploading a document in the creation modal sends its id as attachmentIds', async () => {
    vi.spyOn(cartableApi, 'fetchReferrals').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([
      { id: 's1', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER', roleLabelFa: 'مدیر مالی' },
    ]);
    vi.spyOn(filesApi, 'uploadFile').mockResolvedValue({ id: 'f1', fileName: 'سند.png', sizeBytes: 512 });
    const create = vi.spyOn(cartableApi, 'createReferral').mockResolvedValue(REFERRAL);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'ایجاد ارجاع جدید' }));
    await userEvent.type(screen.getByLabelText('موضوع ارجاع *'), 'موضوع تست');
    await userEvent.type(screen.getByLabelText('شرح درخواست *'), 'شرح تست');
    await userEvent.click(screen.getByRole('button', { name: 'سحر کاظمی — مدیر مالی' }));

    const input = screen.getByLabelText('افزودن سند', { selector: 'input' }) as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'سند.png', { type: 'image/png' }));
    expect(await screen.findByText('سند.png')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ارسال ارجاع' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ['f1'] })),
    );
  });

  it('the detail view shows the request’s own attachments and a report’s attachments as clickable download chips', async () => {
    vi.spyOn(cartableApi, 'fetchReferrals').mockResolvedValue(LIST);
    vi.spyOn(cartableApi, 'fetchStaffDirectory').mockResolvedValue([]);
    vi.spyOn(cartableApi, 'fetchReferralDetail').mockResolvedValue({
      ...REFERRAL,
      attachments: [{ id: 'a1', fileName: 'اصل-درخواست.pdf', mimeType: 'application/pdf', sizeBytes: 2048 }],
      reports: [
        {
          id: 'rep1',
          body: 'گزارش پیوست شد.',
          createdAt: '2026-07-17T09:00:00.000Z',
          from: { id: 'u2', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER' },
          attachments: [{ id: 'a2', fileName: 'گزارش-فروش.pdf', mimeType: 'application/pdf', sizeBytes: 4096 }],
        },
      ],
    });
    const downloadSpy = vi.spyOn(filesApi, 'downloadFile').mockResolvedValue(undefined);

    renderPage();
    await userEvent.click(await screen.findByText('درخواست گزارش فروش سه‌ماهه'));

    expect(await screen.findByRole('button', { name: 'اصل-درخواست.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'گزارش-فروش.pdf' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'اصل-درخواست.pdf' }));
    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith('a1', 'اصل-درخواست.pdf'));
  });
});
