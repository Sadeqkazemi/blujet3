import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchAccessFlags, setAccessFlag } from '../../api/panels';
import { useAuth } from '../../hooks/useAuth';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { PanelAccessFlag } from '../../types/panels';

const PANEL_LABEL: Record<string, string> = {
  SITE_ADMIN: 'پنل ادمین سایت',
  CEO: 'پنل مدیر عامل',
  BOARD_CHAIR: 'پنل رئیس هیئت مدیره',
  SENIOR_MANAGER: 'پنل مدیر ارشد',
  FINANCE: 'پنل مدیر مالی',
  COMMERCIAL: 'پنل مدیر بازرگانی',
  OPERATIONS: 'پنل مدیر عملیات',
  IT: 'پنل مدیر IT',
};

const PANEL_DESC: Record<string, string> = {
  FINANCE: 'تراکنش‌ها، تسویه، استرداد و گزارش‌های مالی',
  COMMERCIAL: 'آژانس‌ها، نرخ‌گذاری و فروش',
  OPERATIONS: 'داشبورد، کارتابل و بررسی عملیاتی پروازها',
  IT: 'کاربران، سرویس‌ها، امنیت و رزرواسیون',
  CEO: 'داشبورد اجرایی، کارتابل و تأییدهای سطح بالا',
  SITE_ADMIN: 'آژانس‌ها، پرواز، باشگاه، استرداد، کارتابل، تیکت‌ها و مدیریت سایت',
  BOARD_CHAIR: 'نظارت هیئت مدیره و گزارش‌های کلان',
  SENIOR_MANAGER: 'مدیریت ارشد و هماهنگی واحدها',
};

const PANEL_ICON: Record<string, { bg: string; color: string; svg: ReactNode }> = {
  FINANCE: {
    bg: 'rgba(16,185,129,.16)',
    color: '#34d399',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18h18" />
        <path d="M7 14l3.5-3.5 3 3L20 7" />
      </svg>
    ),
  },
  COMMERCIAL: {
    bg: 'rgba(147,51,234,.16)',
    color: '#a855f7',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 21h18" />
        <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
        <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
      </svg>
    ),
  },
  OPERATIONS: {
    bg: 'rgba(14,165,233,.16)',
    color: '#38bdf8',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 11.5 21 4l-6.2 16-3.3-6.2L3 11.5Z" />
        <path d="m11.5 13.8 3.2-3.2" />
      </svg>
    ),
  },
  IT: {
    bg: 'rgba(124,58,237,.16)',
    color: '#a78bfa',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  CEO: {
    bg: 'rgba(59,130,246,.16)',
    color: '#60a5fa',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
      </svg>
    ),
  },
  SITE_ADMIN: {
    bg: 'rgba(96,165,250,.16)',
    color: '#60a5fa',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
};

const CARD_ORDER = ['FINANCE', 'COMMERCIAL', 'OPERATIONS', 'IT', 'CEO', 'SITE_ADMIN', 'SENIOR_MANAGER', 'BOARD_CHAIR'];

/** IT support surfaces inside the IT panel (no role-impersonation). */
const IT_SUPPORT_HREF: Partial<Record<string, string>> = {
  IT: '/panel',
  SITE_ADMIN: '/panel/reservation',
  COMMERCIAL: '/panel/webservices',
  OPERATIONS: '/panel/services',
  FINANCE: '/panel/logs',
};

const IT_SUPPORT_ACCESS: Partial<Record<string, string[]>> = {
  IT: ['کاربران', 'سرویس‌ها', 'امنیت', 'رزرواسیون'],
  SITE_ADMIN: ['رزرواسیون', 'کاربران', 'لاگ‌ها'],
  COMMERCIAL: ['وب‌سرویس‌ها', 'API'],
  OPERATIONS: ['سرویس‌های سایت', 'سلامت سامانه'],
  FINANCE: ['لاگ مالی و رویدادها'],
};

/** Always-available IT workspaces (not gated by CEO panel flags). */
const IT_OWN_WORKSPACES = [
  {
    key: 'employees',
    title: 'پنل کارمند',
    desc: 'کارتابل، تیکت‌ها و وظایف کارمندان واحدها — مدیریت دسترسی از تب کاربران',
    href: '/panel/users',
    access: ['کاربران و دسترسی‌ها', 'مجوزها', 'بازنشانی رمز'],
  },
  {
    key: 'survey',
    title: 'نظرسنجی مسافران',
    desc: 'پیکربندی و آمار نظرسنجی‌های پرواز',
    href: '/panel/survey',
    access: ['پیکربندی', 'آمار'],
  },
] as const;

function Toggle({
  on,
  onToggle,
  label,
  disabled,
  dark,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[25px] w-11 flex-none rounded-full transition disabled:opacity-60 ${
        on ? 'bg-[#3b82f6]' : dark ? 'bg-[#28344c]' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow transition-all ${
          on ? 'start-[22px]' : 'start-[3px]'
        }`}
      />
    </button>
  );
}

function ItSupportCard({
  title,
  desc,
  allowed,
  access,
  href,
}: {
  title: string;
  desc: string;
  allowed: boolean;
  access: string[];
  href: string | null;
}) {
  return (
    <div
      className={`flex min-h-[230px] flex-col rounded-xl border bg-[#141d2e] p-4 ${
        allowed ? 'border-[#28344c]' : 'border-[#1f2a3d] opacity-55'
      }`}
      data-testid={`it-panel-card-${title}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-2xl" aria-hidden>
          {allowed ? '🔓' : '🔒'}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
            allowed ? 'bg-[#10b98124] text-[#34d399]' : 'bg-[#18223a] text-[#6b7b94]'
          }`}
        >
          {allowed ? 'مجاز' : 'بدون دسترسی'}
        </span>
      </div>
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-[#6b7b94]">{desc}</div>
      {access.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {access.map((a) => (
            <span
              key={a}
              className="rounded-full border border-[#28344c] bg-[#18223a] px-2 py-0.5 text-[9.5px] text-[#9fb0c7]"
            >
              {a}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto border-t border-[#1f2a3d] pt-3 text-[11.5px] font-bold">
        {allowed && href ? (
          <Link to={href} className="text-[#60a5fa] hover:underline" data-testid={`it-panel-enter-${title}`}>
            ورود به پنل ←
          </Link>
        ) : (
          <span className="text-[#6b7b94]">{allowed ? 'ورود مستقیم در دسترس نیست' : 'بدون دسترسی'}</span>
        )}
      </div>
    </div>
  );
}

export default function PanelsAccessPage() {
  const { user } = useAuth();
  const readOnly = user?.role === 'IT_MANAGER';
  const dark =
    user?.role === 'CEO' || user?.role === 'BOARD_CHAIR' || user?.role === 'SENIOR_MANAGER';
  const [flags, setFlags] = useState<PanelAccessFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchAccessFlags()
      .then(setFlags)
      .catch(() => setError('خطا در دریافت وضعیت دسترسی پنل‌ها.'));
  }, []);

  async function onToggle(flag: PanelAccessFlag) {
    setSavingKey(flag.panelKey);
    try {
      const updated = await setAccessFlag(flag.panelKey, !flag.enabled);
      setFlags((prev) =>
        prev ? prev.map((f) => (f.panelKey === flag.panelKey ? { ...f, ...updated } : f)) : prev,
      );
    } catch {
      setError('خطا در تغییر دسترسی پنل.');
    } finally {
      setSavingKey(null);
    }
  }

  if (error && !flags) {
    return (
      <p className={`text-sm text-danger ${dark || readOnly ? 'px-[21px] pt-[18px]' : 'p-8'}`}>{error}</p>
    );
  }
  if (!flags) {
    return (
      <p className={`text-sm ${dark || readOnly ? 'px-[21px] pt-[18px] text-[#6b7b94]' : 'p-8 text-muted'}`}>
        در حال بارگذاری…
      </p>
    );
  }

  if (readOnly) {
    const flagCards = [...flags]
      .sort((a, b) => {
        const ai = CARD_ORDER.indexOf(a.panelKey);
        const bi = CARD_ORDER.indexOf(b.panelKey);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map((f) => ({
        title: PANEL_LABEL[f.panelKey] ?? f.panelKey,
        desc: PANEL_DESC[f.panelKey] ?? 'وضعیت دسترسی ورود این پنل',
        allowed: f.enabled,
        access: IT_SUPPORT_ACCESS[f.panelKey] ?? [],
        href: f.enabled ? (IT_SUPPORT_HREF[f.panelKey] ?? null) : null,
      }));

    return (
      <div data-testid="it-panel-access-grid" className="min-h-full bg-[#101827] p-8">
        <h1 className="mb-1 text-xl font-black text-white">دسترسی به پنل‌ها</h1>
        <p className="mb-6 text-sm text-[#6b7b94]">
          ورود به پنل‌های عملیاتی تحت مدیریت واحد IT — تعیین سطح دسترسی ورود در اختیار مدیر عامل است.
        </p>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-4 text-xs leading-6 text-[#9fb0c7]">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#3b82f6]/15 text-[#60a5fa]">
            🛡
          </span>
          <p>
            واحد IT برای پشتیبانی فنی به ابزارهای هم‌پوشان داخل همین پنل دسترسی دارد. وضعیت «مجاز /
            بدون دسترسی» از تنظیمات مدیر عامل خوانده می‌شود؛ ورود کامل با نقش دیگر نیاز به حساب همان
            نقش دارد.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-[#f87171]">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {IT_OWN_WORKSPACES.map((p) => (
            <ItSupportCard
              key={p.key}
              title={p.title}
              desc={p.desc}
              allowed
              access={[...p.access]}
              href={p.href}
            />
          ))}
          {flagCards.map((p) => (
            <ItSupportCard key={p.title} {...p} />
          ))}
        </div>
      </div>
    );
  }

  const ordered = [...flags].sort((a, b) => {
    const ai = CARD_ORDER.indexOf(a.panelKey);
    const bi = CARD_ORDER.indexOf(b.panelKey);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (dark) {
    return (
      <div className="px-[21px] pb-[34px] pt-[18px]">
        <div className="mb-5">
          <h1 className="text-[20.5px] font-black text-white">دسترسی به پنل‌ها</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            تعیین دسترسی ورود به پنل‌های مدیریتی و عملیاتی سامانه
          </p>
        </div>

        <div className="mb-[18px] flex items-center gap-2.5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[15px] py-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[rgba(59,130,246,.16)] text-[#3b82f6]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <p className="m-0 text-[11.5px] leading-[1.7] text-[#cdd6e3]">
            تعیین دسترسی ورود به پنل‌های مدیریتی و عملیاتی. با خاموش‌کردن هر پنل، دسترسی آن نقش موقتاً
            مسدود می‌شود. دسترسی <strong className="font-bold text-white">کارمندان</strong> واحدها توسط
            مدیر IT مدیریت می‌شود.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-[#f87171]">{error}</p>}

        <div className="grid grid-cols-1 gap-[13px] md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((f) => {
            const icon = PANEL_ICON[f.panelKey] ?? PANEL_ICON.CEO!;
            const title = PANEL_LABEL[f.panelKey] ?? f.panelKey;
            const desc = PANEL_DESC[f.panelKey] ?? 'دسترسی ورود به این پنل';
            return (
              <div
                key={f.panelKey}
                className="rounded-[14px] border bg-[#141d2e] p-[15px]"
                style={{
                  borderColor: f.enabled ? '#1f2a3d' : '#2a2233',
                  opacity: f.enabled ? 1 : 0.7,
                }}
              >
                <div className="mb-[13px] flex items-center justify-between">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: icon.bg, color: icon.color }}
                  >
                    {icon.svg}
                  </span>
                  <Toggle
                    on={f.enabled}
                    label={title}
                    disabled={savingKey === f.panelKey}
                    onToggle={() => void onToggle(f)}
                    dark
                  />
                </div>
                <div className="mb-1 text-[13.5px] font-extrabold text-white">{title}</div>
                <div className="mb-3 text-[11px] leading-[1.6] text-[#6b7b94]">{desc}</div>
                {f.updatedAt && (
                  <div className="font-num mb-2 text-[10px] text-[#6b7b94]">
                    آخرین تغییر: {formatJalaliDateTime(f.updatedAt)}
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#1f2a3d] pt-[11px]">
                  <span
                    className={`rounded-[14px] px-2.5 py-1 text-[10.5px] font-bold ${
                      f.enabled
                        ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                        : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                    }`}
                  >
                    {f.enabled ? 'دسترسی فعال' : 'دسترسی مسدود'}
                  </span>
                  <span
                    className={`text-[11px] font-bold ${f.enabled ? 'text-[#3b82f6]' : 'text-[#6b7b94]'}`}
                  >
                    {f.enabled ? 'ورود به پنل ←' : 'غیرفعال'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="mb-1 text-xl font-black text-ink">دسترسی به پنل‌ها</h1>
      <p className="mb-6 text-sm text-muted">
        فعال/غیرفعال‌کردن پنل نقش‌های دیگر — هر تغییر در دفتر رویدادها ثبت می‌شود.
      </p>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="max-w-2xl rounded-xl border border-border bg-white p-5">
        <div className="flex flex-col divide-y divide-border/60">
          {ordered.map((f) => (
            <div key={f.panelKey} className="flex items-center justify-between gap-3 py-3.5">
              <div>
                <div className="text-sm font-bold text-ink">{PANEL_LABEL[f.panelKey] ?? f.panelKey}</div>
                {f.updatedAt && (
                  <div className="font-num mt-0.5 text-[10px] text-muted">
                    آخرین تغییر: {formatJalaliDateTime(f.updatedAt)}
                  </div>
                )}
              </div>
              <Toggle
                on={f.enabled}
                label={PANEL_LABEL[f.panelKey] ?? f.panelKey}
                disabled={savingKey === f.panelKey}
                onToggle={() => void onToggle(f)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
