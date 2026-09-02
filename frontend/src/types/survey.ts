export interface SurveySettings {
  enabled: boolean;
  title: string;
  updatedAt: string;
  updatedByLabelFa: string | null;
}

export interface SurveyQuestion {
  id: string;
  label: string;
  order: number;
}

export interface SurveyStats {
  flightsWithSurvey: number;
  totalResponses: number;
  avgRating: number;
  recentResponses: {
    id: string;
    flightNo: string;
    route: string;
    rating: number;
    comment: string | null;
    at: string;
  }[];
}

export interface SurveyResultRow {
  flightInstanceId: string;
  flightNo: string;
  originCityFa: string;
  destCityFa: string;
  departureAt: string;
  count: number;
  avgRating: number;
}

export interface SurveyResults {
  disabled: boolean;
  flights: SurveyResultRow[];
}

export interface SurveyInviteView {
  title: string;
  questions: { id: string; label: string; order: number }[];
  flightNo: string;
  originCityFa: string;
  destCityFa: string;
  departureAt: string;
}
