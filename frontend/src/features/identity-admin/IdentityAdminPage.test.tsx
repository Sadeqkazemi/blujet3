import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IdentityAdminPage from './IdentityAdminPage';
import * as identityAdminApi from '../../api/identity-admin';
import type { IdentityVerificationRow } from '../../types/identity-admin';

function row(overrides: Partial<IdentityVerificationRow> = {}): IdentityVerificationRow {
  return {
    id: 'iv-1',
    fullName: 'نگار رضایی',
    phone: '09121234567',
    nationalId: '0012345679',
    birthDate: '1990-01-01T00:00:00.000Z',
    status: 'SUBMITTED',
    submittedAt: '2026-07-20T09:30:00.000Z',
    reviewedAt: null,
    rejectReason: null,
    idCardFileName: 'کارت-ملی.png',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IdentityAdminPage', () => {
  it('lists submitted verifications with customer info and pending count', async () => {
    vi.spyOn(identityAdminApi, 'fetchIdentityVerifications').mockResolvedValue([
      row(),
      row({ id: 'iv-2', fullName: 'رضا مرادی', status: 'APPROVED', reviewedAt: '2026-07-21T00:00:00.000Z' }),
    ]);
    render(<IdentityAdminPage />);

    expect(await screen.findByText('نگار رضایی')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-pending-count')).toHaveTextContent('۱');
    const rows = screen.getAllByTestId('kyc-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('در انتظار بررسی')).toBeInTheDocument();
    expect(within(rows[1]).getByText('تأیید شد')).toBeInTheDocument();
    // Reviewed rows have no approve/reject buttons.
    expect(within(rows[1]).queryByRole('button', { name: 'تأیید' })).not.toBeInTheDocument();
  });

  it('approves a submitted verification', async () => {
    vi.spyOn(identityAdminApi, 'fetchIdentityVerifications').mockResolvedValue([row()]);
    const approve = vi
      .spyOn(identityAdminApi, 'approveIdentityVerification')
      .mockResolvedValue({ id: 'iv-1', status: 'APPROVED' });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<IdentityAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'تأیید' }));
    expect(approve).toHaveBeenCalledWith('iv-1');
    expect(await screen.findByText('احراز هویت نگار رضایی تأیید شد ✓')).toBeInTheDocument();
  });

  it('rejects with a required reason via the modal', async () => {
    vi.spyOn(identityAdminApi, 'fetchIdentityVerifications').mockResolvedValue([row()]);
    const reject = vi
      .spyOn(identityAdminApi, 'rejectIdentityVerification')
      .mockResolvedValue({ id: 'iv-1', status: 'REJECTED' });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<IdentityAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'رد' }));
    const dialog = await screen.findByRole('dialog', { name: /نگار رضایی/ });

    const submit = within(dialog).getByRole('button', { name: 'ثبت رد درخواست' });
    expect(submit).toBeDisabled();

    await userEvent.type(
      within(dialog).getByPlaceholderText('دلیل رد مدارک…'),
      'تصویر کارت ملی ناخوانا است.',
    );
    await userEvent.click(submit);
    expect(reject).toHaveBeenCalledWith('iv-1', 'تصویر کارت ملی ناخوانا است.');
  });

  it('shows the reject reason on rejected rows and an empty state when no rows', async () => {
    vi.spyOn(identityAdminApi, 'fetchIdentityVerifications').mockResolvedValue([
      row({ status: 'REJECTED', rejectReason: 'تصویر ناخوانا است.' }),
    ]);
    render(<IdentityAdminPage />);
    expect(await screen.findByText('دلیل رد: تصویر ناخوانا است.')).toBeInTheDocument();

    vi.spyOn(identityAdminApi, 'fetchIdentityVerifications').mockResolvedValue([]);
    render(<IdentityAdminPage />);
    expect(await screen.findByText('درخواستی برای بررسی وجود ندارد.')).toBeInTheDocument();
  });
});
