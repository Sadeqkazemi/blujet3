import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ManagerReportsPage from './ManagerReportsPage';
import * as auditApi from '../../api/audit';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { ManagerReportRow } from '../../types/audit';
import type { Role } from '../../types/auth';

const ROWS: ManagerReportRow[] = [
  {
    id: 'a1',
    actorId: 'u1',
    actorRole: 'FINANCE_MANAGER',
    actorName: 'سحر کاظمی',
    category: 'AGENCY',
    action: 'تسویه فاکتور آژانس',
    detail: 'فاکتور INV-1001 توسط سحر کاظمی تسویه شد.',
    entityType: 'AgencyInvoice',
    entityId: 'inv1',
    createdAt: '2026-07-15T10:00:00.000Z',
  },
];

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

describe('ManagerReportsPage', () => {
  it('CEO dark layout: KPIs, unit chips, and filters by finance unit', async () => {
    mockRole('CEO');
    const fetchSpy = vi.spyOn(auditApi, 'fetchManagerReportsPaged').mockResolvedValue({
      data: ROWS,
      meta: { total: ROWS.length, page: 1, limit: 100 },
    });

    render(<ManagerReportsPage />);
    expect(await screen.findByText('گزارش عملکرد مدیران')).toBeInTheDocument();
    expect(screen.getByText('کل گزارش‌ها')).toBeInTheDocument();
    expect(screen.getByText('اقدامات کلیدی مدیران')).toBeInTheDocument();
    expect(await screen.findByText('تسویه فاکتور آژانس')).toBeInTheDocument();
    expect(screen.getByText('سحر کاظمی')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'مالی' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ actorRole: 'FINANCE_MANAGER', page: 1, limit: 100 }),
      ),
    );
  });

  it('unit chip بازرگانی maps to COMMERCIAL_MANAGER filter', async () => {
    mockRole('BOARD_CHAIR');
    const fetchSpy = vi.spyOn(auditApi, 'fetchManagerReportsPaged').mockResolvedValue({
      data: ROWS,
      meta: { total: ROWS.length, page: 1, limit: 100 },
    });
    render(<ManagerReportsPage />);
    expect(await screen.findByText('تسویه فاکتور آژانس')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'بازرگانی' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actorRole: 'COMMERCIAL_MANAGER',
          page: 1,
          limit: 100,
        }),
      ),
    );
  });
});
