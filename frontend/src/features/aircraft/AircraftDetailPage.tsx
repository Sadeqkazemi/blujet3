import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAircraftDefinition } from '../../api/aircraft';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { isMd80Aircraft } from '../public-site/checkout/md80-seat-layout';
import {
  AIRCRAFT_CABIN_OPTIONS,
  type AircraftDefinition,
} from '../../types/aircraft';

export default function AircraftDetailPage() {
  const { id } = useParams();
  const [def, setDef] = useState<AircraftDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchAircraftDefinition(id)
      .then(setDef)
      .catch((e) =>
        setError(
          e instanceof ApiRequestError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'خطا در دریافت هواپیما.',
        ),
      );
  }, [id]);

  if (error) {
    return (
      <p className="px-[21px] pt-[18px] text-sm text-[#f87171]" data-testid="aircraft-detail-error">
        {error}
      </p>
    );
  }
  if (!def) {
    return (
      <p className="px-[21px] pt-[18px] text-sm text-[#6b7b94]" data-testid="aircraft-detail-loading">
        در حال بارگذاری…
      </p>
    );
  }

  const locked =
    isMd80Aircraft(def.code) || isMd80Aircraft(def.model) || isMd80Aircraft(def.title);

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]" data-testid="aircraft-detail-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">{def.title || def.model}</h1>
          <p className="mt-1 font-num text-[12px] text-[#6b7b94]" dir="ltr">
            {def.code} · {def.model} · v{faDigits(def.version)}
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/panel/aircraft" className="text-[12px] font-bold text-[#9fb0c7]">
            فهرست
          </Link>
          <Link
            to={`/panel/aircraft/${def.id}/edit`}
            className="text-[12px] font-bold text-[#60a5fa]"
          >
            ویرایش
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[12px] border border-[#1f2a3d] bg-[#141d2e] p-3">
          <div className="text-[10.5px] text-[#6b7b94]">وضعیت</div>
          <div className="mt-1 font-bold text-white">
            {def.status === 'ACTIVE' ? 'فعال' : 'غیرفعال'}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#1f2a3d] bg-[#141d2e] p-3">
          <div className="text-[10.5px] text-[#6b7b94]">ظرفیت کل</div>
          <div className="font-num mt-1 font-bold text-white">
            {faDigits(def.totalCapacity)}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
        <h2 className="mb-3 text-[14px] font-extrabold text-white">کابین‌ها</h2>
        <ul className="m-0 space-y-2 p-0">
          {def.cabins.map((c) => (
            <li
              key={c.cabinType}
              className="flex justify-between rounded-[10px] border border-[#28344c] px-3 py-2 text-[12px]"
            >
              <span>
                {AIRCRAFT_CABIN_OPTIONS.find((o) => o.value === c.cabinType)?.label ??
                  c.cabinType}
              </span>
              <span className="font-num text-[#cdd6e3]">{faDigits(c.capacity)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4">
        <h2 className="mb-2 text-[14px] font-extrabold text-white">نقشه صندلی</h2>
        {locked ? (
          <p data-testid="md80-locked-message" className="text-[12px] text-[#f59e0b]">
            نقشه MD-80 قفل است و از این پنل تغییر نمی‌کند.
          </p>
        ) : (
          <div data-testid="seat-map-editor">
            <p className="font-num text-[12px] text-[#9fb0c7]">
              {faDigits(def.seats?.length ?? def.seatMap?.seats?.length ?? 0)} صندلی تعریف‌شده
              {(def.seatMap?.excludedSeatCodes?.length ?? 0) > 0
                ? ` · غیرفعال: ${def.seatMap.excludedSeatCodes.join(', ')}`
                : ''}
            </p>
          </div>
        )}
        {locked ? (
          <p className="font-num mt-2 text-[12px] text-[#9fb0c7]">
            {faDigits(def.seats?.length ?? def.seatMap?.seats?.length ?? 0)} صندلی تعریف‌شده
          </p>
        ) : null}
      </div>
    </div>
  );
}
