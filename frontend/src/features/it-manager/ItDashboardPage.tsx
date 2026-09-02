import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchItDashboard } from '../../api/it-manager';
import { faDigits, faPercent } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { ItDashboardData } from '../../types/it-manager';

const EVENT_DOT: Record<string, string> = {
  SECURITY: 'bg-[#f59e0b]',
  ACCOUNT: 'bg-[#3b82f6]',
  SYSTEM: 'bg-[#34d399]',
  ACCESS: 'bg-[#a855f7]',
};

type KpiDef = {
  label: string;
  value: string;
  trend: string;
  trendClass: string;
  cta: string;
  iconBg: string;
  iconColor: string;
  icon: ReactNode;
  onClick: () => void;
};

export default function ItDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ItDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchItDashboard()
      .then(setData)
      .catch(() => setError('خطا در دریافت داشبورد فنی.'));
  }, []);

  if (error) return <p className="px-[21px] pt-[18px] text-sm text-[#f87171]">{error}</p>;
  if (!data) return <p className="px-[21px] pt-[18px] text-sm text-[#6b7b94]">در حال بارگذاری…</p>;

  const kpis: KpiDef[] = [
    {
      label: 'سرویس فعال',
      value: `${faDigits(data.kpis.servicesUp)}/${faDigits(data.kpis.servicesTotal)}`,
      trend:
        data.kpis.servicesTotal > 0 && data.kpis.servicesUp === data.kpis.servicesTotal
          ? 'همه سالم'
          : data.kpis.servicesUp < data.kpis.servicesTotal
            ? 'نیازمند بررسی'
            : '—',
      trendClass:
        data.kpis.servicesTotal > 0 && data.kpis.servicesUp === data.kpis.servicesTotal
          ? 'text-[#34d399]'
          : 'text-[#f59e0b]',
      cta: 'مدیریت ←',
      iconBg: 'rgba(59,130,246,.16)',
      iconColor: '#3b82f6',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="6" rx="2" />
          <rect x="3" y="14" width="18" height="6" rx="2" />
          <path d="M7 7h.01M7 17h.01" />
        </svg>
      ),
      onClick: () => navigate('/panel/services'),
    },
    {
      label: 'آپ‌تایم ۳۰ روز',
      value: faPercent(data.kpis.uptime30dPct),
      trend: data.kpis.uptime30dPct >= 99.5 ? 'پایدار' : 'زیر هدف',
      trendClass:
        data.kpis.uptime30dPct >= 99.5 ? 'text-[#34d399]' : 'text-[#f59e0b]',
      cta: 'لاگ‌ها ←',
      iconBg: 'rgba(16,185,129,.16)',
      iconColor: '#34d399',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M22 12A10 10 0 1 1 12 2" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
      onClick: () => navigate('/panel/logs'),
    },
    {
      label: 'کاربر فعال سامانه',
      value: faDigits(data.kpis.activeSessions),
      trend: data.kpis.activeSessions > 0 ? 'نشست جاری' : 'بدون نشست',
      trendClass:
        data.kpis.activeSessions > 0 ? 'text-[#34d399]' : 'text-[#6b7b94]',
      cta: 'کاربران ←',
      iconBg: 'rgba(147,51,234,.16)',
      iconColor: '#a855f7',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 5a3.2 3.2 0 0 1 0 6.4" />
        </svg>
      ),
      onClick: () => navigate('/panel/users'),
    },
    {
      label: 'هشدار امنیتی باز',
      value: faDigits(data.kpis.securityAlerts),
      trend: data.kpis.securityAlerts > 0 ? 'نیازمند بررسی' : 'بدون هشدار',
      trendClass: data.kpis.securityAlerts > 0 ? 'text-[#f59e0b]' : 'text-[#34d399]',
      cta: 'بررسی ←',
      iconBg: 'rgba(245,158,11,.16)',
      iconColor: '#f59e0b',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
          <path d="M12 9v3M12 15h.01" />
        </svg>
      ),
      onClick: () => navigate('/panel/security'),
    },
  ];

  const resourceBars = [
    { label: 'پردازنده (CPU)', pct: data.resources.cpuUsedPct, color: 'bg-[#3b82f6]' },
    { label: 'حافظه (RAM)', pct: data.resources.memoryUsedPct, color: 'bg-[#a855f7]' },
    ...(data.resources.diskUsedPct !== null
      ? [{ label: 'دیسک', pct: data.resources.diskUsedPct, color: 'bg-[#34d399]' }]
      : []),
    ...(data.resources.bandwidthUsedPct !== null
      ? [{ label: 'پهنای باند', pct: data.resources.bandwidthUsedPct, color: 'bg-[#f59e0b]' }]
      : []),
  ];

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">داشبورد فنی</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">نمای کلی سلامت زیرساخت و سرویس‌های blujet</p>
        </div>
        <div className="flex items-center gap-2">
          {data.kpis.allServicesHealthy && (
            <div className="flex h-[42px] items-center gap-1.5 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 text-[11.5px] font-bold text-[#34d399]">
              <span className="h-2 w-2 rounded-full bg-[#34d399]" />
              همه سامانه‌ها سالم
            </div>
          )}
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border border-[#28344c] bg-[#18223a] text-[#9fb0c7]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.5 21a2 2 0 0 1-3 0" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-[13px] md:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-3.5 text-right transition hover:border-[#3b82f6]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-[11px]"
                style={{ background: k.iconBg, color: k.iconColor }}
              >
                {k.icon}
              </span>
              <span className={`text-[11px] font-bold ${k.trendClass}`}>{k.trend}</span>
            </div>
            <div className="font-num text-[22.5px] font-black text-white">{k.value}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11.5px] text-[#6b7b94]">{k.label}</span>
              <span className="text-[10px] font-bold text-[#3b82f6]">{k.cta}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-[15px] lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="m-0 text-[14.5px] font-extrabold text-white">سلامت سرویس‌ها</h2>
            <button
              type="button"
              onClick={() => navigate('/panel/services')}
              className="text-[11.5px] font-bold text-[#3b82f6]"
            >
              مدیریت سرویس‌ها ←
            </button>
          </div>
          {data.serviceHealth.length === 0 ? (
            <p className="py-3.5 text-center text-[11.5px] text-[#6b7b94]">اطلاعاتی یافت نشد</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.serviceHealth.map((s) => (
                <li key={s.name} className="flex items-center gap-2.5 text-xs">
                  <span
                    className={`h-2.5 w-2.5 flex-none rounded-full ${s.enabled ? 'bg-[#34d399]' : 'bg-[#f87171]'}`}
                  />
                  <span className="flex-1 text-[#cdd6e3]">{s.name}</span>
                  {s.uptimePct !== null && (
                    <span className="font-num text-[11px] text-[#6b7b94]">{faPercent(s.uptimePct)}</span>
                  )}
                  <span
                    className={`rounded-[18px] px-2.5 py-0.5 text-[10.5px] font-bold ${
                      s.enabled
                        ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                        : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                    }`}
                  >
                    {s.enabled ? 'سالم' : 'قطع'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-[15px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="mb-4 text-[14.5px] font-extrabold text-white">استفاده از منابع سرور</h2>
            <div className="flex flex-col gap-[11px] text-[11.5px]">
              {resourceBars.map((r) => (
                <div key={r.label}>
                  <div className="mb-1.5 flex justify-between">
                    <span className="text-[#cdd6e3]">{r.label}</span>
                    <span className="font-num font-bold text-[#9fb0c7]">{faPercent(r.pct)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-md bg-[#1f2a3d]">
                    <div
                      className={`h-full rounded-md ${r.color}`}
                      style={{ width: `${Math.min(100, r.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="mb-3.5 text-[14.5px] font-extrabold text-white">رویدادهای اخیر</h2>
            {data.recentEvents.length === 0 ? (
              <p className="py-3.5 text-center text-[11.5px] text-[#6b7b94]">رویدادی ثبت نشده است.</p>
            ) : (
              <ul className="flex flex-col gap-[11px]">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="flex gap-2.5 text-[11.5px]">
                    <span
                      className={`mt-1.5 h-2 w-2 flex-none rounded-full ${EVENT_DOT[e.category] ?? 'bg-[#6b7b94]'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="leading-relaxed text-[#cdd6e3]">{e.text}</div>
                      <div className="font-num mt-0.5 text-[10px] text-[#6b7b94]">
                        {formatJalaliDateTime(e.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
