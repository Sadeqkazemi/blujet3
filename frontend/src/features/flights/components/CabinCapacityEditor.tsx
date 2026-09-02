import {
  CABIN_OPTIONS,
  cabinLabel,
  type CabinKind,
  sumCabinSeats,
} from "../../../lib/flight-definition";
import { faDigits, latinDigits } from "../../../lib/fa-format";
import type { AircraftCabinCapacity } from "../../../types/aircraft";
import { normalizeTomanInput } from "../../../lib/money-input";
import { tomanInputWords } from "../../../lib/persian-number-words";

const selectClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none";
const inputClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none";

export interface CabinCapacityRow {
  key: string;
  cabin: CabinKind;
  seats: string;
  basePriceToman?: string;
}

export default function CabinCapacityEditor({
  rows,
  onChange,
  error,
  readOnly = false,
  availableCabins,
  showBasePrice = false,
}: {
  rows: CabinCapacityRow[];
  onChange: (rows: CabinCapacityRow[]) => void;
  error?: string | null;
  readOnly?: boolean;
  /** Authoritative per-cabin maxima from the selected aircraft. */
  availableCabins?: AircraftCabinCapacity[];
  showBasePrice?: boolean;
}) {
  const used = new Set(rows.map((r) => r.cabin));
  const total = sumCabinSeats(
    rows.map((r) => ({ seats: Number(latinDigits(r.seats)) || 0 })),
  );

  function update(key: string, patch: Partial<CabinCapacityRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const next = CABIN_OPTIONS.find((c) => !used.has(c.value));
    if (!next) return;
    onChange([
      ...rows,
      { key: `cab-${Date.now()}`, cabin: next.value, seats: "" },
    ]);
  }

  function toggleAvailable(cabin: CabinKind, enabled: boolean, maximum: number) {
    if (!enabled) {
      onChange(rows.filter((row) => row.cabin !== cabin));
      return;
    }
    onChange([
      ...rows,
      {
        key: `cab-${cabin}`,
        cabin,
        seats: String(maximum),
        basePriceToman: "",
      },
    ]);
  }

  return (
    <div data-testid="cabin-capacity-editor">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-[13px] font-extrabold text-white">
            ظرفیت کابین‌ها
          </h3>
          <p className="mt-1 text-[11px] text-[#6b7b94]">
            جمع صندلی‌ها:{" "}
            <span className="font-num font-bold text-[#e7ecf3]">
              {faDigits(total)}
            </span>
          </p>
        </div>
        {!availableCabins && (
          <button
            type="button"
            onClick={addRow}
            disabled={readOnly || used.size >= CABIN_OPTIONS.length}
            className="rounded-[9px] bg-[#3b82f6] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
          >
            افزودن کابین
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-2 text-[11px] font-semibold text-[#f87171]"
        >
          {error}
        </p>
      )}
      {availableCabins ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {availableCabins.map((available) => {
            const cabin = available.cabinType as CabinKind;
            const row = rows.find((item) => item.cabin === cabin);
            return (
              <div
                key={cabin}
                className={`rounded-xl border p-3 ${
                  row
                    ? "border-[#3b82f6] bg-[rgba(59,130,246,.08)]"
                    : "border-[#28344c] bg-[#0f1623]"
                }`}
                data-testid={`available-cabin-${cabin}`}
              >
                <label className="flex items-center justify-between gap-2 text-[12px] font-bold text-white">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`فعال‌سازی ${cabinLabel(cabin)}`}
                      checked={Boolean(row)}
                      disabled={readOnly}
                      onChange={(event) =>
                        toggleAvailable(cabin, event.target.checked, available.capacity)
                      }
                    />
                    {cabinLabel(cabin)}
                  </span>
                  <span className="font-num text-[10.5px] text-[#8fb8ff]">
                    حداکثر {faDigits(available.capacity)}
                  </span>
                </label>
                {row ? (
                  <div className={`mt-3 grid gap-2 ${showBasePrice ? "sm:grid-cols-2" : ""}`}>
                    <label className="block text-[10.5px] text-[#9fb0c7]">
                      تعداد صندلی فعال در این پرواز
                      <input
                        dir="ltr"
                        inputMode="numeric"
                        min={1}
                        max={available.capacity}
                        aria-label={`تعداد صندلی ${cabinLabel(cabin)}`}
                        value={row.seats}
                        readOnly={readOnly}
                        onChange={(event) =>
                          update(row.key, {
                            seats: latinDigits(event.target.value).replace(/\D/g, "").slice(0, 4),
                          })
                        }
                        className={`${inputClass} mt-1 text-left font-num read-only:cursor-not-allowed read-only:opacity-60`}
                      />
                    </label>
                    {showBasePrice ? (
                      <label className="block text-[10.5px] text-[#9fb0c7]">
                        قیمت پایه کابین (تومان)
                        <input
                          dir="rtl"
                          inputMode="numeric"
                          aria-label={`قیمت پایه ${cabinLabel(cabin)}`}
                          value={row.basePriceToman ?? ""}
                          readOnly={readOnly}
                          onChange={(event) =>
                            update(row.key, {
                              basePriceToman: normalizeTomanInput(event.target.value),
                            })
                          }
                          className={`${inputClass} mt-1 font-num read-only:cursor-not-allowed read-only:opacity-60`}
                        />
                        <span className="mt-1 block min-h-4 text-[9.5px] text-[#8fb8ff]">
                          {tomanInputWords(row.basePriceToman ?? "")}
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="sm:col-span-2 m-0 text-[10.5px] text-[#8ea0b8]">
            حداکثر ظرفیت هواپیما:{" "}
            {faDigits(availableCabins.reduce((sum, row) => sum + row.capacity, 0))} صندلی
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const available = CABIN_OPTIONS.filter(
              (c) => c.value === row.cabin || !used.has(c.value),
            );
            return (
              <div
                key={row.key}
                className="grid grid-cols-1 items-end gap-2 rounded-xl border border-[#28344c] bg-[#0f1623] p-2.5 sm:grid-cols-[1fr_1fr_auto]"
              data-testid="cabin-row"
            >
              <div>
                <label className="mb-1 block text-[10.5px] text-[#9fb0c7]">
                  نوع کابین
                </label>
                <select
                  value={row.cabin}
                  disabled={readOnly}
                  onChange={(e) =>
                    update(row.key, { cabin: e.target.value as CabinKind })
                  }
                  className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label={`نوع کابین ${cabinLabel(row.cabin)}`}
                >
                    {available.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] text-[#9fb0c7]">
                  تعداد صندلی
                </label>
                <input
                  dir="ltr"
                  inputMode="numeric"
                    value={row.seats}
                  readOnly={readOnly}
                  onChange={(e) =>
                    update(row.key, {
                      seats: latinDigits(e.target.value)
                        .replace(/\D/g, "")
                        .slice(0, 4),
                    })
                  }
                  className={`${inputClass} text-left font-num read-only:cursor-not-allowed read-only:opacity-60`}
                    aria-label={`تعداد صندلی ${cabinLabel(row.cabin)}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  disabled={readOnly || rows.length <= 1}
                  className="h-11 rounded-[9px] bg-[rgba(248,113,113,.12)] px-3 text-[11px] font-bold text-[#f87171] disabled:opacity-40"
                >
                  حذف
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
