import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CareersPage from './CareersPage';
import * as careersApi from '../../api/careers';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useCareersEnabledModule from '../../hooks/useCareersEnabled';
import type { JobSummary } from '../../types/careers';

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

const JOB: JobSummary = { id: 'j1', title: 'کارشناس پشتیبانی مسافران', dept: 'پشتیبانی', city: 'تهران', type: 'FULL_TIME' };

beforeEach(() => {
  vi.restoreAllMocks();
  mockLocale('fa');
  vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(false);
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CareersPage />
    </MemoryRouter>,
  );
}

describe('CareersPage', () => {
  it('renders active job cards with a link to the apply page', async () => {
    vi.spyOn(careersApi, 'fetchActiveJobs').mockResolvedValue([JOB]);
    renderPage();

    expect(await screen.findByText('کارشناس پشتیبانی مسافران')).toBeInTheDocument();
    expect(screen.getByText('پشتیبانی · تهران')).toBeInTheDocument();
    expect(screen.getByTestId('job-card')).toHaveAttribute('href', '/careers/j1/apply');
    expect(screen.getByText('مشاهده و ارسال رزومه')).toBeInTheDocument();
  });

  it('shows the empty state when there are no active jobs', async () => {
    vi.spyOn(careersApi, 'fetchActiveJobs').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByTestId('careers-empty')).toHaveTextContent(
      'در حال حاضر فرصت شغلی فعالی وجود ندارد',
    );
  });

  it('shows an error message when the fetch fails', async () => {
    vi.spyOn(careersApi, 'fetchActiveJobs').mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('خطا در دریافت فرصت‌های شغلی.')).toBeInTheDocument();
  });
});
