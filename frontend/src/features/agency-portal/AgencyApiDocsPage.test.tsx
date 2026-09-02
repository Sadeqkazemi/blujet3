import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyApiDocsPage from './AgencyApiDocsPage';
import * as portalApi from '../../api/agency-portal';
import * as useLocaleModule from '../../hooks/useLocale';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgencyApiDocsPage', () => {
  it('shows intro section and locks flight endpoints without active API key', async () => {
    mockLocale('fa');
    vi.spyOn(portalApi, 'fetchApiKeys').mockResolvedValue([]);
    render(
      <MemoryRouter>
        <AgencyApiDocsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('وب‌سرویس رزرو آژانس')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('doc-section-endpoints'));
    const ep = await screen.findByTestId('doc-ep-FlightSearch');
    expect(ep.querySelector('button')).toHaveClass('cursor-not-allowed');
  });

  it('unlocks flight endpoints when agency has an active API key', async () => {
    mockLocale('en');
    vi.spyOn(portalApi, 'fetchApiKeys').mockResolvedValue([
      {
        id: 'k1',
        scope: 'FULL',
        status: 'ACTIVE',
        activatedAt: '2026-07-01T00:00:00.000Z',
        expiresAt: null,
        lastUsedAt: null,
        callCount: 10,
      },
    ]);
    render(
      <MemoryRouter>
        <AgencyApiDocsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Agency Booking API')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('doc-section-endpoints'));
    const ep = await screen.findByTestId('doc-ep-FlightSearch');
    expect(ep.querySelector('button')).not.toHaveClass('cursor-not-allowed');
  });
});
