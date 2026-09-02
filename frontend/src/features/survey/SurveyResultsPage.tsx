import { useCallback, useEffect, useState } from 'react';
import { analyzeSurveyFlight, fetchSurveyResults } from '../../api/survey';
import { useAuth } from '../../hooks/useAuth';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import type { SurveyResultRow } from '../../types/survey';

/** CEO/SENIOR_MANAGER/BOARD_CHAIR — «نظرسنجی مسافران»: نتایج فقط‌خواندنی
 * به تفکیک پرواز + خلاصهٔ هوش مصنوعی نظرات هر پرواز. پیکربندی نزد مدیر
 * IT است (SurveyConfigPage). */
export default function SurveyResultsPage() {
  const { user } = useAuth();
  const dark =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER';

  const [disabled, setDisabled] = useState(false);
  const [flights, setFlights] = useState<SurveyResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchSurveyResults();
      setDisabled(res.disabled);
      setFlights(res.flights);
    } catch {
      setError('خطا در دریافت نتایج نظرسنجی.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAnalyze(flightInstanceId: string) {
    setLoadingId(flightInstanceId);
    try {
      const { summary } = await analyzeSurveyFlight(flightInstanceId);
      setSummaries((prev) => ({ ...prev, [flightInstanceId]: summary }));
    } catch {
      setError('خطا در دریافت خلاصهٔ هوش مصنوعی.');
    } finally {
      setLoadingId(null);
    }
  }

  const shell = dark ? 'px-[21px] pb-[34px] pt-[18px]' : 'p-8';

  return (
    <div className={shell}>
      <div className={dark ? 'mb-5' : 'mb-6'}>
        <h1 className={dark ? 'text-[20.5px] font-black text-white' : 'text-xl font-black text-ink'}>
          نظرسنجی مسافران
        </h1>
        <p className={dark ? 'mt-1 text-[11.5px] text-[#6b7b94]' : 'mt-1 text-sm text-muted'}>
          نتایج نظرسنجی رضایت مسافران پس از پرواز و خلاصهٔ هوش مصنوعی نظرات هر پرواز
        </p>
      </div>

      {error && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark ? 'bg-[rgba(248,113,113,.12)] text-[#f87171]' : 'bg-danger/10 text-danger'
          }`}
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-[13px]">
        {disabled && (
          <div
            className={
              dark
                ? 'rounded-xl border border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.08)] px-3.5 py-3 text-[11.5px] text-[#cdd7e5]'
                : 'rounded-xl border border-[#f59e0b4d] bg-[#f59e0b14] p-4 text-xs text-ink'
            }
          >
            نظرسنجی پس از پرواز توسط مدیر IT غیرفعال است.
          </div>
        )}

        {!disabled && flights.length === 0 && (
          <div
            className={
              dark
                ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-3 py-[34px] text-center text-xs text-[#6b7b94]'
                : 'rounded-xl border border-border bg-white p-8 text-center text-xs text-muted'
            }
          >
            هنوز نظرسنجی برای هیچ پروازی ثبت نشده است.
          </div>
        )}

        {!disabled &&
          flights.map((f) => (
            <SurveyFlightCard
              key={f.flightInstanceId}
              flight={f}
              dark={dark}
              summary={summaries[f.flightInstanceId]}
              loading={loadingId === f.flightInstanceId}
              onAnalyze={() => void onAnalyze(f.flightInstanceId)}
            />
          ))}
      </div>
    </div>
  );
}

/** Server degradation copy — not an AI-generated summary; never style as mock insight. */
const AI_UNAVAILABLE = 'خلاصه‌ای از نظرات این پرواز در دسترس نیست.';

function SurveyFlightCard({
  flight,
  dark,
  summary,
  loading,
  onAnalyze,
}: {
  flight: SurveyResultRow;
  dark: boolean;
  summary?: string;
  loading: boolean;
  onAnalyze: () => void;
}) {
  const filled = Math.round(flight.avgRating);
  const summaryUnavailable = summary === AI_UNAVAILABLE;
  const hasRealSummary = !!summary && !summaryUnavailable;

  if (!dark) {
    return (
      <div data-testid="survey-result-row" className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-ink">{flight.flightNo}</div>
            <div className="mt-0.5 text-[10.5px] text-muted">
              {flight.originCityFa} ← {flight.destCityFa} · {formatJalaliDate(flight.departureAt)}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs">
              <span className="font-num font-black text-[#f59e0b]">{faDigits(flight.avgRating)}</span>
              <span className="text-muted"> / {faDigits(5)} · </span>
              <span className="font-num font-black text-ink">{faDigits(flight.count)}</span>
              <span className="text-muted"> پاسخ</span>
            </div>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={loading}
              className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-accent/90 disabled:opacity-60"
            >
              {loading ? 'در حال تحلیل…' : 'تحلیل با هوش مصنوعی'}
            </button>
          </div>
        </div>
        {summaryUnavailable && (
          <p data-testid="survey-ai-unavailable" className="mt-3 text-xs text-muted">
            {AI_UNAVAILABLE}
          </p>
        )}
        {hasRealSummary && (
          <p data-testid="survey-ai-summary" className="mt-3 rounded-lg bg-surface p-3 text-xs text-ink">
            {summary}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="survey-result-row"
      className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-extrabold text-white">
            {flight.originCityFa} ← {flight.destCityFa}
          </div>
          <div className="mt-0.5 text-[10.5px] text-[#6b7b94]" dir="ltr">
            {flight.flightNo} · blujet · {formatJalaliDate(flight.departureAt)}
          </div>
        </div>
        <div className="text-end">
          <div className="flex justify-end gap-0.5" aria-label={`امتیاز ${flight.avgRating} از ۵`}>
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="text-sm"
                style={{ color: i < filled ? '#fbbf24' : '#3a4a63' }}
              >
                ★
              </span>
            ))}
          </div>
          <div className="font-num mt-0.5 text-[10px] text-[#6b7b94]">
            {faDigits(flight.avgRating)} از ۵ · {faDigits(flight.count)} پاسخ
          </div>
        </div>
      </div>

      {summaryUnavailable && (
        <p data-testid="survey-ai-unavailable" className="mt-[13px] text-[11.5px] text-[#6b7b94]">
          {AI_UNAVAILABLE}
        </p>
      )}
      {hasRealSummary && (
        <div
          data-testid="survey-ai-summary"
          className="mt-[13px] flex items-start gap-2 rounded-[11px] border border-[rgba(59,130,246,.25)] bg-[rgba(59,130,246,.08)] px-[13px] py-[11px]"
        >
          <span className="text-sm" aria-hidden>
            ✨
          </span>
          <div className="text-xs leading-[1.9] text-[#dbe3f0]">{summary}</div>
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#9fb0c7]">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#3a4a63] border-t-[#60a5fa]" />
            در حال تحلیل نظرات…
          </span>
        ) : (
          <button
            type="button"
            onClick={onAnalyze}
            className="text-[11.5px] font-extrabold text-[#60a5fa] transition hover:text-[#93c5fd]"
          >
            ✨ {hasRealSummary ? 'بازتحلیل نظرات' : 'تحلیل نظرات'}
          </button>
        )}
      </div>
    </div>
  );
}
