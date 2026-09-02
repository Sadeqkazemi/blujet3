import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FinancialIntegrationsPage from './FinancialIntegrationsPage';
import * as api from '../../api/finance-manager';
import type { FinancialIntegrationsResult } from '../../types/finance-manager';

const DATA: FinancialIntegrationsResult = {
  connectedCount: 1,
  providers: [
    { provider: 'SEPIDAR', nameFa: 'سپیدار سیستم', descriptionFa: 'سیستم یکپارچه مالی و انبارداری', connected: true, maskedKey: '••••••••abc1', lastSyncedAt: '2026-08-13T09:20:00.000Z', lastSyncOk: true, lastSyncMessage: 'HTTP 200', configured: true },
    { provider: 'HOLO', nameFa: 'هلو', descriptionFa: 'نرم‌افزار حسابداری فروشگاهی و مالی', connected: false, maskedKey: null, lastSyncedAt: null, lastSyncOk: null, lastSyncMessage: null, configured: true },
  ],
};

describe('FinancialIntegrationsPage', () => {
  it('shows backend connection status and validates a new key through the API', async () => {
    vi.spyOn(api, 'fetchFinancialIntegrations').mockResolvedValue(DATA);
    const connect = vi.spyOn(api, 'connectFinancialIntegration').mockResolvedValue({ ...DATA, connectedCount: 2 });
    render(<FinancialIntegrationsPage />);

    expect(await screen.findByText('۱ سرویس متصل')).toBeInTheDocument();
    expect(screen.getByText('••••••••abc1')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('کلید API اتصال را وارد کنید'), 'real-api-key');
    await userEvent.click(screen.getByRole('button', { name: 'اتصال' }));
    await waitFor(() => expect(connect).toHaveBeenCalledWith('HOLO', 'real-api-key'));
    expect(await screen.findByText('اتصال با موفقیت اعتبارسنجی و ثبت شد.')).toBeInTheDocument();
  });
});
