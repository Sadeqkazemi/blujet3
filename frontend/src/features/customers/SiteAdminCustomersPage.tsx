import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  fetchCustomer,
  fetchCustomers,
} from '../../api/customers';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import type {
  CustomerClubLevel,
  CustomerDetail,
  CustomerListItem,
} from '../../types/customers';

type DetailTab = 'info' | 'purchases' | 'contacts' | 'refunds' | 'club';

const CLUB_META: Record<
  CustomerClubLevel | 'NONE',
  { label: string; color: string; bg: string }
> = {
  PLATINUM: { label: 'پلاتینیوم', color: '#a5b4fc', bg: 'rgba(165,180,252,.14)' },
  GOLD: { label: 'طلایی', color: '#fbbf24', bg: 'rgba(251,191,36,.14)' },
  SILVER: { label: 'نقره‌ای', color: '#cbd5e1', bg: 'rgba(203,213,225,.14)' },
  NONE: { label: 'بدون سطح', color: '#6b7b94', bg: 'rgba(107,123,148,.12)' },
};

const DOC_STATUS = {
  verified: { label: 'تأییدشده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  pending: { label: 'در انتظار بررسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  rejected: { label: 'رد شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
} as const;

const PURCH_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  TICKETED: { label: 'صادر شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  FLOWN: { label: 'صادر شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  PAID: { label: 'تأییدشده', color: '#60a5fa', bg: 'rgba(96,165,250,.14)' },
  CANCELLED: { label: 'لغو شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
  REFUNDED: { label: 'لغو شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
  EXPIRED: { label: 'لغو شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
  HELD: { label: 'رزرو موقت', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  DRAFT: { label: 'پیش‌نویس', color: '#6b7b94', bg: 'rgba(107,123,148,.14)' },
};

const CONTACT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'باز', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  IN_PROGRESS: { label: 'باز', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  ANSWERED: { label: 'بسته شده', color: '#6b7b94', bg: 'rgba(107,123,148,.14)' },
  CLOSED: { label: 'بسته شده', color: '#6b7b94', bg: 'rgba(107,123,148,.14)' },
};

const REFUND_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  SUBMITTED: { label: 'ثبت‌شده', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  REVIEW: { label: 'در بررسی', color: '#60a5fa', bg: 'rgba(96,165,250,.14)' },
  FINANCE: { label: 'صف پرداخت', color: '#a78bfa', bg: 'rgba(167,139,250,.14)' },
  PAID: { label: 'پرداخت‌شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
};

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'info', label: 'اطلاعات و مدارک' },
  { id: 'purchases', label: 'تاریخچه خرید' },
  { id: 'refunds', label: 'تاریخچه استرداد' },
  { id: 'contacts', label: 'تماس‌ها و تیکت‌ها' },
  { id: 'club', label: 'باشگاه مشتریان' },
];

function clubMeta(level: CustomerClubLevel | null | undefined) {
  return level ? CLUB_META[level] : CLUB_META.NONE;
}

function nameDisp(fullName: string) {
  return fullName.trim() ? fullName.trim() : '— بدون نام —';
}

/** Show Iranian mobiles as 09… even if API sent E.164. */
function displayMobile(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+989') && digits.length === 13) {
    return faDigits(`0${digits.slice(3)}`);
  }
  if (digits.startsWith('989') && digits.length === 12) {
    return faDigits(`0${digits.slice(2)}`);
  }
  return faDigits(phone);
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7b94" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
    </svg>
  );
}

function IdCardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.2" />
      <path d="M14 10.5h4M14 13.5h3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h4l1.5 4-2.2 1.4a12 12 0 0 0 5.3 5.3L17 11.5l4 1.5v4a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function InfoField({
  label,
  value,
  empty,
  ltr,
  icon,
}: {
  label: string;
  value: string;
  empty?: boolean;
  ltr?: boolean;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[#28344c] bg-[#18223a] px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#6b7b94]">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-[#141d2e] text-[#9fb0c7]">
          {icon}
        </span>
        {label}
      </div>
      <div
        className="text-[13.5px] font-extrabold"
        dir={ltr ? 'ltr' : undefined}
        style={{ color: empty ? '#f59e0b' : '#fff', textAlign: ltr ? 'left' : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function CustomerListView({
  customers,
  loading,
  error,
  query,
  onQuery,
}: {
  customers: CustomerListItem[];
  loading: boolean;
  error: string | null;
  query: string;
  onQuery: (v: string) => void;
}) {
  const navigate = useNavigate();
  const pager = usePagination(customers);

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="m-0 text-[20.5px] font-black text-white">مشتریان</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          فهرست مشتریان ثبت‌نام‌شده، جستجو بر اساس موبایل و مشاهده‌ی جزئیات هر مشتری
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}

      <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[18px]">
        <div className="mb-[18px] flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-white">
              مشتریان ثبت‌نام‌شده
            </h3>
            <p className="m-0 text-[11.5px] text-[#6b7b94]">
              جستجو بر اساس شماره موبایل — پروفایل‌های ناقص با علامت اخطار مشخص شده‌اند.
            </p>
          </div>
          <span className="rounded-[14px] border border-[#28344c] bg-[#18223a] px-3 py-1.5 text-[11.5px] font-bold text-[#9fb0c7]">
            {faDigits(customers.length)} مشتری
          </span>
        </div>

        <div className="mb-4 flex max-w-[420px] gap-2">
          <div className="flex h-[50px] flex-1 items-center gap-2 rounded-[11px] border border-[#28344c] bg-[#18223a] px-[13px]">
            <SearchIcon />
            <input
              dir="ltr"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="مثال: 09123456789"
              className="flex-1 border-none bg-transparent text-right font-sans text-[12.5px] text-[#e7ecf3] outline-none"
              aria-label="جستجوی موبایل مشتری"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#2a3550]">
          <div className="grid grid-cols-[2fr_1.3fr_1.3fr_.8fr] gap-2 bg-[#18223a] px-3.5 py-2.5 text-[11px] font-bold text-[#6b7b94]">
            <span>نام و نام خانوادگی</span>
            <span>موبایل</span>
            <span>کد ملی</span>
            <span>وضعیت</span>
          </div>
          {loading && (
            <div className="p-[26px] text-center text-xs text-[#6b7b94]">در حال بارگذاری…</div>
          )}
          {!loading &&
            pager.pageItems.map((c) => {
              const warn = c.profileIncomplete;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/panel/customers/${c.id}`)}
                  className="grid w-full grid-cols-[2fr_1.3fr_1.3fr_.8fr] items-center gap-2 border-t border-[#1f2a3d] px-3.5 py-3 text-right hover:bg-[#18223a]"
                >
                  <span className="flex items-center gap-[7px] text-[12.5px] font-bold text-white">
                    {warn && (
                      <span className="text-sm text-[#f59e0b]" title="اطلاعات ناقص">
                        ⚠
                      </span>
                    )}
                    {nameDisp(c.fullName)}
                  </span>
                  <span dir="ltr" className="font-mono text-xs text-[#cdd7e5]">
                    {displayMobile(c.phone)}
                  </span>
                  <span dir="ltr" className="font-mono text-xs text-[#cdd7e5]">
                    {c.nationalId ? faDigits(c.nationalId) : '—'}
                  </span>
                  <span
                    className="w-fit rounded-xl px-[9px] py-1 text-[11px] font-bold"
                    style={{
                      color: warn ? '#f59e0b' : '#34d399',
                      background: warn
                        ? 'rgba(245,158,11,.14)'
                        : 'rgba(52,211,153,.14)',
                    }}
                  >
                    {warn ? 'ناقص' : 'کامل'}
                  </span>
                </button>
              );
            })}
          {!loading && customers.length === 0 && (
            <div className="p-[26px] text-center text-xs text-[#6b7b94]">
              مشتری‌ای با این شماره موبایل یافت نشد.
            </div>
          )}
        </div>

        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          onChange={pager.setPage}
        />
      </div>
    </div>
  );
}

function CustomerDetailView({
  detail,
  loading,
  error,
}: {
  detail: CustomerDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const [tab, setTab] = useState<DetailTab>('info');

  if (loading) {
    return (
      <div className="px-[21px] pb-[34px] pt-[18px] text-sm text-[#6b7b94]">
        در حال بارگذاری…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="px-[21px] pb-[34px] pt-[18px]">
        <Link
          to="/panel/customers"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#9fb0c7]"
        >
          ← بازگشت به فهرست مشتریان
        </Link>
        <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error ?? 'مشتری یافت نشد.'}
        </p>
      </div>
    );
  }

  const warn = detail.profileIncomplete;
  const club = clubMeta(detail.club.level);
  const initial = (detail.fullName.trim() || '؟').slice(0, 1);
  const displayName = nameDisp(detail.fullName);

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-1">
        <h1 className="m-0 text-[20.5px] font-black text-white">مشتریان</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          فهرست مشتریان ثبت‌نام‌شده، جستجو بر اساس موبایل و مشاهده‌ی جزئیات هر مشتری
        </p>
      </div>

      <Link
        to="/panel/customers"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-[#9fb0c7]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        بازگشت به فهرست مشتریان
      </Link>

      <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[18px]">
        <span
          className="flex h-14 w-14 flex-none items-center justify-center rounded-full text-base font-extrabold text-white"
          style={{
            background: 'linear-gradient(135deg,#3b82f6,#9333ea)',
          }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1 leading-relaxed">
          <div className="flex flex-wrap items-center gap-2 text-base font-extrabold text-white">
            {displayName}
            {warn && (
              <span className="rounded-xl bg-[rgba(245,158,11,.14)] px-[9px] py-[3px] text-[10.5px] font-bold text-[#f59e0b]">
                ⚠ اطلاعات ناقص
              </span>
            )}
          </div>
          <div className="mt-[3px] text-[11.5px] text-[#9fb0c7]" dir="ltr">
            {displayMobile(detail.phone)} · {detail.email || '—'}
          </div>
        </div>
        <div className="text-end">
          <div className="mb-1 text-[11px] text-[#6b7b94]">باشگاه مشتریان</div>
          <span
            className="rounded-[14px] px-[13px] py-1.5 text-xs font-extrabold"
            style={{ color: club.color, background: club.bg }}
          >
            {club.label} · {faDigits(detail.club.points.toLocaleString('en-US').replace(/,/g, '٬'))}{' '}
            امتیاز
          </span>
        </div>
      </div>

      <div className="flex w-fit max-w-full flex-wrap gap-[3px] rounded-[11px] border border-[#1f2a3d] bg-[#0f1623] p-[3px]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="rounded-[9px] px-3.5 py-2 text-[11.5px]"
              style={{
                fontWeight: active ? 700 : 500,
                color: active ? '#fff' : '#9fb0c7',
                background: active ? 'rgba(59,130,246,.16)' : 'transparent',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'info' && (
        <>
          <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
            <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">اطلاعات شخصی</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoField
                label="نام و نام خانوادگی"
                value={detail.fullName.trim() || 'ثبت نشده'}
                empty={!detail.fullName.trim()}
                icon={<UserIcon />}
              />
              <InfoField
                label="کد ملی"
                value={detail.nationalId ? faDigits(detail.nationalId) : 'ثبت نشده'}
                empty={!detail.nationalId}
                ltr
                icon={<IdCardIcon />}
              />
              <InfoField
                label="موبایل"
                value={displayMobile(detail.phone)}
                empty={!detail.phone}
                ltr
                icon={<PhoneIcon />}
              />
              <InfoField
                label="ایمیل"
                value={detail.email || 'ثبت نشده'}
                empty={!detail.email}
                ltr
                icon={<MailIcon />}
              />
              <InfoField
                label="تاریخ ثبت‌نام"
                value={formatJalaliDate(detail.registeredAt)}
                icon={<CalendarIcon />}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
            <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">
              مدارک هویتی بارگذاری‌شده
            </h3>
            {detail.docs.length === 0 ? (
              <div className="rounded-[11px] border border-dashed border-[#28344c] p-4 text-center text-xs text-[#6b7b94]">
                هیچ مدرکی بارگذاری نشده است.
              </div>
            ) : (
              detail.docs.map((d) => {
                const st = DOC_STATUS[d.status];
                return (
                  <div
                    key={`${d.type}-${d.file}`}
                    className="mb-2 flex items-center gap-2.5 rounded-[11px] border border-[#28344c] px-3 py-2.5"
                  >
                    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-[#18223a] text-[#9fb0c7]">
                      <FileIcon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-bold text-white">{d.type}</div>
                      <div className="mt-0.5 text-[10.5px] text-[#6b7b94]" dir="ltr">
                        {d.file}
                      </div>
                    </div>
                    <span
                      className="rounded-xl px-2.5 py-1 text-[10.5px] font-bold"
                      style={{ color: st.color, background: st.bg }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {tab === 'purchases' && (
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
          <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">تاریخچه خرید</h3>
          {detail.purchases.length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-[#28344c] p-4 text-center text-xs text-[#6b7b94]">
              هیچ خریدی ثبت نشده است.
            </div>
          ) : (
            detail.purchases.map((p) => {
              const st = PURCH_STATUS[p.status] ?? {
                label: p.status,
                color: '#9fb0c7',
                bg: 'rgba(159,176,199,.14)',
              };
              return (
                <div
                  key={p.id}
                  className="mb-2 flex flex-wrap items-center gap-3 rounded-[11px] border border-[#28344c] px-3 py-[11px]"
                >
                  <div className="min-w-[140px] flex-1">
                    <div className="text-[12.5px] font-bold text-white">{p.route}</div>
                    <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">
                      {formatJalaliDate(p.date)} · PNR:{' '}
                      <span dir="ltr">{p.pnr}</span>
                    </div>
                  </div>
                  <span className="text-[12.5px] font-extrabold text-[#34d399]">
                    {faMoney(p.priceIrr)} تومان
                  </span>
                  <span
                    className="rounded-xl px-2.5 py-1 text-[10.5px] font-bold"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'refunds' && (
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
          <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">
            تاریخچه استرداد مبالغ بلیط
          </h3>
          {(detail.refunds ?? []).length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-[#28344c] p-4 text-center text-xs text-[#6b7b94]">
              هیچ درخواست استردادی ثبت نشده است.
            </div>
          ) : (
            (detail.refunds ?? []).map((r) => {
              const st = REFUND_STATUS[r.status] ?? {
                label: r.status,
                color: '#9fb0c7',
                bg: 'rgba(159,176,199,.14)',
              };
              return (
                <div
                  key={r.id}
                  className="mb-2 rounded-[11px] border border-[#28344c] px-3 py-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[160px] flex-1">
                      <div className="text-[12.5px] font-bold text-white">{r.route}</div>
                      <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">
                        {formatJalaliDate(r.createdAt)} · PNR:{' '}
                        <span dir="ltr">{r.pnr}</span>
                        {' · '}
                        <span dir="ltr">{r.trackingCode}</span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-[#9fb0c7]">
                        مسافر: {r.passengerName}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[12.5px] font-extrabold text-[#34d399]">
                        {faMoney(r.refundableIrr)} تومان
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#6b7b94]">
                        جریمه {faDigits(r.penaltyPct)}٪ · کل پرداخت{' '}
                        {faMoney(r.totalPaidIrr)}
                      </div>
                    </div>
                    <span
                      className="rounded-xl px-2.5 py-1 text-[10.5px] font-bold"
                      style={{ color: st.color, background: st.bg }}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
          <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">
            تاریخچه تماس و تیکت‌ها
          </h3>
          {detail.contacts.length === 0 ? (
            <div className="rounded-[11px] border border-dashed border-[#28344c] p-4 text-center text-xs text-[#6b7b94]">
              هیچ تماس یا تیکتی ثبت نشده است.
            </div>
          ) : (
            detail.contacts.map((c) => {
              const st = CONTACT_STATUS[c.status] ?? {
                label: c.status,
                color: '#6b7b94',
                bg: 'rgba(107,123,148,.14)',
              };
              return (
                <div
                  key={c.id}
                  className="mb-2 flex flex-wrap items-center gap-3 rounded-[11px] border border-[#28344c] px-3 py-[11px]"
                >
                  <span className="rounded-[10px] bg-[#18223a] px-2.5 py-1 text-[10.5px] font-bold text-[#9fb0c7]">
                    {c.channel}
                  </span>
                  <div className="min-w-[140px] flex-1">
                    <div className="text-[12.5px] font-bold text-white">{c.subject}</div>
                    <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">
                      {formatJalaliDate(c.date)}
                    </div>
                  </div>
                  <span
                    className="rounded-xl px-2.5 py-1 text-[10.5px] font-bold"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'club' && (
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
          <h3 className="m-0 mb-3.5 text-[13.5px] font-extrabold text-white">
            وضعیت باشگاه مشتریان
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="rounded-[14px] px-[18px] py-[9px] text-[13px] font-extrabold"
              style={{ color: club.color, background: club.bg }}
            >
              سطح: {club.label}
            </span>
            <div>
              <div className="mb-1 text-[11px] text-[#6b7b94]">امتیاز فعلی</div>
              <div className="text-[19px] font-black text-white">
                {faDigits(detail.club.points.toLocaleString('en-US').replace(/,/g, '٬'))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SITE_ADMIN «مشتریان» — list + detail tabs matching design screenshots.
 */
export default function SiteAdminCustomersPage() {
  const { customerId } = useParams<{ customerId?: string }>();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers(debouncedQ || undefined);
      setCustomers(data.customers);
    } catch {
      setError('خطا در دریافت فهرست مشتریان.');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const data = await fetchCustomer(id);
      setDetail(data);
    } catch {
      setError('خطا در دریافت جزئیات مشتری.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customerId) {
      void loadDetail(customerId);
    } else {
      void loadList();
    }
  }, [customerId, loadDetail, loadList]);

  const listQuery = useMemo(() => query, [query]);

  if (customerId) {
    return <CustomerDetailView detail={detail} loading={loading} error={error} />;
  }

  return (
    <CustomerListView
      customers={customers}
      loading={loading}
      error={error}
      query={listQuery}
      onQuery={setQuery}
    />
  );
}
