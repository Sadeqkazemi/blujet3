import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type {
  SurveyInviteView,
  SurveyQuestion,
  SurveyResults,
  SurveySettings,
  SurveyStats,
} from '../types/survey';

export function fetchSurveySettings() {
  return apiGet<SurveySettings>('/survey/settings');
}

export function updateSurveySettings(dto: { enabled?: boolean; title?: string }) {
  return apiPatch<SurveySettings>('/survey/settings', dto);
}

export function fetchSurveyQuestions() {
  return apiGet<SurveyQuestion[]>('/survey/questions');
}

export function addSurveyQuestion(label: string) {
  return apiPost<SurveyQuestion>('/survey/questions', { label });
}

export function removeSurveyQuestion(id: string) {
  return apiDelete<{ id: string }>(`/survey/questions/${id}`);
}

export function fetchSurveyStats() {
  return apiGet<SurveyStats>('/survey/stats');
}

export function fetchSurveyResults() {
  return apiGet<SurveyResults>('/survey/results');
}

export function analyzeSurveyFlight(flightInstanceId: string) {
  return apiPost<{ summary: string }>(
    `/survey/results/${flightInstanceId}/analyze`,
  );
}

// Public, no-auth — used by the standalone /survey/:token page.
export function fetchSurveyInvite(token: string) {
  return apiGet<SurveyInviteView>(`/survey/${token}`);
}

export function submitSurveyResponse(
  token: string,
  dto: { rating: number; comment?: string },
) {
  return apiPost<{ submitted: boolean }>(`/survey/${token}`, dto);
}
