import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountClubTab from './AccountClubTab';
import * as useLocaleModule from '../../hooks/useLocale';
import * as loansApi from '../../api/loans';
import type { ClubMembershipView } from '../../types/club-membership';
import type { LoanCustomerProfile } from '../../types/loans';

const MEMBERSHIP: ClubMembershipView = {
  isMember: true,
  level: 'GOLD',
  balance: 12450,
  cardStatus: 'ISSUED',
  cardNo: 'GOLD-8842',
  tierRules: { goldMinPoints: 5000, platinumMinPoints: 15000, cardRequestMinPoints: 5000 },
  cardRequest: null,
  canRequestCard: false,
  pointsNeededForCard: 0,
};

afterEach(() => vi.restoreAllMocks());

describe('AccountClubTab', () => {
  it('shows the membership card and the real bank-loan entry paths', async () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
    render(
      <MemoryRouter>
        <AccountClubTab membership={MEMBERSHIP} onMembershipChange={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('کارت عضویت باشگاه')).toBeInTheDocument();
    expect(screen.getByTestId('club-bank-loan-section')).toBeInTheDocument();
    expect(screen.getByTestId('club-bank-action')).toHaveAttribute('href', '/account?tab=loans');

    await userEvent.click(screen.getByTestId('club-bank-non-customer'));
    expect(screen.getByTestId('club-bank-action')).toHaveAttribute('href', '/account?tab=tickets');
    expect(screen.getByTestId('club-bank-action')).toHaveTextContent('ارسال درخواست عضویت');
  });

  it('opens the Saman customer-number form and confirms the eligibility request', async () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
    const pendingProfile: LoanCustomerProfile = {
      membershipStatus: 'BANK_CUSTOMER',
      maskedCustomerNumber: '••••7890',
      accountOpeningStatus: 'NOT_STARTED',
      accountOpeningReferenceId: null,
      eligibilityStatus: 'SUBMITTED',
      eligibilityReferenceId: 'ASSESS-1',
      eligibleAmountIrr: null,
      lastSyncedAt: null,
      updatedAt: '2026-08-26T08:00:00.000Z',
    };
    const start = vi.spyOn(loansApi, 'startLoanEligibility').mockResolvedValue(pendingProfile);
    render(
      <MemoryRouter>
        <AccountClubTab membership={MEMBERSHIP} onMembershipChange={vi.fn()} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByTestId('club-bank-customer'));
    await userEvent.type(screen.getByTestId('club-bank-customer-number'), '1234567890');
    await userEvent.click(screen.getByTestId('club-bank-submit'));

    expect(start).toHaveBeenCalledWith('1234567890', expect.any(String));
    expect(await screen.findByTestId('club-bank-success')).toHaveTextContent(
      'درخواست اعتبارسنجی شما ارسال شد',
    );
  });
});
