import { useCallback, useEffect, useState } from 'react';
import { fetchClubTierRules, updateClubTierRules } from '../../api/club';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { ClubTier, ClubTierRules } from '../../types/club';

// قوانین باشگاه مشتریان — matches design-reference-v2/پنل مدیر بازرگانی.dc.html's
// "clubrules" tab: three point-threshold inputs (silver's is fixed at ۰,
// disabled) plus a read-only tier-preview table. Backed by the real
// GET/PATCH /club/tier-rules (Phase 65) — saving actually changes which
// tier a member is promoted/demoted into on their next points change
// (see ClubPointsService.syncCache), not just a cosmetic settings screen.

const TIER_LABEL: Record<ClubTier, string> = {
  SILVER: 'نقره‌ای',
  GOLD: 'طلایی',
  PLATINUM: 'پلاتین',
};

const TIER_SWATCH: Record<ClubTier, string> = {
  SILVER: '#475569',
  GOLD: '#92600e',
  PLATINUM: '#1d4ed8',
};

const inputClass =
  'font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-center text-[13px] text-[#e7ecf3] outline-none';

function rangeLabel(minPoints: number, maxPoints: number | null): string {
  const format = (value: number) => faDigits(value.toLocaleString('en-US').replace(/,/g, '٬'));
  const min = format(minPoints);
  if (maxPoints === null) return `بیش از ${min}`;
  return `${min} تا ${format(maxPoints)}`;
}

export default function ClubTierRulesPage() {
  const [rules, setRules] = useState<ClubTierRules | null>(null);
  const [goldInput, setGoldInput] = useState('');
  const [platinumInput, setPlatinumInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchClubTierRules();
      setRules(data);
      setGoldInput(String(data.goldMinPoints));
      setPlatinumInput(String(data.platinumMinPoints));
      setCardInput(String(data.cardRequestMinPoints));
    } catch {
      setError('خطا در دریافت قوانین باشگاه مشتریان.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setError(null);
    setNotice(null);
    const goldMinPoints = Number(goldInput);
    const platinumMinPoints = Number(platinumInput);
    const cardRequestMinPoints = Number(cardInput);
    if (
      !Number.isInteger(goldMinPoints) ||
      !Number.isInteger(platinumMinPoints) ||
      !Number.isInteger(cardRequestMinPoints) ||
      goldMinPoints < 0 ||
      platinumMinPoints < 0 ||
      cardRequestMinPoints < 0
    ) {
      setError('مقادیر باید عدد صحیح و غیرمنفی باشند.');
      return;
    }
    if (goldMinPoints >= platinumMinPoints) {
      setError('حد نصاب طلایی باید کمتر از حد نصاب پلاتین باشد.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateClubTierRules({
        goldMinPoints,
        platinumMinPoints,
        cardRequestMinPoints,
      });
      setRules(updated);
      setNotice('قوانین باشگاه مشتریان ذخیره شد ✓');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در ذخیره قوانین.');
    } finally {
      setSaving(false);
    }
  }

  if (!rules) {
    return <p className="px-[21px] py-8 text-sm text-[#6b7b94]">{error ?? 'در حال بارگذاری…'}</p>;
  }

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      <div>
        <h1 className="m-0 text-[20.5px] font-black text-white">قوانین باشگاه مشتریان</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          تعیین حد نصاب امتیاز برای هر سطح عضویت باشگاه مشتریان — برای همه اعضا یکسان اعمال می‌شود
        </p>
      </div>

      {notice && (
        <p className="rounded-[12px] bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">{notice}</p>
      )}
      {error && <p className="rounded-[12px] bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>}

      <div className="flex items-center gap-2 rounded-xl border border-[rgba(59,130,246,.25)] bg-[rgba(59,130,246,.08)] px-3 py-[11px] text-[11.5px] text-[#9fb0c7]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="flex-none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        این قوانین حد نصاب امتیاز هر سطح عضویت را تعیین می‌کنند و برای تمام اعضای باشگاه مشتریان به‌صورت یکسان
        اعمال می‌شوند.
      </div>

      <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">حد نصاب امتیاز سطوح عضویت</h2>
        </div>
        <div className="grid grid-cols-1 gap-[13px] md:grid-cols-3">
          <div>
            <label className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">نقره‌ای (شروع)</label>
            <input value="۰" disabled dir="ltr" className={`${inputClass} text-[#5a6678]`} />
          </div>
          <div>
            <label htmlFor="ctr-gold" className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">
              حد نصاب طلایی
            </label>
            <input
              id="ctr-gold"
              data-testid="ctr-gold"
              value={goldInput}
              onChange={(e) => setGoldInput(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ctr-platinum" className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">
              حد نصاب پلاتین
            </label>
            <input
              id="ctr-platinum"
              data-testid="ctr-platinum"
              value={platinumInput}
              onChange={(e) => setPlatinumInput(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="ctr-card" className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">
            حد نصاب امتیاز برای درخواست صدور کارت عضویت
          </label>
          <input
            id="ctr-card"
            data-testid="ctr-card"
            value={cardInput}
            onChange={(e) => setCardInput(e.target.value)}
            dir="ltr"
            inputMode="numeric"
            className={`${inputClass} max-w-[260px]`}
          />
        </div>

        <button
          type="button"
          data-testid="ctr-save"
          disabled={saving}
          onClick={() => void onSave()}
          className="mt-[18px] inline-flex h-[46px] items-center justify-center rounded-[11px] bg-[#3b82f6] px-[22px] text-[12.5px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'در حال ذخیره…' : 'ذخیره قوانین'}
        </button>

        {rules.updatedByLabelFa && (
          <p className="mt-3 text-[11px] text-[#6b7b94]">
            آخرین تغییر: {formatJalaliDateTime(rules.updatedAt)} توسط {rules.updatedByLabelFa}
          </p>
        )}
      </div>

      <div className="rounded-[16px] border border-[#1f2a3d] bg-[#141d2e] p-5">
        <div className="mb-4">
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">پیش‌نمایش سطوح</h2>
          <p className="mt-1 text-[10.5px] text-[#6b7b94]">مسیر ارتقای اعضا بر اساس امتیازهای ثبت‌شده</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {rules.preview.map((row, index) => {
            const styles = {
              SILVER: ['from-[#334155] to-[#1e293b]', '#94a3b8', 'نقطه شروع'],
              GOLD: ['from-[#7c5414] to-[#3d2c13]', '#fbbf24', 'اعضای وفادار'],
              PLATINUM: ['from-[#1d4ed8] to-[#172554]', '#60a5fa', 'بالاترین سطح'],
            }[row.tier];
            return (
              <div
                key={row.tier}
                data-testid="club-tier-card"
                id={`club-tier-${row.tier}`}
                className={`relative overflow-hidden rounded-[15px] border border-white/10 bg-gradient-to-br ${styles[0]} p-5`}
              >
                <div data-testid={`club-tier-${row.tier}`} className="relative z-10">
                  <div className="mb-6 flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl">{index === 0 ? '◇' : index === 1 ? '◆' : '✦'}</span>
                    <span className="rounded-full bg-black/20 px-2.5 py-1 text-[9.5px] font-bold" style={{ color: styles[1] }}>{styles[2]}</span>
                  </div>
                  <div className="text-lg font-black text-white">{TIER_LABEL[row.tier]}</div>
                  <div className="font-num mt-2 text-sm font-bold" style={{ color: styles[1] }}>{rangeLabel(row.minPoints, row.maxPoints)} امتیاز</div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full" style={{ width: `${34 + index * 33}%`, background: styles[1] }} /></div>
                  <span data-testid={`ctr-swatch-${row.tier}`} className="sr-only" style={{ background: TIER_SWATCH[row.tier] }}>{TIER_SWATCH[row.tier]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
