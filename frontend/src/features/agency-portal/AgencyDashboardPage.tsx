import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllotments, fetchDashboard } from '../../api/agency-portal';
import { localeMoney } from '../../lib/fa-format';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { AgencyMiniIcon } from './AgencyNavIcon';
import type { AgencyDashboard } from '../../types/agency-portal';

function monthLabel(monthKey: string, locale: StoredLocale): string {
  const [year, month] = monthKey.split('-');
  if (!year || !month) return monthKey;
  const date = new Date(`${year}-${month}-15T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'fa' ? 'fa' : 'en', {
    calendar: 'gregory',
    month: 'short',
  }).format(date);
}

function formatChartValue(irr: string, locale: StoredLocale): string {
  const toman = Math.round(Number(irr) / 10 / 1_000_000);
  if (locale === 'en') return `${toman}M`;
  return localeDigits(toman, locale);
}

const STR: Record<StoredLocale, {
  errorFallback: string;
  loading: string;
  kpiSales: string;
  kpiCredit: string;
  kpiAllocated: string;
  kpiSold: string;
  chartTitle: string;
  chartSub: string;
  chartAriaLabel: string;
  creditCardLabel: string;
  creditLimitOf: (limit: string) => string;
  usedLabel: string;
  viewStatement: string;
  toman: string;
}> = {
  fa: {
    errorFallback: 'خطا در دریافت داشبورد.',
    loading: 'در حال بارگذاری…',
    kpiSales: 'فروش این ماه',
    kpiCredit: 'اعتبار باقیمانده',
    kpiAllocated: 'صندلی تخصیص‌یافته',
    kpiSold: 'صندلی فروخته‌شده',
    chartTitle: 'روند فروش آژانس',
    chartSub: '۶ ماه اخیر · تومان',
    chartAriaLabel: 'نمودار فروش ۶ ماه اخیر',
    creditCardLabel: 'اعتبار باقیمانده',
    creditLimitOf: (limit) => `از سقف ${limit}`,
    usedLabel: 'مصرف‌شده:',
    viewStatement: 'مشاهده صورت‌حساب',
    toman: 'تومان',
  },
  en: {
    errorFallback: 'Error loading the dashboard.',
    loading: 'Loading…',
    kpiSales: 'Sales this month',
    kpiCredit: 'Credit remaining',
    kpiAllocated: 'Seats allocated',
    kpiSold: 'Seats sold',
    chartTitle: 'Agency sales trend',
    chartSub: 'Last 6 months · Toman',
    chartAriaLabel: 'Last 6 months sales chart',
    creditCardLabel: 'Credit remaining',
    creditLimitOf: (limit) => `of ${limit} limit`,
    usedLabel: 'Used:',
    viewStatement: 'View statement',
    toman: 'Toman',
  },
  ar: {
    errorFallback: 'خطأ في تحميل لوحة التحكم.',
    loading: 'جارٍ التحميل…',
    kpiSales: 'مبيعات هذا الشهر',
    kpiCredit: 'الرصيد المتبقي',
    kpiAllocated: 'المقاعد المخصصة',
    kpiSold: 'المقاعد المباعة',
    chartTitle: 'اتجاه مبيعات الوكالة',
    chartSub: 'آخر 6 أشهر · تومان',
    chartAriaLabel: 'مخطط مبيعات آخر 6 أشهر',
    creditCardLabel: 'الرصيد المتبقي',
    creditLimitOf: (limit) => `من سقف ${limit}`,
    usedLabel: 'المستخدم:',
    viewStatement: 'عرض كشف الحساب',
    toman: 'تومان',
  },
};

function KpiCard({
  iconPaths,
  iconBg,
  iconColor,
  value,
  label,
}: {
  iconPaths: string;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 14, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AgencyMiniIcon paths={iconPaths} />
        </div>
      </div>
      <div style={{ fontSize: 21.5, fontWeight: 900, color: '#0d2640', letterSpacing: '-.5px' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#8a96a6', marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function AgencyDashboardPage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const isMobile = useIsMobile(900);
  const [data, setData] = useState<AgencyDashboard | null>(null);
  const [seatsAllocated, setSeatsAllocated] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDashboard(), fetchAllotments()])
      .then(([dash, allotments]) => {
        setData(dash);
        setSeatsAllocated(allotments.reduce((sum, row) => sum + row.seatsAllocated, 0));
      })
      .catch(() => setError(t.errorFallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p style={{ fontSize: 13, color: '#e5484d' }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: '#8a96a6' }}>{t.loading}</p>;

  const max = Math.max(1, ...data.monthlySales.map((m) => Number(m.salesIrr)));
  const limitNum = Number(data.credit.limitIrr);
  const usedNum = Number(data.credit.usedIrr);
  const pct = limitNum > 0 ? Math.round((usedNum / limitNum) * 100) : 0;
  const pctLabel = locale === 'en' ? `${pct}%` : `${localeDigits(pct, locale)}٪`;

  const moneyWithUnit = (irr: string) => `${localeMoney(irr, locale)} ${t.toman}`;

  const kpis = [
    {
      iconPaths: '<path d="M3 3v18h18"/><path d="M7 14l3.5-3.5 3 3L20 7"/>',
      iconBg: '#eef4fb',
      iconColor: '#1668c4',
      value: moneyWithUnit(data.kpis.salesThisMonthIrr),
      label: t.kpiSales,
    },
    {
      iconPaths: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
      iconBg: '#eaf7f0',
      iconColor: '#1f8a5b',
      value: moneyWithUnit(data.credit.remainingIrr),
      label: t.kpiCredit,
    },
    {
      iconPaths: '<path d="M5 11V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/><path d="M5 11h11a2 2 0 0 1 2 2v3H5z"/>',
      iconBg: '#f1ecfe',
      iconColor: '#8a5cf6',
      value: localeDigits(seatsAllocated, locale),
      label: t.kpiAllocated,
    },
    {
      iconPaths: '<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6z"/>',
      iconBg: '#fdf1e7',
      iconColor: '#e8893a',
      value: localeDigits(data.kpis.seatsSoldThisMonth, locale),
      label: t.kpiSold,
    },
  ];

  return (
    <div data-testid="agency-dashboard">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 13,
          marginBottom: 20,
        }}
      >
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr',
          gap: 13,
        }}
      >
        <div style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 14, padding: 14 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0d2640', margin: 0, whiteSpace: 'nowrap' }}>{t.chartTitle}</h3>
            <div style={{ fontSize: 11, color: '#8a96a6', marginTop: 3 }}>{t.chartSub}</div>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'flex-end', gap: 11, height: 170, paddingTop: 5 }}
            role="img"
            aria-label={t.chartAriaLabel}
          >
            {data.monthlySales.map((m) => (
              <div
                key={m.month}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end' }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#5a6678' }}>{formatChartValue(m.salesIrr, locale)}</div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 34,
                    height: `${Math.max((Number(m.salesIrr) / max) * 100, 2)}%`,
                    background: 'linear-gradient(180deg,#3b8ae0,#1668c4)',
                    borderRadius: '7px 7px 0 0',
                  }}
                  aria-label={`${monthLabel(m.month, locale)} — ${localeMoney(m.salesIrr, locale)} ${t.toman}`}
                />
                <div style={{ fontSize: 10.5, color: '#8a96a6', fontWeight: 600 }}>{monthLabel(m.month, locale)}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg,#0d2640,#16406e)',
            borderRadius: 14,
            padding: 15,
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 11.5, color: '#aac4e2', fontWeight: 600 }}>{t.creditCardLabel}</div>
          <div style={{ fontSize: 27, fontWeight: 900, margin: '6px 0 2px', letterSpacing: '-.5px' }}>
            {moneyWithUnit(data.credit.remainingIrr)}
          </div>
          <div style={{ fontSize: 11.5, color: '#8fb0d6' }}>{t.creditLimitOf(moneyWithUnit(data.credit.limitIrr))}</div>
          <div style={{ height: 9, background: 'rgba(255,255,255,.16)', borderRadius: 6, margin: '16px 0 8px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#4ade80,#22c55e)', borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aac4e2' }}>
            <span>
              {t.usedLabel} {moneyWithUnit(data.credit.usedIrr)}
            </span>
            <span>{pctLabel}</span>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 13 }}>
            <Link
              to="/agency/credit"
              data-testid="agency-view-statement"
              style={{
                background: 'rgba(255,255,255,.12)',
                border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 10,
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              {t.viewStatement}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
