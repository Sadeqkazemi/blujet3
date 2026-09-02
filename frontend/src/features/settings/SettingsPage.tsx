import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchSettings, updateRefundRules, updateSettings } from '../../api/admins';
import { ApiRequestError } from '../../api/envelope';
import { faDigits, latinDigits } from '../../lib/fa-format';
import type { RefundRuleRow, SettingsResult } from '../../types/admins';
import type { SocialLinkEntry, SocialLinkId } from '../../types/social-links';
import { SOCIAL_LINK_IDS } from '../../types/social-links';
import type { AppDownloadLinkEntry, AppLinkId } from '../../types/app-links';
import { APP_LINK_IDS } from '../../types/app-links';
import { SocialIcon, socialBrandColor } from '../../components/public/SocialIcon';

const GATEWAYS: { key: string; name: string; desc: string }[] = [
  { key: 'gatewayMellat', name: 'درگاه بانک ملت', desc: 'درگاه اصلی پرداخت' },
  { key: 'gatewaySaman', name: 'درگاه بانک سامان', desc: 'درگاه پشتیبان' },
  { key: 'gatewayZarin', name: 'زرین‌پال', desc: 'درگاه واسط' },
];

const GLOBAL_TOGGLES: {
  key: string;
  title: string;
  desc: string;
  iconColor: string;
  icon: ReactNode;
}[] = [
  {
    key: 'maintenance',
    title: 'حالت تعمیر و نگهداری',
    desc: 'نمایش صفحه «در دست تعمیر» به کاربران',
    iconColor: '#f59e0b',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4z" />
      </svg>
    ),
  },
  {
    key: 'registration',
    title: 'ثبت‌نام کاربران جدید',
    desc: 'امکان ساخت حساب کاربری در سایت',
    iconColor: '#34d399',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.3 2.7-6 6-6" />
        <path d="M17 11v6M14 14h6" />
      </svg>
    ),
  },
  {
    key: 'charterSale',
    title: 'فروش بلیط چارتر',
    desc: 'فعال بودن خرید بلیط‌های چارتری',
    iconColor: '#3b82f6',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
      </svg>
    ),
  },
  {
    key: 'apiPublic',
    title: 'دسترسی عمومی API',
    desc: 'باز بودن وب‌سرویس برای همه آژانس‌ها',
    iconColor: '#a855f7',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
    ),
  },
  {
    key: 'sandbox',
    title: 'حالت آزمایشی (Sandbox)',
    desc: 'اجرای پرداخت‌ها در محیط تست',
    iconColor: '#f59e0b',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V3" />
        <path d="M8 3h8" />
      </svg>
    ),
  },
];

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[25px] w-11 flex-none rounded-full transition ${
        on ? 'bg-panel-accent' : 'bg-panel-border-2'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow transition-all ${
          on ? 'start-[3px]' : 'end-[3px]'
        }`}
      />
    </button>
  );
}

const cardClass = 'panel-surface-card rounded-[16px] border border-panel-border bg-panel-surface p-5';
const labelClass = 'mb-1.5 block text-[11.5px] font-bold text-panel-muted';
const inputClass =
  'w-full rounded-[10px] border border-panel-border-2 bg-panel-surface-2 px-3.5 py-2.5 text-sm text-panel-ink outline-none transition focus:border-panel-accent focus:ring-2 focus:ring-panel-accent/10';

export default function SettingsPage() {
  const { user } = useAuth();
  /** Company/content/gateway editors are not writable for IT (server key scope). */
  const canEditBrandContent = false;
  const canEditRefundRules = user?.role === 'IT_MANAGER';
  const isSiteAdmin = user?.role === 'SITE_ADMIN';
  const isIt = user?.role === 'IT_MANAGER';
  const [data, setData] = useState<SettingsResult | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((d) => {
        setData(d);
        setDraft(d.settings);
        setRuleDraft(
          Object.fromEntries(d.refundRules.map((r) => [r.id, String(r.penaltyPct)])),
        );
      })
      .catch(() => setError('خطا در دریافت تنظیمات.'));
  }, []);

  if (error) return <p className="p-8 text-sm text-[#f87171]">{error}</p>;
  if (!data) return <p className="p-8 text-sm text-[#6b7b94]">در حال بارگذاری…</p>;

  const setKey = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const boolOf = (key: string) => Boolean(draft[key]);
  const strOf = (key: string) => String(draft[key] ?? '');

  const socialLinks = (): SocialLinkEntry[] => {
    const raw = draft.socialLinks;
    if (!Array.isArray(raw)) return [];
    return raw as SocialLinkEntry[];
  };

  const updateSocialLink = (id: SocialLinkId, patch: Partial<SocialLinkEntry>) => {
    setKey(
      'socialLinks',
      socialLinks().map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const appLinks = (): AppDownloadLinkEntry[] => {
    const raw = draft.appDownloadLinks;
    if (!Array.isArray(raw)) return [];
    return raw as AppDownloadLinkEntry[];
  };

  const updateAppLink = (id: AppLinkId, patch: Partial<AppDownloadLinkEntry>) => {
    setKey(
      'appDownloadLinks',
      appLinks().map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  async function onSave() {
    setSaving(true);
    setNotice(null);
    try {
      const patch = isSiteAdmin
        ? {
            socialLinks: draft.socialLinks,
            supportEmail: draft.supportEmail,
            supportPhone: draft.supportPhone,
            appDownloadLinks: draft.appDownloadLinks,
          }
        : isIt
          ? {
              maintenance: draft.maintenance,
              registration: draft.registration,
              charterSale: draft.charterSale,
              apiPublic: draft.apiPublic,
              sandbox: draft.sandbox,
              socialLinks: draft.socialLinks,
              appDownloadLinks: draft.appDownloadLinks,
              supportPhone: draft.supportPhone,
            }
          : draft;
      const result = await updateSettings(patch);

      if (canEditRefundRules && data && !isSiteAdmin) {
        const changed: { id: string; penaltyPct: number }[] = [];
        for (const rule of data.refundRules) {
          const parsed = parseInt(latinDigits(ruleDraft[rule.id] ?? ''), 10);
          if (!Number.isNaN(parsed) && parsed !== rule.penaltyPct) {
            changed.push({ id: rule.id, penaltyPct: parsed });
          }
        }
        if (changed.length > 0) {
          const withRules = await updateRefundRules(changed);
          setData(withRules);
        } else {
          setData(result);
        }
      } else {
        setData(result);
      }
      setNotice('تنظیمات ذخیره شد ✓');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در ذخیرهٔ تنظیمات.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] p-5 md:p-8">
      <header className="panel-surface-card mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-panel-border bg-panel-surface px-5 py-4">
        <div>
          <h1 className="mb-1 text-[20.5px] font-black text-panel-ink">تنظیمات سامانه</h1>
          <p className="m-0 text-[12.5px] text-panel-muted">
            {isSiteAdmin
              ? 'مدیریت لینک‌های اجتماعی، تماس پشتیبانی و دانلود اپلیکیشن در سایت'
              : isIt
                ? 'سرویس‌های عملیاتی سایت، شبکه‌های اجتماعی و تماس پشتیبانی'
                : 'پیکربندی سراسری — هر تغییر در دفتر رویدادها ثبت می‌شود'}
          </p>
        </div>
        <span className="rounded-full border border-panel-border bg-panel-surface-2 px-3 py-1.5 text-[11px] font-bold text-panel-muted">
          تغییرات پس از ذخیره در دفتر رویداد ثبت می‌شوند
        </span>
      </header>

      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(16,185,129,.14)] p-3 text-xs font-bold text-[#34d399]">
          {notice}
        </p>
      )}

      {isIt && (
        <section className={`${cardClass} mb-[18px]`}>
          <div className="mb-[18px] flex items-start justify-between gap-[11px]">
            <div>
              <h2 className="text-[14.5px] font-extrabold text-white">لوگوی سایت</h2>
              <p className="mt-1 text-[11.5px] text-[#6b7b94]">
                لوگوی برند که در هدر و فوتر تمام صفحات نمایش داده می‌شود
              </p>
            </div>
            <span className="rounded-full bg-[rgba(16,185,129,.12)] px-[9px] py-1 text-[10px] font-bold text-[#34d399]">
              سراسری
            </span>
          </div>
          <div className="flex flex-wrap items-stretch gap-[15px]">
            <div className="flex w-[210px] flex-none flex-col items-center justify-center gap-[11px] rounded-xl border border-[#1f2a3d] bg-[#0f1623] p-3">
              <span className="text-[9.5px] tracking-wide text-[#6b7b94]">پیش‌نمایش فعلی</span>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#3b82f6] text-[19px] text-white">
                  ✈
                </div>
                <span className="text-[19px] font-black text-white">blujet</span>
              </div>
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-[9px]">
              <div className="flex h-[118px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#2a3a55] bg-[#0f1623] px-4 text-center text-[11.5px] text-[#6b7b94]">
                آپلود لوگو از این پنل هنوز فعال نیست — فعلاً برند ثابت blujet نمایش داده می‌شود
              </div>
              <p className="text-[10.5px] leading-[1.7] text-[#6b7b94]">
                فرمت PNG شفاف یا SVG — حداکثر ۱ مگابایت — نسبت پیشنهادی افقی
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canEditBrandContent && (
          <div className={cardClass}>
            <div className="mb-4 text-sm font-bold text-white">اطلاعات شرکت</div>
            <div className="flex flex-col gap-3">
              {(
                [
                  ['companyName', 'نام شرکت'],
                  ['supportEmail', 'ایمیل پشتیبانی'],
                  ['supportPhone', 'تلفن تماس'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`set-${key}`} className={labelClass}>
                    {label}
                  </label>
                  <input
                    id={`set-${key}`}
                    value={strOf(key)}
                    onChange={(e) => setKey(key, e.target.value)}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {canEditBrandContent && (
          <div className={cardClass}>
            <div className="mb-1 text-sm font-bold text-white">محتوای سایت</div>
            <p className="mb-4 text-[11px] text-[#6b7b94]">متن صفحات عمومی — بدون نیاز به انتشار نسخهٔ جدید</p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ['homeHeroTitle', 'عنوان صفحهٔ اصلی'],
                  ['homeHeroSubtitle', 'زیرعنوان صفحهٔ اصلی'],
                  ['aboutUsText', 'متن دربارهٔ ما'],
                  ['contactAddress', 'آدرس تماس با ما'],
                  ['termsText', 'متن قوانین و مقررات'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`set-${key}`} className={labelClass}>
                    {label}
                  </label>
                  <textarea
                    id={`set-${key}`}
                    value={strOf(key)}
                    onChange={(e) => setKey(key, e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-y`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {canEditBrandContent && (
          <div className={cardClass}>
            <div className="mb-4 text-sm font-bold text-white">درگاه پرداخت</div>
            <div className="flex flex-col divide-y divide-[#1f2a3d]">
              {GATEWAYS.map((g) => (
                <div key={g.key} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-xs font-bold text-[#e7ecf3]">{g.name}</div>
                    <div className="text-[10.5px] text-[#6b7b94]">{g.desc}</div>
                  </div>
                  <Toggle
                    on={boolOf(g.key)}
                    onToggle={() => setKey(g.key, !boolOf(g.key))}
                    label={g.name}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {canEditRefundRules && (
          <div className={cardClass}>
            <div className="mb-1 text-sm font-bold text-white">قوانین استرداد</div>
            <p className="mb-4 text-[11px] leading-6 text-[#6b7b94]">
              این درصدها همان بازه‌های واقعی موتور استرداد (فاز ۷) هستند — تغییر اینجا مستقیماً در محاسبهٔ
              جریمهٔ استرداد اعمال می‌شود.
            </p>
            <div className="flex flex-col gap-3">
              {data.refundRules.map((r: RefundRuleRow) => (
                <div key={r.id}>
                  <label htmlFor={`rule-${r.id}`} className={labelClass}>
                    {r.labelFa} (٪)
                  </label>
                  <input
                    id={`rule-${r.id}`}
                    value={faDigits(ruleDraft[r.id] ?? '')}
                    onChange={(e) =>
                      setRuleDraft((d) => ({ ...d, [r.id]: latinDigits(e.target.value) }))
                    }
                    inputMode="numeric"
                    className={`font-num ${inputClass}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {(isSiteAdmin || isIt) && (
          <div className={cardClass}>
            <div className="mb-1 text-sm font-bold text-white">تماس پشتیبانی</div>
            <p className="mb-4 text-[11px] text-[#6b7b94]">شماره تلفن و ایمیل نمایش‌داده‌شده در سایت</p>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="set-support-phone" className={labelClass}>
                  شماره تلفن پشتیبانی
                </label>
                <input
                  id="set-support-phone"
                  dir="ltr"
                  value={strOf('supportPhone')}
                  onChange={(e) => setKey('supportPhone', e.target.value)}
                  className={`font-num ${inputClass}`}
                />
              </div>
              {isSiteAdmin && (
                <div>
                  <label htmlFor="set-support-email" className={labelClass}>
                    ایمیل پشتیبانی
                  </label>
                  <input
                    id="set-support-email"
                    dir="ltr"
                    value={strOf('supportEmail')}
                    onChange={(e) => setKey('supportEmail', e.target.value)}
                    className={`font-num ${inputClass}`}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {(isSiteAdmin || isIt) && (
          <div className={cardClass}>
            <div className="mb-1 text-sm font-bold text-white">لینک دانلود اپلیکیشن</div>
            <p className="mb-4 text-[11px] text-[#6b7b94]">دکمه‌های بخش اپلیکیشن در صفحهٔ اصلی</p>
            <div className="flex flex-col gap-3">
              {APP_LINK_IDS.map((id) => {
                const entry = appLinks().find((l) => l.id === id);
                if (!entry) return null;
                return (
                  <div key={id} className="rounded-lg border border-[#28344c] p-3">
                    <input
                      aria-label={`نام ${entry.name}`}
                      value={entry.name}
                      onChange={(e) => updateAppLink(id, { name: e.target.value })}
                      className="mb-1.5 w-full rounded-md border border-[#28344c] bg-[#0f1623] px-2.5 py-1.5 text-xs font-bold text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                    />
                    <input
                      aria-label={`آدرس ${entry.name}`}
                      dir="ltr"
                      value={entry.url}
                      onChange={(e) => updateAppLink(id, { url: e.target.value })}
                      placeholder="apps.apple.com/..."
                      className="font-num w-full rounded-md border border-[#28344c] bg-[#0f1623] px-2.5 py-1.5 text-[11px] text-[#6b7b94] outline-none focus:border-[#3b82f6]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isSiteAdmin && (
          <div className={cardClass}>
            <div className="mb-1 text-[14.5px] font-extrabold text-white">تنظیمات کلی سامانه</div>
            <p className="mb-3.5 text-[11.5px] text-[#6b7b94]">
              پیکربندی سراسری سایت — تغییرات روی کل سرویس اعمال می‌شود
            </p>
            <div className="flex flex-col">
              {GLOBAL_TOGGLES.map((t) => (
                <div
                  key={t.key}
                  className="flex items-center gap-[11px] border-b border-[#1f2a3d] py-3 last:border-0"
                >
                  <span
                    className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[#18223a]"
                    style={{ color: t.iconColor }}
                  >
                    {t.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#e7ecf3]">{t.title}</div>
                    <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">{t.desc}</div>
                  </div>
                  <Toggle
                    on={boolOf(t.key)}
                    onToggle={() => setKey(t.key, !boolOf(t.key))}
                    label={t.title}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={cardClass}>
          <div className="mb-1 text-sm font-bold text-white">شبکه‌های اجتماعی</div>
          <p className="mb-4 text-[11px] text-[#6b7b94]">لینک‌های نمایش‌داده‌شده در فوتر سایت</p>
          <div className="flex flex-col gap-3">
            {SOCIAL_LINK_IDS.map((id) => {
              const entry = socialLinks().find((l) => l.id === id);
              if (!entry) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-[#28344c] p-3"
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#18223a]"
                    style={{ color: socialBrandColor(id) }}
                  >
                    <SocialIcon id={id} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      aria-label={`نام ${entry.name}`}
                      value={entry.name}
                      onChange={(e) => updateSocialLink(id, { name: e.target.value })}
                      className="mb-1.5 w-full rounded-md border border-[#28344c] bg-[#0f1623] px-2.5 py-1.5 text-xs font-bold text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                    />
                    <input
                      aria-label={`آدرس ${entry.name}`}
                      dir="ltr"
                      value={entry.url}
                      onChange={(e) => updateSocialLink(id, { url: e.target.value })}
                      placeholder="example.com/blujet"
                      className="font-num w-full rounded-md border border-[#28344c] bg-[#0f1623] px-2.5 py-1.5 text-[11px] text-[#6b7b94] outline-none focus:border-[#3b82f6]"
                    />
                  </div>
                  <Toggle
                    on={entry.enabled}
                    onToggle={() => updateSocialLink(id, { enabled: !entry.enabled })}
                    label={entry.name}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        disabled={saving}
        onClick={() => void onSave()}
        className="sticky bottom-4 mt-6 rounded-[10px] bg-panel-accent px-7 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
      >
        {saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
      </button>
    </div>
  );
}
