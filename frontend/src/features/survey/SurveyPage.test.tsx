import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SurveyPage from './SurveyPage';
import * as surveyApi from '../../api/survey';
import * as useAuthModule from '../../hooks/useAuth';
import { ApiRequestError } from '../../api/envelope';
import type { SurveyInviteView } from '../../types/survey';

const INVITE: SurveyInviteView = {
  title: 'نظرسنجی رضایت مسافران',
  questions: [
    { id: 'q1', label: 'رضایت کلی از سفر', order: 0 },
    { id: 'q2', label: 'دقت در زمان پرواز', order: 1 },
  ],
  flightNo: 'EP-821',
  originCityFa: 'تهران',
  destCityFa: 'دبی',
  departureAt: '2026-07-01T05:00:00.000Z',
};

function renderPage(token = 'tok-1') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={[`/survey/${token}`]}>
      <Routes>
        <Route path="/survey/:token" element={<SurveyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SurveyPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the flight context + question prompts and submits a rating', async () => {
    vi.spyOn(surveyApi, 'fetchSurveyInvite').mockResolvedValue(INVITE);
    const submit = vi.spyOn(surveyApi, 'submitSurveyResponse').mockResolvedValue({ submitted: true });
    renderPage();

    expect(await screen.findByText('EP-821', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('رضایت کلی از سفر')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'امتیاز ۵' }));
    await user.click(screen.getByText('ثبت نظرسنجی'));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('tok-1', { rating: 5, comment: undefined }));
    expect(await screen.findByText('از نظر شما سپاسگزاریم ✓')).toBeInTheDocument();
  });

  it('shows a validation message when submitting without a rating', async () => {
    vi.spyOn(surveyApi, 'fetchSurveyInvite').mockResolvedValue(INVITE);
    const submit = vi.spyOn(surveyApi, 'submitSurveyResponse');
    renderPage();
    await screen.findByText('EP-821', { exact: false });

    await userEvent.click(screen.getByText('ثبت نظرسنجی'));
    expect(await screen.findByText('لطفاً امتیاز خود را انتخاب کنید.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the real server error message for an already-answered/disabled/unknown token', async () => {
    vi.spyOn(surveyApi, 'fetchSurveyInvite').mockRejectedValue(
      new ApiRequestError('SURVEY_ALREADY_SUBMITTED', 'شما قبلاً به این نظرسنجی پاسخ داده‌اید.', 409),
    );
    renderPage();

    expect(await screen.findByText('شما قبلاً به این نظرسنجی پاسخ داده‌اید.')).toBeInTheDocument();
  });
});
