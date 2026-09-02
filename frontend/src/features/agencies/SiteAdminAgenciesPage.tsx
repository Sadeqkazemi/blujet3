import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchAgencies,
  fetchAgencyRequests,
  fetchAllWebserviceRequests,
} from '../../api/agencies';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits, faMoney } from '../../lib/fa-format';
import type { AgencyListResult, AgencyMembershipRequest } from '../../types/agencies';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';

type SubTab = 'list' | 'webservice';

const SCOPE_LABEL: Record<string, string> = {
  FULL: 'دسترسی کامل',
  SEARCH_BOOK: 'جستجو و رزرو',
};

/**
 * SITE_ADMIN «مدیریت آژانس‌ها» — dark layout matching design screenshots:
 * membership requests, 2 KPIs, partner list / webservice tabs, 10/page.
 */
export default function SiteAdminAgenciesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [subTab, setSubTab] = useState<SubTab>('list');
  const [result, setResult] = useState<AgencyListResult | null>(null);
  const [requests, setRequests] = useState<AgencyMembershipRequest[]>([]);
  const [wsReqs, setWsReqs] = useState<AgencyWebserviceQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, reqs, ws] = await Promise.all([
        fetchAgencies({ q: q || undefined }),
        fetchAgencyRequests(),
        fetchAllWebserviceRequests('PENDING').catch(() => [] as AgencyWebserviceQueueRow[]),
      ]);
      setResult(list);
      setRequests(reqs);
      setWsReqs(ws);
    } catch {
      setError('خطا در دریافت فهرست آژانس‌ها.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'PENDING' || r.status === 'REFERRED'),
    [requests],
  );

  const pendingPager = usePagination(pendingRequests);
  const agenciesPager = usePagination(result?.agencies ?? []);
  const wsPager = usePagination(wsReqs);

  const activeCount = result?.kpis.activeCount ?? result?.agencies.filter((a) => a.isActive).length ?? 0;

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6">
        <h1 className="m-0 text-[20.5px] font-black text-white">مدیریت آژانس‌ها</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          آژانس‌های همکار، درخواست‌های عضویت و پروفایل هر آژانس
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-[12px] border border-[rgba(248,113,113,.28)] bg-[rgba(248,113,113,.1)] px-4 py-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}

      <section className="mb-5 overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="flex flex-wrap items-center gap-[9px] border-b border-[#1f2a3d] px-[15px] py-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(245,158,11,.16)] text-[#f59e0b]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <h2 className="m-0 text-sm font-extrabold text-white">درخواست‌های جدید عضویت</h2>
          <span className="rounded-full bg-[rgba(245,158,11,.14)] px-3 py-1 text-[11px] font-bold text-[#f59e0b]">
            {faDigits(pendingRequests.length)} در انتظار
          </span>
        </div>
        {pendingRequests.length === 0 ? (
          <p className="py-[18px] text-center text-xs text-[#6b7b94]">
            درخواست جدیدی در انتظار تأیید نیست.
          </p>
        ) : (
          <ul>
            {pendingPager.pageItems.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a2436] px-[15px] py-[11px] last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#241d12] text-sm font-black text-[#f59e0b]">
                    {r.applicantName.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-extrabold text-[#e7ecf3]">{r.applicantName}</div>
                    <div className="mt-0.5 text-[11px] text-[#6b7b94]">
                      مدیر: {r.managerName} · مجوز{' '}
                      <span className="ltr font-num">{r.licenseNo}</span>
                      {r.city ? ` · ${r.city}` : ''}
                    </div>
                  </div>
                </div>
                <Link
                  to={`/panel/agencies/requests/${r.id}`}
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#1668c4] px-[13px] py-2 text-[11.5px] font-bold text-white transition hover:bg-[#1a74d4]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3-3" />
                  </svg>
                  بررسی درخواست
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={pendingPager.page}
          totalPages={pendingPager.totalPages}
          onChange={pendingPager.setPage}
          variant="dark"
        />
      </section>

      <div className="mb-5 grid grid-cols-2 gap-[13px]">
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">آژانس‌های فعال</div>
          <div className="font-num mt-1 text-[22px] font-black text-[#60a5fa]">{faDigits(activeCount)}</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">درخواست‌های در انتظار عضویت</div>
          <div className="font-num mt-1 text-[22px] font-black text-[#f59e0b]">
            {faDigits(pendingRequests.length)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSubTab('list')}
          className={`rounded-full px-4 py-2 text-xs font-bold transition ${
            subTab === 'list'
              ? 'bg-[#1668c4] text-white'
              : 'bg-[#18223a] text-[#6b7b94] hover:text-[#e7ecf3]'
          }`}
        >
          آژانس‌های همکار
        </button>
        <button
          type="button"
          onClick={() => setSubTab('webservice')}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
            subTab === 'webservice'
              ? 'bg-[#1668c4] text-white'
              : 'bg-[#18223a] text-[#6b7b94] hover:text-[#e7ecf3]'
          }`}
        >
          درخواست وب‌سرویس
          {wsReqs.length > 0 && (
            <span className="rounded-full bg-[rgba(245,158,11,.2)] px-2 py-0.5 text-[10px] text-[#f59e0b]">
              {faDigits(wsReqs.length)}
            </span>
          )}
        </button>
      </div>

      {subTab === 'list' && (
        <>
          <div className="mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی آژانس بر اساس نام، مجوز، مدیر یا شهر…"
              className="h-[46px] w-full rounded-[12px] border border-[#28344c] bg-[#0b1220] px-4 text-xs text-[#e7ecf3] outline-none transition focus:border-[#1668c4]"
            />
          </div>
          {loading ? (
            <p className="py-10 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
          ) : (result?.agencies.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-[#6b7b94]">آژانسی یافت نشد.</p>
          ) : (
            <ul className="space-y-2.5">
              {agenciesPager.pageItems.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/panel/agencies/${a.id}`)}
                    className="flex w-full flex-wrap items-center gap-4 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4 text-right transition hover:border-[#3b82f6]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#18223a] text-base font-black text-[#60a5fa]">
                      {a.fullName.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-[#e7ecf3]">{a.fullName}</div>
                      <div className="mt-0.5 text-[11px] text-[#6b7b94]">
                        مجوز <span className="ltr font-num">{a.licenseNo}</span> · {a.city}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10.5px] font-bold ${
                        a.isActive
                          ? 'bg-[rgba(52,211,153,.14)] text-[#34d399]'
                          : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                      }`}
                    >
                      {a.isActive ? 'فعال' : 'معلق'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={agenciesPager.page}
            totalPages={agenciesPager.totalPages}
            onChange={agenciesPager.setPage}
            variant="dark"
          />
        </>
      )}

      {subTab === 'webservice' && (
        <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
          <div className="border-b border-[#1f2a3d] px-[15px] py-3 text-sm font-extrabold text-white">
            درخواست‌های خرید وب‌سرویس
          </div>
          {wsReqs.length === 0 ? (
            <p className="py-10 text-center text-xs text-[#6b7b94]">درخواست وب‌سرویس در انتظاری نیست.</p>
          ) : (
            <ul>
              {wsPager.pageItems.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a2436] px-[15px] py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-extrabold text-[#e7ecf3]">{r.agencyName}</div>
                    <div className="mt-0.5 text-[11px] text-[#6b7b94]">
                      {SCOPE_LABEL[r.scope] ?? r.scope} · {faDigits(r.months)} ماه ·{' '}
                      <span className="font-num">{faMoney(r.priceIrr)} تومان</span> · {r.city}
                    </div>
                  </div>
                  <Link
                    to={`/panel/agencies/${r.agencyId}`}
                    className="rounded-[9px] border border-[rgba(59,130,246,.35)] bg-[rgba(59,130,246,.12)] px-3 py-2 text-[11.5px] font-bold text-[#60a5fa]"
                  >
                    بررسی ←
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={wsPager.page}
            totalPages={wsPager.totalPages}
            onChange={wsPager.setPage}
            variant="dark"
          />
        </section>
      )}
    </div>
  );
}
