import { useCallback, useEffect, useState } from 'react';
import {
  addSurveyQuestion,
  fetchSurveyQuestions,
  fetchSurveySettings,
  fetchSurveyStats,
  removeSurveyQuestion,
  updateSurveySettings,
} from '../../api/survey';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { SurveyQuestion, SurveySettings, SurveyStats } from '../../types/survey';

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`امتیاز ${faDigits(rating)} از ${faDigits(5)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'text-[#fbbf24]' : 'text-[#3a4a63]'}>
          ★
        </span>
      ))}
    </span>
  );
}

/** پنل مدیر IT — «نظرسنجی مسافران»: ایجاد/پیکربندی نظرسنجی (فعال‌سازی،
 * فهرست سؤالات) و آمار کلی. نتایج و تحلیل هوش مصنوعی نزد
 * CEO/SENIOR_MANAGER/BOARD_CHAIR است (SurveyResultsPage). */
export default function SurveyConfigPage() {
  const [settings, setSettings] = useState<SurveySettings | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, q, st] = await Promise.all([
        fetchSurveySettings(),
        fetchSurveyQuestions(),
        fetchSurveyStats(),
      ]);
      setSettings(s);
      setQuestions(q);
      setStats(st);
    } catch {
      setError('خطا در دریافت اطلاعات نظرسنجی.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleEnabled() {
    if (!settings) return;
    try {
      const updated = await updateSurveySettings({ enabled: !settings.enabled });
      setSettings(updated);
    } catch {
      setError('خطا در تغییر وضعیت نظرسنجی.');
    }
  }

  async function onAddQuestion() {
    if (!newQuestion.trim()) return;
    try {
      await addSurveyQuestion(newQuestion.trim());
      setNewQuestion('');
      await load();
    } catch {
      setError('خطا در افزودن سؤال.');
    }
  }

  async function onRemoveQuestion(id: string) {
    try {
      await removeSurveyQuestion(id);
      await load();
    } catch {
      setError('خطا در حذف سؤال.');
    }
  }

  if (!settings) {
    if (error) {
      return (
        <div className="p-8">
          <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
        </div>
      );
    }
    return <div className="p-8 text-sm text-[#6b7b94]">در حال بارگذاری…</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-[20.5px] font-black text-white">نظرسنجی مسافران</h1>
        <p className="mt-1 text-[12.5px] text-[#6b7b94]">
          ایجاد و پیکربندی نظرسنجی رضایت پس از پرواز — نتایج نزد مدیران ارشد
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold text-white">فعال‌سازی نظرسنجی پس از پرواز</h2>
            <button
              role="switch"
              aria-checked={settings.enabled}
              aria-label="فعال‌سازی نظرسنجی"
              onClick={() => void onToggleEnabled()}
              className={`relative h-[25px] w-11 rounded-full transition ${
                settings.enabled ? 'bg-[#3b82f6]' : 'bg-[#28344c]'
              }`}
            >
              <span
                className={`absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white transition ${
                  settings.enabled ? 'right-[3px]' : 'right-[22px]'
                }`}
              />
            </button>
          </div>
          <p className="mb-[18px] text-[11.5px] leading-6 text-[#6b7b94]">
            با فعال بودن این گزینه، بعد از هر پرواز تکمیل‌شده، پیامک/ایمیل نظرسنجی برای مسافران
            ارسال می‌شود.
          </p>

          <h3 className="mb-2.5 text-[12.5px] font-extrabold text-white">سؤالات نظرسنجی</h3>
          <div className="mb-3 flex flex-col gap-2">
            {questions.length === 0 && (
              <p className="py-3.5 text-center text-[11.5px] text-[#6b7b94]">سؤالی تعریف نشده است.</p>
            )}
            {questions.map((q) => (
              <div
                key={q.id}
                data-testid="survey-question-row"
                className="flex items-center gap-2.5 rounded-[11px] border border-[#28344c] px-3 py-2.5 text-xs"
              >
                <span className="h-2 w-2 flex-none rounded-full bg-[#3b82f6]" />
                <span className="flex-1 text-[#cdd6e3]">{q.label}</span>
                <span className="rounded-xl bg-[rgba(251,191,36,.12)] px-2 py-1 text-[11px] font-bold text-[#fbbf24]">
                  ★ ۵ ستاره
                </span>
                <button
                  onClick={() => void onRemoveQuestion(q.id)}
                  className="text-[#6b7b94] transition hover:text-[#f87171]"
                  aria-label={`حذف ${q.label}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onAddQuestion();
              }}
              placeholder="متن سؤال جدید…"
              className="h-[42px] flex-1 rounded-[9px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
            />
            <button
              onClick={() => void onAddQuestion()}
              className="flex h-[42px] items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-4 text-[11.5px] font-bold text-white transition hover:brightness-110"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              افزودن سؤال
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-[#6b7b94]">هر سؤال با پاسخ ۵ ستاره‌ای برای مسافران ارسال می‌شود.</p>
        </div>

        <div className="flex flex-col gap-[15px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="mb-3.5 text-[13.5px] font-extrabold text-white">نتایج جمع‌آوری‌شده</h2>
            <div className="flex flex-col gap-[11px] text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">پروازهای دارای نظرسنجی</span>
                <span className="font-num text-[12.5px] font-extrabold text-white">
                  {faDigits(stats?.flightsWithSurvey ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">مجموع پاسخ‌ها</span>
                <span className="font-num text-[12.5px] font-extrabold text-white">
                  {faDigits(stats?.totalResponses ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">میانگین امتیاز کلی</span>
                <span className="font-num text-[12.5px] font-extrabold text-[#fbbf24]">
                  {faDigits(stats?.avgRating ?? 0)} / {faDigits(5)}
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-[#1f2a3d] pt-3.5">
              <h3 className="mb-2.5 text-[11.5px] font-extrabold text-white">پاسخ‌های اخیر</h3>
              <div className="flex flex-col gap-[9px]">
                {(stats?.recentResponses.length ?? 0) === 0 && (
                  <p className="py-3.5 text-center text-[11px] text-[#6b7b94]">پاسخی ثبت نشده است.</p>
                )}
                {stats?.recentResponses.map((r) => (
                  <div
                    key={r.id}
                    data-testid="survey-recent-row"
                    className="rounded-[11px] border border-[#1f2a3d] px-3 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-num ltr text-[11px] text-[#9fb0c7]">
                        {r.flightNo}
                        {r.route ? ` · ${r.route}` : ''}
                      </span>
                      <StarRating rating={r.rating} />
                    </div>
                    {r.comment && (
                      <p className="mt-1.5 text-[10.5px] leading-[1.7] text-[#6b7b94]">{r.comment}</p>
                    )}
                    <p className="mt-1 text-[10px] text-[#6b7b94]">{formatJalaliDateTime(r.at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="flex items-start gap-[11px] rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px] text-[11.5px] leading-[1.8] text-[#cdd6e3]">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <p>
              نتایج و خلاصهٔ هوش مصنوعی این نظرسنجی برای{' '}
              <strong className="text-white">رئیس هیئت مدیره</strong>،{' '}
              <strong className="text-white">مدیر عامل</strong> و{' '}
              <strong className="text-white">مدیر ارشد</strong> در پنل خودشان نمایش داده می‌شود.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
