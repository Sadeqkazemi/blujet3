import { faDigits, latinDigits } from '../../lib/fa-format';
import {
  AIRCRAFT_CABIN_OPTIONS,
  type AircraftCabinType,
  type AircraftSeatMapBandDraft,
} from '../../types/aircraft';
import { countBandSeats } from './seat-map-utils';

const inputClass =
  'font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none';

export default function SeatMapEditor({
  bands,
  onChange,
  excludedSeatCodes,
  onExcludedChange,
  locked,
  lockedMessage,
}: {
  bands: AircraftSeatMapBandDraft[];
  onChange: (bands: AircraftSeatMapBandDraft[]) => void;
  excludedSeatCodes: string[];
  onExcludedChange: (codes: string[]) => void;
  locked?: boolean;
  lockedMessage?: string;
}) {
  function update(cabinType: AircraftCabinType, patch: Partial<AircraftSeatMapBandDraft>) {
    onChange(
      bands.map((b) => (b.cabinType === cabinType ? { ...b, ...patch } : b)),
    );
  }

  function parseCols(raw: string): string[] {
    return latinDigits(raw)
      .toUpperCase()
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (locked) {
    return (
      <div
        data-testid="seat-map-locked"
        className="rounded-[12px] border border-[#f59e0b55] bg-[#2a1f0c] px-3 py-3 text-[12px] text-[#f59e0b]"
      >
        {lockedMessage ??
          'نقشه صندلی MD-80 قفل است و از این فرم قابل ویرایش نیست.'}
      </div>
    );
  }

  return (
    <div data-testid="seat-map-editor" className="space-y-3">
      {bands.map((band) => {
        const label =
          AIRCRAFT_CABIN_OPTIONS.find((c) => c.value === band.cabinType)?.label ??
          band.cabinType;
        return (
          <div
            key={band.cabinType}
            data-testid={`seat-band-${band.cabinType}`}
            className="rounded-xl border border-[#28344c] bg-[#0f1623] p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[12.5px] font-bold text-white">
                <input
                  type="checkbox"
                  checked={band.enabled}
                  onChange={(e) => update(band.cabinType, { enabled: e.target.checked })}
                />
                {label}
              </label>
              <span className="font-num text-[11px] text-[#9fb0c7]">
                {faDigits(countBandSeats(band))} صندلی
              </span>
            </div>
            {band.enabled ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <div className="mb-1 text-[10.5px] text-[#6b7b94]">ردیف شروع</div>
                  <input
                    dir="ltr"
                    type="number"
                    className={inputClass}
                    value={band.rowStart}
                    onChange={(e) =>
                      update(band.cabinType, { rowStart: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10.5px] text-[#6b7b94]">ردیف پایان</div>
                  <input
                    dir="ltr"
                    type="number"
                    className={inputClass}
                    value={band.rowEnd}
                    onChange={(e) =>
                      update(band.cabinType, { rowEnd: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10.5px] text-[#6b7b94]">حروف چپ راهرو</div>
                  <input
                    dir="ltr"
                    className={inputClass}
                    value={band.colsLeft.join(',')}
                    onChange={(e) =>
                      update(band.cabinType, { colsLeft: parseCols(e.target.value) })
                    }
                    placeholder="A,B"
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10.5px] text-[#6b7b94]">حروف راست راهرو</div>
                  <input
                    dir="ltr"
                    className={inputClass}
                    value={band.colsRight.join(',')}
                    onChange={(e) =>
                      update(band.cabinType, { colsRight: parseCols(e.target.value) })
                    }
                    placeholder="C,D,E"
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      <div>
        <div className="mb-1 text-[10.5px] text-[#6b7b94]">صندلی‌های غیرفعال (مثلاً 13A,13B)</div>
        <input
          data-testid="excluded-seats"
          dir="ltr"
          className={inputClass}
          value={excludedSeatCodes.join(',')}
          onChange={(e) =>
            onExcludedChange(
              latinDigits(e.target.value)
                .toUpperCase()
                .split(/[,\s]+/)
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </div>
    </div>
  );
}

export { countBandSeats };
