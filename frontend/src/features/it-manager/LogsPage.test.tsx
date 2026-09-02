import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import LogsPage from './LogsPage';
import * as itApi from '../../api/it-manager';
import type { AuditLogRow } from '../../types/it-manager';

const LOGS: AuditLogRow[] = Array.from({ length: 6 }, (_, index) => ({
    id: `l${index + 1}`,
    actorRole: 'IT_MANAGER',
    category: 'ACCOUNT',
    action: 'ایجاد کارمند',
    detail: `کارمند «رضا ${index + 1}» ایجاد شد`,
    createdAt: '2026-07-17T08:00:00.000Z',
    actorName: 'مهندس علی صدر',
    unit: 'IT',
    level: 'info',
  }));

describe('LogsPage', () => {
  it('renders exactly five log records per page', async () => {
    vi.spyOn(itApi, 'fetchSystemLogs').mockResolvedValue(LOGS);

    render(<LogsPage />);

    expect(await screen.findByText('زمان')).toBeInTheDocument();
    expect(screen.getByText('کارمند')).toBeInTheDocument();
    expect(screen.getAllByText('مهندس علی صدر')).toHaveLength(5);
    expect(screen.getAllByTestId('system-log-row')).toHaveLength(5);
    expect(screen.getAllByText('IT')).toHaveLength(5);

    await userEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getAllByTestId('system-log-row')).toHaveLength(1);
    expect(screen.getByText(/رضا 6/)).toBeInTheDocument();
  });
});
