import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminLoansPage from './AdminLoansPage';
import * as loansApi from '../../api/loans';

const ROW = {
  id: 'loan-1', userId: 'user-1', requestedAmountIrr: '50000000', bankStatus: 'UNDER_REVIEW' as const,
  customer: { id: 'user-1', fullName: 'نگار رضایی', phone: '09121234567' },
  displayStatus: 'under_review' as const, bankReferenceId: 'BANK-55',
  createdAt: '2026-08-10T08:00:00.000Z', updatedAt: '2026-08-10T08:00:00.000Z',
  lastSyncedAt: '2026-08-10T09:00:00.000Z', statusSummary: { source: 'bank' },
};

afterEach(() => vi.restoreAllMocks());

describe('AdminLoansPage', () => {
  it('shows bank applications read-only and loads their details', async () => {
    vi.spyOn(loansApi, 'fetchAdminLoanApplications').mockResolvedValue({
      items: [ROW], page: 1, pageSize: 20, total: 1,
    });
    const detailSpy = vi.spyOn(loansApi, 'fetchAdminLoanApplication').mockResolvedValue(ROW);
    render(<AdminLoansPage />);

    expect(await screen.findByText('در حال بررسی بانک')).toBeInTheDocument();
    expect(screen.getByText('نگار رضایی')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تأیید|رد/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'مشاهده وضعیت ←' }));
    expect(await screen.findByText('BANK-55')).toBeInTheDocument();
    expect(detailSpy).toHaveBeenCalledWith('loan-1');
  });
});
