import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as authApi from '../../api/auth';
import * as itApi from '../../api/it-manager';
import type { ItWebservicesOverview } from '../../types/it-manager';
import WebservicesApiPage from './WebservicesApiPage';

const OVERVIEW: ItWebservicesOverview = {
  kpis: {
    activeClients: 1,
    issuedKeys: 2,
    pendingRequests: 1,
    securityEventsToday: 0,
  },
  requests: [
    {
      id: 'request-1',
      agencyId: 'agency-1',
      agency: 'آژانس سپهر',
      scope: 'SEARCH_BOOK',
      months: 6,
      priceIrr: '12000000',
      note: null,
      status: 'PENDING',
      createdAt: '2026-08-19T08:00:00.000Z',
      decidedAt: null,
    },
  ],
  clients: [
    {
      id: 'key-1',
      agencyId: 'agency-1',
      agency: 'آژانس سپهر',
      keyHint: 'bjk_••••a1b2',
      scope: 'SEARCH_BOOK',
      capabilities: ['RESERVATION', 'TICKETING', 'FLIGHT_INFO', 'AVAILABILITY'],
      environment: 'SANDBOX',
      flightDomain: 'ALL',
      ipWhitelist: [],
      rateLimitPerMinute: 60,
      status: 'ACTIVE',
      activatedAt: '2026-08-19T08:00:00.000Z',
      expiresAt: null,
      lastUsedAt: null,
      callCount: 42,
      errorRatePct: null,
    },
  ],
  eligibleAgencies: [{ id: 'agency-1', name: 'آژانس سپهر' }],
  events: [],
};

describe('WebservicesApiPage', () => {
  it('renders real request/client KPIs and never expects a stored key hash', async () => {
    vi.spyOn(itApi, 'fetchItWebservices').mockResolvedValue(OVERVIEW);

    render(<WebservicesApiPage />);

    expect(
      await screen.findByRole('heading', { name: 'وب‌سرویس‌ها و API' }),
    ).toBeInTheDocument();
    expect(screen.getByText('آژانس سپهر')).toBeInTheDocument();
    expect(screen.getByText('جستجو و رزرو · ۶ ماه')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /آژانس‌ها/ }));
    expect(screen.getByText('bjk_••••a1b2')).toBeInTheDocument();
    expect(screen.getByText(/کل درخواست‌های ثبت‌شده/)).toHaveTextContent('۴۲');
  });

  it('requires step-up approval and displays the issued raw key only in the result modal', async () => {
    vi.spyOn(itApi, 'fetchItWebservices').mockResolvedValue(OVERVIEW);
    vi.spyOn(authApi, 'requestStepUp').mockResolvedValue({
      challengeId: 'challenge-1',
    });
    const decideSpy = vi
      .spyOn(itApi, 'decideItWebserviceRequest')
      .mockResolvedValue({
        request: { id: 'request-1', status: 'APPROVED' },
        apiKey: {
          id: 'key-new',
          agencyId: 'agency-1',
          keyHint: 'bjk_••••new1',
          scope: 'SEARCH_BOOK',
          status: 'ACTIVE',
          rawKey: 'bjk_once_only_secret',
        },
      });

    render(<WebservicesApiPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تأیید' }));

    const stepUpDialog = await screen.findByRole('dialog', {
      name: 'تأیید مجدد هویت',
    });
    await user.type(within(stepUpDialog).getByRole('textbox'), '482913');
    await user.click(
      within(stepUpDialog).getByRole('button', { name: 'تأیید' }),
    );

    await waitFor(() =>
      expect(decideSpy).toHaveBeenCalledWith('request-1', {
        approve: true,
        stepUpChallengeId: 'challenge-1',
        stepUpCode: '482913',
      }),
    );
    expect(await screen.findByText('bjk_once_only_secret')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'کلید API صادر شد' }),
    ).toBeInTheDocument();
  });
});
