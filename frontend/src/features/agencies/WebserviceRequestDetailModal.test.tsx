import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WebserviceRequestDetailModal from './WebserviceRequestDetailModal';
import * as agenciesApi from '../../api/agencies';
import * as authApi from '../../api/auth';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';

const REQUEST: AgencyWebserviceQueueRow = {
  id: 'ws1',
  agencyId: 'a1',
  agencyName: 'آژانس blujet',
  city: 'تهران',
  licenseNo: 'AG-10234',
  scope: 'FULL',
  months: 3,
  priceIrr: '30000000',
  note: 'لطفاً هر چه سریع‌تر بررسی شود.',
  status: 'PENDING',
  decidedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

describe('WebserviceRequestDetailModal', () => {
  it('renders the request fields and note', async () => {
    render(<WebserviceRequestDetailModal request={REQUEST} onClose={vi.fn()} onDecided={vi.fn()} />);

    expect(screen.getByText('جزئیات درخواست خرید وب‌سرویس')).toBeInTheDocument();
    expect(screen.getByText('دسترسی کامل')).toBeInTheDocument();
    expect(screen.getByText('۳ ماهه')).toBeInTheDocument();
    expect(screen.getByText('۳٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText('لطفاً هر چه سریع‌تر بررسی شود.')).toBeInTheDocument();
  });

  it('rejecting calls decide with approve:false and no step-up', async () => {
    const decide = vi.spyOn(agenciesApi, 'decideAgencyWebserviceRequest').mockResolvedValue({
      id: 'ws1',
      scope: 'FULL',
      months: 3,
      priceIrr: '30000000',
      note: null,
      status: 'REJECTED',
      decidedAt: '2026-08-02T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    const onDecided = vi.fn();

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<WebserviceRequestDetailModal request={REQUEST} onClose={vi.fn()} onDecided={onDecided} />);

    await userEvent.click(screen.getByRole('button', { name: 'رد درخواست' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('a1', 'ws1', { approve: false }));
    expect(onDecided).toHaveBeenCalled();
  });

  it('approving requests a step-up challenge first', async () => {
    const requestStepUp = vi.spyOn(authApi, 'requestStepUp').mockResolvedValue({ challengeId: 'ch1' });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<WebserviceRequestDetailModal request={REQUEST} onClose={vi.fn()} onDecided={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'تأیید و فعال‌سازی' }));
    await waitFor(() => expect(requestStepUp).toHaveBeenCalledWith('API_KEY_ROTATE'));
    expect(await screen.findByText('تأیید مجدد هویت')).toBeInTheDocument();
  });
});
