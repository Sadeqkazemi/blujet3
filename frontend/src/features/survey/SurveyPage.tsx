import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { fetchSurveyInvite, submitSurveyResponse } from '../../api/survey';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import type { SurveyInviteView } from '../../types/survey';

const RATINGS = [1, 2, 3, 4, 5];

/** نظرسنجی مسافران — public, no-login submission page reached via the SMS
 * link sent after a flight lands. fa-only: unlike the retrofitted public
 * pages in the i18n arc (Phases 41-64), this is a brand-new page with no
 * exported design file to extract en/ar vocabulary from. */
export default function SurveyPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<SurveyInviteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchSurveyInvite(token)
      .then(setInvite)
      .catch((e) => {
        setLoadError(e instanceof ApiRequestError ? e.message : 'خطا در بارگذاری نظرسنجی.');
      });
  }, [token]);

  async function onSubmit() {
    if (rating < 1) {
      setSubmitError('لطفاً امتیاز خود را انتخاب کنید.');
      return;
    }
    try {
      await submitSurveyResponse(token, { rating, comment: comment.trim() || undefined });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof ApiRequestError ? e.message : 'خطا در ثبت نظرسنجی.');
    }
  }

  return (
    <PublicPageShell>
      <div className="mx-auto max-w-lg px-4 py-10">
        {loadError && (
          <div className="rounded-xl border border-border bg-white p-6 text-center text-sm text-danger">
            {loadError}
          </div>
        )}

        {!loadError && !invite && (
          <div className="p-6 text-center text-sm text-muted">در حال بارگذاری…</div>
        )}

        {!loadError && invite && !submitted && (
          <div className="rounded-2xl border border-border bg-white p-6">
            <h1 className="text-lg font-black text-ink">{invite.title}</h1>
            <p className="mt-1 text-xs text-muted">
              پرواز {invite.flightNo} · {invite.originCityFa} ← {invite.destCityFa} ·{' '}
              {formatJalaliDate(invite.departureAt)}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {invite.questions.map((q) => (
                <p key={q.id} className="text-xs text-text-2">
                  {q.label}
                </p>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-center gap-2" role="radiogroup" aria-label="امتیاز">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={rating === r}
                  aria-label={`امتیاز ${faDigits(r)}`}
                  onClick={() => setRating(r)}
                  className={`h-11 w-11 rounded-full text-sm font-black transition ${
                    rating >= r ? 'bg-[#f59e0b] text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {faDigits(r)}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="نظر شما (اختیاری)"
              rows={4}
              className="mt-5 w-full rounded-lg border border-border p-3 text-xs outline-none transition focus:border-accent"
            />

            {submitError && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {submitError}
              </p>
            )}

            <button
              onClick={() => void onSubmit()}
              className="mt-5 w-full rounded-lg bg-accent py-3 text-sm font-bold text-white transition hover:bg-accent/90"
            >
              ثبت نظرسنجی
            </button>
          </div>
        )}

        {submitted && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <p className="text-sm font-bold text-ink">از نظر شما سپاسگزاریم ✓</p>
            <p className="mt-1 text-xs text-muted">پاسخ شما با موفقیت ثبت شد.</p>
          </div>
        )}
      </div>
    </PublicPageShell>
  );
}
