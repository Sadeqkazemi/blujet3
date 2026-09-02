import { useEffect, useState } from 'react';
import { fetchFlightops, fetchFlightopsDetail, submitFlightopsToNira } from '../../api/flightops';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { airportCityName } from '../../lib/airport-cities';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { FlightopsDetail, FlightopsList, FlightopsRow } from '../../types/flightops';

const AUTO_CLOSE_HOURS = 4;

const STATUS_STYLE = {
  open: { label: 'باز', className: 'bg-[rgba(52,211,153,.14)] text-[#34d399]' },
  closed: { label: 'بسته‌شده', className: 'bg-[#8b97a824] text-[#8a97ab]' },
};

function routeLabel(originCode: string, destCode: string): string {
  return `${airportCityName(originCode, 'fa')} ← ${airportCityName(destCode, 'fa')}`;
}

/** Hours remaining until sale auto-closes (4h before departure); null if already due. */
function hoursUntilAutoClose(departureAt: string, now = Date.now()): number | null {
  const closeAt = new Date(departureAt).getTime() - AUTO_CLOSE_HOURS * 3_600_000;
  const ms = closeAt - now;
  if (ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 3_600_000));
}

function NiraCell({ row }: { row: FlightopsRow }) {
  if (row.niraSubmittedAt) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#34d399]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          بارگذاری در نیرا
        </span>
        {row.niraSubmittedAt && (
          <span className="font-num text-[10px] text-[#6b7b94]">
            {formatJalaliDateTime(row.niraSubmittedAt)}
          </span>
        )}
      </div>
    );
  }
  if (row.closed) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-bold text-[#f87171]">ارسال به نیرا ناموفق</span>
        <span className="text-[10px] text-[#6b7b94]">نیازمند ارسال دستی</span>
      </div>
    );
  }
  const hours = hoursUntilAutoClose(row.departureAt);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold text-[#f59e0b]">در انتظار بسته‌شدن</span>
      {hours !== null && (
        <span className="text-[10px] text-[#6b7b94]">
          بسته‌شدن خودکار تا {faDigits(hours)} ساعت دیگر
        </span>
      )}
    </div>
  );
}

export default function FlightOpsPage() {
  const [list, setList] = useState<FlightopsList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlightopsDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [niraSubmitting, setNiraSubmitting] = useState(false);
  const [niraSubmitError, setNiraSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchFlightops()
      .then(setList)
      .catch(() => setError('خطا در دریافت لیست پروازها.'));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setDetailError(null);
    setNiraSubmitError(null);
    fetchFlightopsDetail(selectedId)
      .then(setDetail)
      .catch(() => setDetailError('خطا در دریافت جزئیات پرواز.'));
  }, [selectedId]);

  async function handleNiraSubmit() {
    if (!selectedId || niraSubmitting) return;
    setNiraSubmitting(true);
    setNiraSubmitError(null);
    try {
      await submitFlightopsToNira(selectedId);
      const refreshed = await fetchFlightopsDetail(selectedId);
      setDetail(refreshed);
      const listRefreshed = await fetchFlightops();
      setList(listRefreshed);
    } catch {
      setNiraSubmitError('ارسال دستی به سامانه نیرا ناموفق بود. اتصال سامانه را بررسی و دوباره تلاش کنید.');
    } finally {
      setNiraSubmitting(false);
    }
  }

  const rowsPager = usePagination(list?.rows ?? []);
  const manifestPager = usePagination(detail?.manifest ?? []);

  if (error) {
    return <p className="px-[21px] py-[18px] text-sm text-[#f87171]">{error}</p>;
  }
  if (!list) {
    return <p className="px-[21px] py-[18px] text-sm text-[#6b7b94]">در حال بارگذاری…</p>;
  }

  if (selectedId) {
    return (
      <div className="px-[21px] pb-[34px] pt-[18px]">
        <button
          type="button"
          data-testid="fo-back"
          onClick={() => setSelectedId(null)}
          className="mb-4 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-[#6b7b94] hover:text-[#e7ecf3]"
        >
          ← بازگشت به لیست پروازها
        </button>

        {detailError && <p className="text-sm text-[#f87171]">{detailError}</p>}
        {!detail && !detailError && <p className="text-sm text-[#6b7b94]">در حال بارگذاری…</p>}

        {detail && (
          <div data-testid="fo-detail" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
              <div>
                <div className="text-base font-black text-white">
                  {routeLabel(detail.originCode, detail.destCode)}
                </div>
                <div className="mt-1 text-xs text-[#6b7b94]">
                  شماره پرواز <span className="font-num ltr">{detail.flightNo}</span> ·{' '}
                  {formatJalaliDateTime(detail.departureAt)}
                </div>
              </div>
              <span
                data-testid="fo-status-pill"
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${STATUS_STYLE[detail.closed ? 'closed' : 'open'].className}`}
              >
                {STATUS_STYLE[detail.closed ? 'closed' : 'open'].label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
                <div className="text-[11px] text-[#6b7b94]">صندلی فروخته‌شده</div>
                <div className="font-num mt-1 text-lg font-black text-white">{faDigits(detail.sold)}</div>
              </div>
              <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
                <div className="text-[11px] text-[#6b7b94]">صندلی خالی</div>
                <div className="font-num mt-1 text-lg font-black text-[#f59e0b]">{faDigits(detail.free)}</div>
              </div>
              <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
                <div className="text-[11px] text-[#6b7b94]">ظرفیت کل</div>
                <div className="font-num mt-1 text-lg font-black text-white">{faDigits(detail.capacity)}</div>
              </div>
              <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
                <div className="text-[11px] text-[#6b7b94]">ضریب اشغال</div>
                <div className="font-num mt-1 text-lg font-black text-[#34d399]">
                  {faDigits(detail.occupancyPct)}٪
                </div>
              </div>
            </div>

            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-5">
              <div className="mb-3 text-sm font-bold text-white">سامانه نیرا — بارگذاری لیست مسافران</div>
              {detail.niraSubmittedAt ? (
                <div
                  data-testid="fo-nira-done"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[rgba(52,211,153,.1)] p-3 text-xs"
                >
                  <span className="font-bold text-[#34d399]">لیست مسافران در سامانه نیرا ثبت شد</span>
                  <span className="font-num text-[#6b7b94]">{formatJalaliDateTime(detail.niraSubmittedAt)}</span>
                </div>
              ) : detail.closed ? (
                <div
                  data-testid="fo-nira-pending"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[rgba(248,113,113,.1)] p-3 text-xs font-bold text-[#f87171]"
                >
                  <span>ارسال خودکار ناموفق بود؛ ارسال دستی را انجام دهید.</span>
                  <button
                    type="button"
                    data-testid="fo-nira-submit"
                    onClick={handleNiraSubmit}
                    disabled={niraSubmitting}
                    className="rounded-[8px] border-0 bg-[#7c3aed] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {niraSubmitting ? 'در حال ارسال…' : 'ارسال به نیرا'}
                  </button>
                </div>
              ) : (
                <div
                  data-testid="fo-nira-pending"
                  className="rounded-[10px] bg-[rgba(245,158,11,.1)] p-3 text-xs font-bold text-[#f59e0b]"
                >
                  در انتظار بسته‌شدن فروش
                </div>
              )}
              {niraSubmitError && <p className="mt-2 text-xs text-[#f87171]">{niraSubmitError}</p>}
            </div>

            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-5">
              <div className="mb-3 text-sm font-bold text-white">
                لیست مسافران ({faDigits(detail.manifest.length)} نفر)
              </div>
              {detail.manifest.length === 0 ? (
                <p className="py-4 text-center text-xs text-[#6b7b94]">مسافری برای این پرواز ثبت نشده است.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-[#1f2a3d] text-[10px] text-[#6b7b94]">
                          <th className="py-2 font-bold">#</th>
                          <th className="py-2 font-bold">نام</th>
                          <th className="py-2 font-bold">کد ملی</th>
                          <th className="py-2 font-bold">صندلی</th>
                          <th className="py-2 font-bold">شماره بلیط</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifestPager.pageItems.map((p, i) => {
                          const rowNum = (manifestPager.page - 1) * manifestPager.pageSize + i + 1;
                          return (
                            <tr key={`${p.pnr}-${rowNum}`} className="border-b border-[#1a2436] hover:bg-[#18223a]/50">
                              <td className="font-num py-2.5 text-[#9fb0c7]">{faDigits(rowNum)}</td>
                              <td className="py-2.5 font-bold text-[#e7ecf3]">{p.fullName}</td>
                              <td className="font-num ltr py-2.5 text-[#9fb0c7]">
                                {p.nationalId ? faDigits(p.nationalId) : '—'}
                              </td>
                              <td className="font-num ltr py-2.5 text-[#9fb0c7]">{p.seatCode ?? '—'}</td>
                              <td className="font-num ltr py-2.5 text-[#9fb0c7]">{p.pnr}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={manifestPager.page}
                    totalPages={manifestPager.totalPages}
                    onChange={manifestPager.setPage}
                    variant="dark"
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="m-0 text-[20.5px] font-black text-white">پروازها</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          مدیریت پرواز، بستن و بارگذاری لیست مسافران در سامانه نیرا
        </p>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-[14px] border border-[rgba(59,130,246,.28)] bg-[rgba(59,130,246,.1)] px-4 py-3.5">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.18)] text-[#60a5fa]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <p className="m-0 text-[12px] leading-6 text-[#9fb0c7]">
          فروش هر پرواز ۴ ساعت مانده به زمان پرواز به‌صورت خودکار بسته می‌شود و لیست کامل مسافران
          به‌صورت اتومات در سامانه نیرا بارگذاری می‌گردد. با کلیک روی هر پرواز جزئیات و لیست مسافران
          نمایش داده می‌شود.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-[13px] md:grid-cols-4">
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">کل پروازها</div>
          <div className="font-num mt-1 text-[22px] font-black text-white">{faDigits(list.kpis.total)}</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">باز (در حال فروش)</div>
          <div className="font-num mt-1 text-[22px] font-black text-[#34d399]">{faDigits(list.kpis.open)}</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">بسته‌شده / در نیرا</div>
          <div className="font-num mt-1 text-[22px] font-black text-[#60a5fa]">{faDigits(list.kpis.closed)}</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="text-[11px] text-[#6b7b94]">مجموع مسافران</div>
          <div className="font-num mt-1 text-[22px] font-black text-[#60a5fa]">
            {faDigits(list.kpis.soldTotal)}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="border-b border-[#1f2a3d] px-[15px] py-3 text-sm font-extrabold text-white">
          لیست پروازها
        </div>
        {list.rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-[#6b7b94]">پروازی برای نمایش وجود ندارد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#1f2a3d] text-[10px] text-[#6b7b94]">
                  <th className="px-4 py-3 font-bold">مسیر</th>
                  <th className="px-4 py-3 font-bold">شماره پرواز</th>
                  <th className="px-4 py-3 font-bold">تاریخ و ساعت</th>
                  <th className="px-4 py-3 font-bold">فروش / ظرفیت</th>
                  <th className="px-4 py-3 font-bold">وضعیت فروش</th>
                  <th className="px-4 py-3 font-bold">سامانه نیرا</th>
                </tr>
              </thead>
              <tbody>
                {rowsPager.pageItems.map((row) => (
                  <tr
                    key={row.id}
                    data-testid={`fo-row-${row.id}`}
                    onClick={() => setSelectedId(row.id)}
                    className="cursor-pointer border-b border-[#1a2436] last:border-0 hover:bg-[#18223a]/60"
                  >
                    <td className="px-4 py-3.5 font-bold text-[#e7ecf3]">
                      {routeLabel(row.originCode, row.destCode)}
                    </td>
                    <td className="font-num ltr px-4 py-3.5 text-[#9fb0c7]">{row.flightNo}</td>
                    <td className="font-num px-4 py-3.5 text-[#9fb0c7]">
                      {formatJalaliDateTime(row.departureAt)}
                    </td>
                    <td className="font-num px-4 py-3.5 font-bold text-[#e7ecf3]">
                      {faDigits(row.sold)} / {faDigits(row.capacity)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[row.closed ? 'closed' : 'open'].className}`}
                      >
                        {STATUS_STYLE[row.closed ? 'closed' : 'open'].label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <NiraCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-[15px] pb-4">
          <Pagination
            page={rowsPager.page}
            totalPages={rowsPager.totalPages}
            onChange={rowsPager.setPage}
            variant="dark"
          />
        </div>
      </section>
    </div>
  );
}
