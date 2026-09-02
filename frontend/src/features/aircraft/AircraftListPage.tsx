import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAircraftDefinitions } from '../../api/aircraft';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { AIRCRAFT_CABIN_OPTIONS, type AircraftDefinitionListItem } from '../../types/aircraft';

function cabinSummary(row: AircraftDefinitionListItem): string {
  if (!row.cabins?.length) return '—';
  return row.cabins
    .map((c) => {
      const label =
        AIRCRAFT_CABIN_OPTIONS.find((o) => o.value === c.cabinType)?.label ?? c.cabinType;
      return `${label}: ${faDigits(c.capacity)}`;
    })
    .join(' · ');
}

export default function AircraftListPage() {
  const [rows, setRows] = useState<AircraftDefinitionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAircraftDefinitions()
      .then(setRows)
      .catch((e) =>
        setError(
          e instanceof ApiRequestError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'خطا در دریافت فهرست هواپیماها.',
        ),
      );
  }, []);

  const totalAircraft = rows?.length ?? 0;
  const activeAircraft = rows?.filter((row) => row.status === 'ACTIVE').length ?? 0;
  const totalCapacity = rows?.reduce((sum, row) => sum + row.totalCapacity, 0) ?? 0;

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]" data-testid="aircraft-list-page">
      <div className="mb-5 overflow-hidden rounded-[18px] border border-panel-border bg-panel-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-accent">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 16l20-8-2-3-7 2-4-5-2 1 3 6-5 2-2-2-1 1 2 3-2 2Z" /></svg>
            </span>
            <div>
          <h1 className="text-[20.5px] font-black text-panel-ink">تعریف هواپیما</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            ناوگان، ظرفیت کابین و نقشه صندلی‌ها را یک‌جا مدیریت کنید
          </p>
            </div>
          </div>
          <Link
            to="/panel/aircraft/new"
            className="rounded-[11px] bg-[#3275d2] px-4 py-3 text-[12px] font-extrabold text-white shadow-lg shadow-blue-950/30"
          >
            + تعریف هواپیمای جدید
          </Link>
        </div>
      </div>

      {rows ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['aircraft-kpi-total', 'مدل ثبت‌شده', totalAircraft, '#60a5fa'],
            ['aircraft-kpi-active', 'مدل فعال', activeAircraft, '#34d399'],
            ['aircraft-kpi-capacity', 'مجموع ظرفیت', totalCapacity, '#fbbf24'],
          ].map(([testId, label, value, color]) => (
            <div key={String(testId)} data-testid={String(testId)} className="rounded-[14px] border border-panel-border bg-panel-surface p-4 shadow-sm">
              <div className="text-[11px] text-[#7d8ba3]">{label}</div>
              <div className="font-num mt-2 text-2xl font-black" style={{ color: String(color) }}>{faDigits(Number(value))}</div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="aircraft-list-error"
          className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]"
        >
          {error}
        </p>
      ) : null}

      <div data-testid="aircraft-card-grid" className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows === null && !error ? (
          <p
            data-testid="aircraft-list-loading"
            className="col-span-full rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] py-12 text-center text-xs text-[#6b7b94]"
          >
            در حال بارگذاری…
          </p>
        ) : null}
        {rows && rows.length === 0 ? (
          <p
            data-testid="aircraft-list-empty"
            className="col-span-full rounded-[14px] border border-dashed border-[#2c3a53] bg-[#111a2a] py-12 text-center text-xs text-[#6b7b94]"
          >
            اطلاعاتی یافت نشد
          </p>
        ) : null}
        {rows?.map((row) => (
          <div
            key={row.id}
            data-testid="aircraft-card"
            className="group rounded-[16px] border border-panel-border bg-panel-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#233453] text-[#70a7f5]">✈</span>
                <div><div className="text-sm font-black text-panel-ink">{row.title || row.model}</div><div className="ltr font-num mt-1 text-[11px] text-panel-muted">{row.code} · {row.model}</div></div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${row.status === 'ACTIVE' ? 'bg-[#10b98122] text-[#34d399]' : 'bg-[#f8717122] text-[#f87171]'}`}>{row.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}</span>
            </div>
            <div className="mb-4 rounded-xl bg-panel-canvas p-3">
              <div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-panel-muted">ظرفیت کل</span><strong className="font-num text-base text-panel-ink">{faDigits(row.totalCapacity)} صندلی</strong></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#243047]"><div className="h-full rounded-full bg-gradient-to-l from-[#3b82f6] to-[#60a5fa]" style={{ width: `${Math.min(100, Math.max(12, row.totalCapacity / 2))}%` }} /></div>
              <div className="mt-3 text-[10.5px] leading-6 text-[#9fb0c7]">{cabinSummary(row)}</div>
            </div>
            <div className="flex gap-2 border-t border-[#1f2a3d] pt-4">
              <Link
                to={`/panel/aircraft/${row.id}`}
                className="flex-1 rounded-lg bg-blue-50 px-3 py-2.5 text-center text-[11px] font-bold text-accent"
              >
                مشاهده
              </Link>
              <Link
                to={`/panel/aircraft/${row.id}/edit`}
                className="flex-1 rounded-lg border border-panel-border px-3 py-2.5 text-center text-[11px] font-bold text-panel-ink"
              >
                ویرایش
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
