import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SurveyResultsPage from './SurveyResultsPage';
import * as surveyApi from '../../api/survey';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { SurveyResults } from '../../types/survey';
import type { Role } from '../../types/auth';

const RESULTS: SurveyResults = {
  disabled: false,
  flights: [
    {
      flightInstanceId: 'fi-1',
      flightNo: 'EP-821',
      originCityFa: 'تهران',
      destCityFa: 'دبی',
      departureAt: '2026-07-01T05:00:00.000Z',
      count: 3,
      avgRating: 4.3,
    },
  ],
};

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

describe('SurveyResultsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CEO dark layout: route title, stars, and AI analyze link', async () => {
    mockRole('CEO');
    vi.spyOn(surveyApi, 'fetchSurveyResults').mockResolvedValue(RESULTS);
    render(<SurveyResultsPage />);

    expect(await screen.findByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByText(/EP-821/)).toBeInTheDocument();
    expect(screen.getByTestId('survey-result-row')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تحلیل نظرات/ })).toBeInTheDocument();
  });

  it('BOARD_CHAIR receives the same real survey results view', async () => {
    mockRole('BOARD_CHAIR');
    const resultsSpy = vi.spyOn(surveyApi, 'fetchSurveyResults').mockResolvedValue(RESULTS);

    render(<SurveyResultsPage />);

    expect(await screen.findByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByTestId('survey-result-row')).toBeInTheDocument();
    expect(resultsSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the disabled banner instead of an empty-state when the survey is off', async () => {
    mockRole('CEO');
    vi.spyOn(surveyApi, 'fetchSurveyResults').mockResolvedValue({ disabled: true, flights: [] });
    render(<SurveyResultsPage />);

    expect(
      await screen.findByText('نظرسنجی پس از پرواز توسط مدیر IT غیرفعال است.'),
    ).toBeInTheDocument();
  });

  it('calls analyze and renders the returned summary', async () => {
    mockRole('CEO');
    vi.spyOn(surveyApi, 'fetchSurveyResults').mockResolvedValue(RESULTS);
    const analyze = vi
      .spyOn(surveyApi, 'analyzeSurveyFlight')
      .mockResolvedValue({ summary: 'در کل رضایت بالا بود.' });
    render(<SurveyResultsPage />);
    await screen.findByText('تهران ← دبی');

    await userEvent.click(screen.getByRole('button', { name: /تحلیل نظرات/ }));

    await waitFor(() => expect(analyze).toHaveBeenCalledWith('fi-1'));
    expect(await screen.findByTestId('survey-ai-summary')).toHaveTextContent(
      'در کل رضایت بالا بود.',
    );
  });
});
