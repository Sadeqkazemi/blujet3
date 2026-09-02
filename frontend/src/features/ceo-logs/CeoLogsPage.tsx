import { useEffect, useState } from 'react';
import { fetchSystemEvents } from '../../api/admins';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { SystemEventRow } from '../../types/admins';

const LEVEL_META: Record<
  SystemEventRow['level'],
  { label: string; className: string; darkClassName: string }
> = {
  OK: {
    label: 'موفق',
    className: 'bg-[#10b98124] text-[#059669]',
    darkClassName: 'bg-[rgba(16,185,129,.14)] text-[#34d399]',
  },
  WARN: {
    label: 'هشدار',
    className: 'bg-[#f59e0b24] text-[#b45309]',
    darkClassName: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]',
  },
  INFO: {
    label: 'info',
    className: 'bg-accent/10 text-accent',
    darkClassName: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]',
  },
};

export default function CeoLogsPage() {
  const [rows, setRows] = useState<SystemEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(null);
    try {
      setRows(await fetchSystemEvents({ page: 1, limit: 100 }));
    } catch {
      setError('خطا در دریافت لاگ‌ها.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rowsPager = usePagination(rows ?? []);

  if (error && !rows) {
    return (
      <div className="px-[21px] pt-[18px]">
        <p className="text-sm text-[#f87171]">{error}</p>
        <button
          type="button"
          data-testid="ceo-logs-retry"
          onClick={() => void load()}
          className="mt-3 rounded-[9px] bg-[#1668c4] px-3 py-2 text-xs font-bold text-white"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }
  if (!rows) return <p className="px-[21px] pt-[18px] text-sm text-[#6b7b94]">در حال بارگذاری…</p>;

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">لاگ و رویدادها</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            رصد فعالیت‌ها و رخدادهای کلیدی سامانه و پنل‌های مدیریتی
          </p>
        </div>
        <button
          type="button"
          data-testid="ceo-logs-refresh"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
          className="rounded-[9px] border border-[#28344c] px-3 py-2 text-xs font-bold text-[#c7d2e3]"
        >
          {refreshing ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی'}
        </button>
      </div>

      <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
        <h2 className="m-0 text-[14.5px] font-extrabold text-white">لاگ‌ها و رویدادهای سامانه</h2>
        <p className="mb-4 mt-1 text-[11.5px] text-[#6b7b94]">
          آخرین اقدامات ثبت‌شدهٔ مدیران و رخدادهای کلیدی سامانه
        </p>

        <div className="overflow-hidden rounded-xl border border-[#1f2a3d]">
          <div className="grid grid-cols-[0.8fr_1.2fr_2.4fr_0.9fr] bg-[#18223a] px-[13px] py-2.5 text-[10.5px] font-bold text-[#6b7b94]">
            <span>زمان</span>
            <span>کاربر</span>
            <span>رویداد</span>
            <span className="text-start">سطح</span>
          </div>
          {rows.length === 0 ? (
            <div className="px-[13px] py-7 text-center text-xs text-[#6b7b94]">اطلاعاتی یافت نشد</div>
          ) : (
            rowsPager.pageItems.map((r) => {
              const meta = LEVEL_META[r.level];
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[0.8fr_1.2fr_2.4fr_0.9fr] items-center border-t border-[#1f2a3d] px-[13px] py-[11px]"
                >
                  <span className="font-num whitespace-nowrap text-[11px] text-[#9fb0c7]" dir="ltr">
                    {formatJalaliDateTime(r.at)}
                  </span>
                  <span className="text-[11.5px] font-semibold text-[#e7ecf3]">{r.user}</span>
                  <span className="text-[11.5px] text-[#cdd6e3]">{r.action}</span>
                  <span className="justify-self-start">
                    <span
                      className={`rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${meta.darkClassName}`}
                    >
                      {meta.label}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
        <Pagination
          page={rowsPager.page}
          totalPages={rowsPager.totalPages}
          onChange={rowsPager.setPage}
          variant="dark"
        />
      </div>
    </div>
  );
}
