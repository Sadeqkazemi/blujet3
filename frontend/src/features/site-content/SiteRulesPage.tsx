import { useEffect, useState } from 'react';
import { fetchSiteRules, updateSiteRules } from '../../api/settings';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import type { SiteRuleCategory } from '../../types/site-pages';

export default function SiteRulesPage() {
  const [categories, setCategories] = useState<SiteRuleCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSiteRules()
      .then((data) => setCategories(data.categories))
      .catch(() => setError('دریافت قوانین سایت از سرور انجام نشد.'));
  }, []);

  function change(index: number, patch: Partial<SiteRuleCategory>) {
    setCategories((current) =>
      current?.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ) ?? null,
    );
  }

  async function save() {
    if (!categories) return;
    if (categories.some((item) => !item.title.trim() || !item.text.trim())) {
      setError('عنوان و متن هیچ دسته‌ای نمی‌تواند خالی باشد.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateSiteRules({ categories });
      setCategories(saved.categories);
      setNotice('قوانین سایت ذخیره و در صفحهٔ عمومی منتشر شد.');
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'ذخیره قوانین سایت انجام نشد.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!categories) {
    return (
      <p className="px-[21px] py-8 text-sm text-[#6b7b94]" role={error ? 'alert' : undefined}>
        {error ?? 'در حال بارگذاری قوانین…'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]" data-testid="site-rules-page">
      <header>
        <h1 className="m-0 text-[20.5px] font-black text-white">قوانین سایت</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          مدیریت متن قوانین سایت و قوانین حمل حیوان خانگی
        </p>
      </header>

      {notice && (
        <p role="status" className="rounded-[12px] bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[12px] bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-[15px] xl:grid-cols-2">
        {categories.map((category, index) => (
          <section key={category.id} className="rounded-[16px] border border-[#1f2a3d] bg-[#141d2e] p-[18px]">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="font-num flex h-6 w-6 items-center justify-center rounded-[7px] bg-[rgba(59,130,246,.12)] text-[11px] font-extrabold text-[#60a5fa]">
                {faDigits(index + 1)}
              </span>
              <label htmlFor={`site-rule-title-${category.id}`} className="text-[14px] font-extrabold text-white">
                {category.title}
              </label>
            </div>
            <input
              id={`site-rule-title-${category.id}`}
              aria-label={`عنوان ${faDigits(index + 1)}`}
              value={category.title}
              onChange={(event) => change(index, { title: event.target.value })}
              maxLength={120}
              className="mb-2.5 h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1726] px-3 text-[12.5px] font-bold text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
            />
            <textarea
              aria-label={`متن ${category.title}`}
              value={category.text}
              onChange={(event) => change(index, { text: event.target.value })}
              maxLength={12000}
              rows={category.id === 'pets' ? 7 : 5}
              className="w-full resize-y rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12px] leading-7 text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
            />
          </section>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-[46px] min-w-[150px] items-center justify-center rounded-[11px] bg-[#3b82f6] px-5 text-[12.5px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'در حال ذخیره…' : 'ذخیره قوانین'}
        </button>
      </div>
    </div>
  );
}
