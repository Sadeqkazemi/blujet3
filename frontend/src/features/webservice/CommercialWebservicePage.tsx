import { useEffect, useState } from 'react';
import { fetchWebservicePricing, updateWebservicePricing } from '../../api/webservice-pricing';
import { ApiRequestError } from '../../api/envelope';
import { faDigits, faMoney, latinDigits, parseTomanToRial } from '../../lib/fa-format';

const PLAN_LABELS: Record<1 | 3 | 12, string> = {
  1: '۱ ماهه',
  3: '۳ ماهه',
  12: '۱۲ ماهه',
};

/** Shared B2B plan prices (API is one set) shown per service card like the design. */
const SERVICES = [
  {
    id: 'search-book',
    name: 'وب‌سرویس جستجو و رزرو پرواز',
    desc: 'جستجو، نرخ‌گیری و صدور بلیط برای آژانس‌ها',
  },
  {
    id: 'full-sales',
    name: 'وب‌سرویس فروش کامل',
    desc: 'دسترسی کامل فروش، گزارش و مدیریت رزرو از سمت آژانس',
  },
] as const;

const inputClass =
  'font-num w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-[11px] text-left text-[13px] text-[#e7ecf3] outline-none focus:border-[#3b82f6]';

/** Commercial Manager — B2B webservice plan pricing (design: webservice tab). */
export default function CommercialWebservicePage() {
  const [month1, setMonth1] = useState('');
  const [month3, setMonth3] = useState('');
  const [month12, setMonth12] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWebservicePricing()
      .then((data) => {
        setMonth1(String(Math.floor(data.prices[1] / 10)));
        setMonth3(String(Math.floor(data.prices[3] / 10)));
        setMonth12(String(Math.floor(data.prices[12] / 10)));
      })
      .catch(() => setError('خطا در دریافت قیمت‌گذاری وب‌سرویس.'));
  }, []);

  async function onSave() {
    setError(null);
    setNotice(null);
    try {
      const month1PriceIrr = parseTomanToRial(month1);
      const month3PriceIrr = parseTomanToRial(month3);
      const month12PriceIrr = parseTomanToRial(month12);
      if (
        month1PriceIrr === null ||
        month3PriceIrr === null ||
        month12PriceIrr === null ||
        month1PriceIrr <= 0 ||
        month3PriceIrr <= 0 ||
        month12PriceIrr <= 0
      ) {
        setError('همهٔ قیمت‌ها باید عددی و بزرگ‌تر از صفر باشند.');
        return;
      }
      setSaving(true);
      await updateWebservicePricing({ month1PriceIrr, month3PriceIrr, month12PriceIrr });
      setNotice('قیمت‌گذاری وب‌سرویس‌ها ذخیره شد ✓');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در ذخیره قیمت‌گذاری.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      <div>
        <h1 className="m-0 text-[20.5px] font-black text-white">وب سرویس</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">قیمت‌گذاری وب‌سرویس‌های قابل خرید توسط آژانس‌ها</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[rgba(59,130,246,.25)] bg-[rgba(59,130,246,.08)] px-3 py-[11px] text-[11.5px] text-[#9fb0c7]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="flex-none">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        قیمت هر پلن، مبلغی است که آژانس‌ها هنگام خرید وب‌سرویس از پنل خود پرداخت می‌کنند؛ تغییر این قیمت‌ها
        بلافاصله در درخواست‌های خرید جدید اعمال می‌شود.
      </div>

      {error && <p className="text-xs text-[#f87171]">{error}</p>}
      {notice && <p className="rounded-[12px] bg-[rgba(52,211,153,.12)] p-3 text-xs font-bold text-[#34d399]">{notice}</p>}

      {SERVICES.map((svc, svcIdx) => (
        <div key={svc.id} className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
            <h2 className="m-0 text-[14.5px] font-extrabold text-white">{svc.name}</h2>
          </div>
          <p className="mb-3.5 pr-4 text-[11px] text-[#6b7b94]">{svc.desc}</p>
          <div className="grid grid-cols-1 gap-[13px] pr-4 sm:grid-cols-3">
            {([1, 3, 12] as const).map((months) => {
              const value = months === 1 ? month1 : months === 3 ? month3 : month12;
              const setValue = months === 1 ? setMonth1 : months === 3 ? setMonth3 : setMonth12;
              const inputId = `ws-${svc.id}-${months}`;
              // Only the first card owns labelled inputs for a11y/tests; second mirrors shared prices.
              const labelled = svcIdx === 0;
              return (
                <div key={months}>
                  {labelled ? (
                    <label htmlFor={inputId} className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">
                      {PLAN_LABELS[months]} (تومان)
                    </label>
                  ) : (
                    <div className="mb-[7px] text-[11.5px] text-[#9fb0c7]">{PLAN_LABELS[months]} (تومان)</div>
                  )}
                  <input
                    id={inputId}
                    dir="ltr"
                    inputMode="numeric"
                    value={faDigits(value)}
                    onChange={(e) => setValue(latinDigits(e.target.value))}
                    className={inputClass}
                    aria-label={labelled ? undefined : `${svc.name} ${PLAN_LABELS[months]}`}
                  />
                  {labelled && value && parseTomanToRial(value) !== null && (
                    <p className="mt-1 text-[10px] text-[#6b7b94]">≈ {faMoney(parseTomanToRial(value)!)} تومان</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button
        disabled={saving}
        onClick={() => void onSave()}
        className="inline-flex h-[46px] w-fit items-center justify-center rounded-[11px] bg-[#3b82f6] px-[22px] text-[12.5px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {saving ? 'در حال ذخیره…' : 'ذخیره قیمت‌گذاری'}
      </button>
    </div>
  );
}
