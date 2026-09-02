import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AgencyCommitmentsEditor, {
  type AgencyCommitmentDraft,
} from './AgencyCommitmentsEditor';
import * as agenciesApi from '../../../api/agencies';

function Harness() {
  const [rows, setRows] = useState<AgencyCommitmentDraft[]>([]);
  return (
    <AgencyCommitmentsEditor
      capacity={180}
      charterSeats={40}
      value={rows}
      onChange={setRows}
    />
  );
}

describe('AgencyCommitmentsEditor', () => {
  beforeEach(() => {
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue({
      agencies: [
        {
          id: 'ag-1',
          fullName: 'آژانس آبی',
          managerName: 'مدیر',
          licenseNo: '123',
          city: 'تهران',
          tier: 'NORMAL',
          isActive: true,
          limitIrr: '0',
          usedIrr: '0',
          remainingIrr: '0',
          pendingInvoiceCount: 0,
          monthlyTicketsSold: 0,
          monthlySalesIrr: '0',
        },
      ],
      kpis: {
        activeCount: 1,
        totalCreditGrantedIrr: '0',
        totalUsedIrr: '0',
        pendingSettlementCount: 0,
      },
    });
  });

  it('adds an agency commitment row and tracks online sellable seats', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('ac-agency')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('ac-agency'), 'ag-1');
    await user.type(screen.getByTestId('ac-seats'), '20');
    await user.click(screen.getByTestId('ac-add'));

    const row = await screen.findByTestId('ac-row');
    expect(row).toHaveTextContent('آژانس آبی');
    expect(screen.getByTestId('commitments-total')).toHaveTextContent('۶۰');
    expect(screen.getByTestId('online-sellable')).toHaveTextContent('۱۲۰');
  });

  it('blocks commitments that exceed capacity', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('ac-agency')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('ac-agency'), 'ag-1');
    await user.type(screen.getByTestId('ac-seats'), '200');
    await user.click(screen.getByTestId('ac-add'));

    expect(screen.getByText(/از ظرفیت پرواز/)).toBeInTheDocument();
    expect(screen.queryByTestId('ac-row')).not.toBeInTheDocument();
  });
});
