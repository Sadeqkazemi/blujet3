import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SurveyConfigPage from './SurveyConfigPage';
import * as surveyApi from '../../api/survey';
import type { SurveyQuestion, SurveySettings, SurveyStats } from '../../types/survey';

const SETTINGS: SurveySettings = {
  enabled: true,
  title: 'نظرسنجی رضایت مسافران',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedByLabelFa: null,
};

const QUESTIONS: SurveyQuestion[] = [
  { id: 'q1', label: 'رضایت کلی از سفر', order: 0 },
  { id: 'q2', label: 'دقت در زمان پرواز', order: 1 },
];

const STATS: SurveyStats = {
  flightsWithSurvey: 3,
  totalResponses: 10,
  avgRating: 4.2,
  recentResponses: [
    { id: 'r1', flightNo: 'EP-821', route: 'تهران — مشهد', rating: 5, comment: 'عالی بود', at: '2026-07-01T00:00:00.000Z' },
  ],
};

describe('SurveyConfigPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the error message instead of an infinite spinner when the initial fetch fails', async () => {
    vi.spyOn(surveyApi, 'fetchSurveySettings').mockRejectedValue(new Error('network down'));
    vi.spyOn(surveyApi, 'fetchSurveyQuestions').mockResolvedValue(QUESTIONS);
    vi.spyOn(surveyApi, 'fetchSurveyStats').mockResolvedValue(STATS);
    render(<SurveyConfigPage />);

    expect(await screen.findByText('خطا در دریافت اطلاعات نظرسنجی.')).toBeInTheDocument();
    expect(screen.queryByText('در حال بارگذاری…')).not.toBeInTheDocument();
  });

  it('renders settings, stats, questions and recent responses', async () => {
    vi.spyOn(surveyApi, 'fetchSurveySettings').mockResolvedValue(SETTINGS);
    vi.spyOn(surveyApi, 'fetchSurveyQuestions').mockResolvedValue(QUESTIONS);
    vi.spyOn(surveyApi, 'fetchSurveyStats').mockResolvedValue(STATS);
    render(<SurveyConfigPage />);

    expect(await screen.findByText('نظرسنجی مسافران')).toBeInTheDocument();
    expect(screen.getByText('فعال‌سازی نظرسنجی پس از پرواز')).toBeInTheDocument();
    expect(screen.getByText('رضایت کلی از سفر')).toBeInTheDocument();
    expect(screen.getAllByTestId('survey-question-row')).toHaveLength(2);
    expect(screen.getByTestId('survey-recent-row')).toBeInTheDocument();
  });

  it('toggles the enabled switch', async () => {
    vi.spyOn(surveyApi, 'fetchSurveySettings').mockResolvedValue(SETTINGS);
    vi.spyOn(surveyApi, 'fetchSurveyQuestions').mockResolvedValue(QUESTIONS);
    vi.spyOn(surveyApi, 'fetchSurveyStats').mockResolvedValue(STATS);
    const update = vi
      .spyOn(surveyApi, 'updateSurveySettings')
      .mockResolvedValue({ ...SETTINGS, enabled: false });
    render(<SurveyConfigPage />);
    await screen.findByRole('switch', { name: 'فعال‌سازی نظرسنجی' });

    await userEvent.click(screen.getByRole('switch', { name: 'فعال‌سازی نظرسنجی' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ enabled: false }));
  });

  it('adds a new question', async () => {
    vi.spyOn(surveyApi, 'fetchSurveySettings').mockResolvedValue(SETTINGS);
    vi.spyOn(surveyApi, 'fetchSurveyQuestions').mockResolvedValue(QUESTIONS);
    vi.spyOn(surveyApi, 'fetchSurveyStats').mockResolvedValue(STATS);
    const add = vi
      .spyOn(surveyApi, 'addSurveyQuestion')
      .mockResolvedValue({ id: 'q3', label: 'کیفیت پذیرایی', order: 2 });
    render(<SurveyConfigPage />);
    await screen.findByText('رضایت کلی از سفر');

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('متن سؤال جدید…'), 'کیفیت پذیرایی');
    await user.click(screen.getByRole('button', { name: 'افزودن سؤال' }));

    await waitFor(() => expect(add).toHaveBeenCalledWith('کیفیت پذیرایی'));
  });

  it('removes a question', async () => {
    vi.spyOn(surveyApi, 'fetchSurveySettings').mockResolvedValue(SETTINGS);
    vi.spyOn(surveyApi, 'fetchSurveyQuestions').mockResolvedValue(QUESTIONS);
    vi.spyOn(surveyApi, 'fetchSurveyStats').mockResolvedValue(STATS);
    const remove = vi.spyOn(surveyApi, 'removeSurveyQuestion').mockResolvedValue({ id: 'q1' });
    render(<SurveyConfigPage />);
    await screen.findByText('رضایت کلی از سفر');

    const rows = screen.getAllByTestId('survey-question-row');
    const removeBtn = rows[0].querySelector('button')!;
    await userEvent.click(removeBtn);

    await waitFor(() => expect(remove).toHaveBeenCalledWith('q1'));
  });
});
