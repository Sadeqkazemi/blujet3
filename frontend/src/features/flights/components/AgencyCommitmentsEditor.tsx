import { useEffect, useMemo, useState } from 'react';
import { fetchAgencies } from '../../../api/agencies';
import MoneyInput from '../../../components/MoneyInput';
import JalaliDatePicker from '../../../components/JalaliDatePicker';
import { faDigits, latinDigits } from '../../../lib/fa-format';
import { moneyInputToRialString, formatTomanGrouped } from '../../../lib/money-input';
import { irrToTomanInput } from '../../../lib/fa-format';
import { CABIN_OPTIONS, type CabinKind } from '../../../lib/flight-definition';
import type {
  CommitmentCabin,
  CommitmentRow,
  CreateCommitmentPayload,
} from '../../../types/commitments';

const inputClass =
  'w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none';

export interface AgencyCommitmentDraft {
  tempId: string;
  agencyId: string;
  agencyName: string;
  seats: string;
  cabin: CabinKind;
  amountToman: string;
  startDate: string | null;
  endDate: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  /** Persisted commitment id when loaded from API. */
  commitmentId?: string;
}

export function commitmentToDraft(row: CommitmentRow): AgencyCommitmentDraft {
  return {
    tempId: row.id,
    commitmentId: row.id,
    agencyId: row.agencyId ?? '',
    agencyName: row.agencyName ?? '',
    seats: String(row.seats),
    cabin: (row.cabin === 'FIRST' ? 'ECONOMY' : row.cabin) as CabinKind,
    amountToman: row.contractPriceIrr
      ? formatTomanGrouped(irrToTomanInput(row.contractPriceIrr))
      : '',
    startDate: row.startDate,
    endDate: row.releaseAt,
    status: row.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
  };
}

export function draftToCreatePayload(d: AgencyCommitmentDraft): CreateCommitmentPayload {
  const seats = Number(latinDigits(d.seats)) || 0;
  const price = moneyInputToRialString(d.amountToman);
  const cabin = d.cabin as CommitmentCabin;
  return {
    agencyId: d.agencyId,
    cabin,
    seats,
    contractPriceIrr: price ?? undefined,
    startDate: d.startDate ?? undefined,
    releaseAt: d.endDate ?? undefined,
    endDate: d.endDate ?? undefined,
  };
}

function emptyDraft(): AgencyCommitmentDraft {
  return {
    tempId: `ac-${Date.now()}`,
    agencyId: '',
    agencyName: '',
    seats: '',
    cabin: 'ECONOMY',
    amountToman: '',
    startDate: null,
    endDate: null,
    status: 'ACTIVE',
  };
}

export default function AgencyCommitmentsEditor({
  capacity,
  charterSeats,
  value,
  onChange,
  availableOnline,
}: {
  capacity: number;
  charterSeats: number;
  value: AgencyCommitmentDraft[];
  onChange: (rows: AgencyCommitmentDraft[]) => void;
  /** Optional server summary override for online sellable seats. */
  availableOnline?: number;
}) {
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<AgencyCommitmentDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgencies({})
      .then((r) =>
        setAgencies(
          r.agencies.map((a) => ({
            id: a.id,
            name: a.fullName,
          })),
        ),
      )
      .catch(() => setAgencies([]));
  }, []);

  const committedSeats = useMemo(
    () =>
      value
        .filter((r) => r.status !== 'CANCELLED')
        .reduce((sum, r) => sum + (Number(latinDigits(r.seats)) || 0), 0) +
      charterSeats,
    [value, charterSeats],
  );

  const onlineSellable =
    availableOnline != null
      ? availableOnline
      : Math.max(0, capacity - committedSeats);
  const overCapacity = capacity > 0 && committedSeats > capacity;

  function addRow() {
    setError(null);
    if (!form.agencyId) {
      setError('آژانس را انتخاب کنید.');
      return;
    }
    const seats = Number(latinDigits(form.seats)) || 0;
    if (seats <= 0) {
      setError('تعداد صندلی تعهد را وارد کنید.');
      return;
    }
    const nextTotal = committedSeats + seats;
    if (capacity > 0 && nextTotal > capacity) {
      setError(
        `مجموع تعهدات (${faDigits(nextTotal)}) از ظرفیت پرواز (${faDigits(capacity)}) بیشتر است.`,
      );
      return;
    }
    const agencyName =
      agencies.find((a) => a.id === form.agencyId)?.name ?? form.agencyName;
    onChange([
      ...value,
      {
        ...form,
        tempId: `ac-${Date.now()}`,
        agencyName,
        seats: String(seats),
        status: 'ACTIVE',
      },
    ]);
    setForm(emptyDraft());
  }

  return (
    <div
      data-testid="agency-commitments"
      className="rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[14.5px] font-extrabold text-white">تعهدات آژانس</h3>
          <p className="mt-1 text-[11px] text-[#6b7b94]">
            کنار تعهد چارتری — چند آژانس می‌توانند سهمیه بگیرند.
          </p>
        </div>
        <div className="rounded-[10px] border border-[#28344c] bg-[#0f1623] px-3 py-2 text-[11px] text-[#9fb0c7]">
          <div>
            مجموع تعهدات:{' '}
            <span className="font-num font-bold text-[#e7ecf3]" data-testid="commitments-total">
              {faDigits(committedSeats)}
            </span>
          </div>
          <div>
            قابل‌فروش آنلاین:{' '}
            <span
              className={`font-num font-bold ${overCapacity ? 'text-[#f87171]' : 'text-[#34d399]'}`}
              data-testid="online-sellable"
            >
              {faDigits(onlineSellable)}
            </span>
          </div>
        </div>
      </div>

      {overCapacity ? (
        <p
          role="alert"
          className="mb-3 text-[11.5px] font-semibold text-[#f87171]"
          data-testid="commitments-over-capacity"
        >
          مجموع تعهدات از ظرفیت پرواز بیشتر است.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-[11.5px] font-semibold text-[#f87171]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10.5px] text-[#9fb0c7]" htmlFor="ac-agency">
                آژانس
              </label>
              <select
                id="ac-agency"
                data-testid="ac-agency"
                value={form.agencyId}
                onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
                className={inputClass}
              >
                <option value="">انتخاب آژانس</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-[#9fb0c7]" htmlFor="ac-seats">
                تعداد صندلی
              </label>
              <input
                id="ac-seats"
                data-testid="ac-seats"
                dir="ltr"
                inputMode="numeric"
                value={form.seats}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    seats: latinDigits(e.target.value).replace(/\D/g, '').slice(0, 4),
                  }))
                }
                className={`${inputClass} text-left font-num`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] text-[#9fb0c7]" htmlFor="ac-cabin">
                کلاس کابین
              </label>
              <select
                id="ac-cabin"
                data-testid="ac-cabin"
                value={form.cabin}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cabin: e.target.value as CabinKind }))
                }
                className={inputClass}
              >
                {CABIN_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <MoneyInput
              label="مبلغ (تومان)"
              valueToman={form.amountToman}
              onChangeToman={(v) => setForm((f) => ({ ...f, amountToman: v }))}
              testId="ac-amount"
            />
            <div>
              <span className="mb-1 block text-[10.5px] text-[#9fb0c7]">تاریخ شروع</span>
              <div className="h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726]">
                <JalaliDatePicker
                  label="تاریخ شروع"
                  value={form.startDate}
                  onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
                  theme="dark"
                  singleLine
                  testId="ac-start"
                  placeholder="انتخاب"
                />
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[10.5px] text-[#9fb0c7]">تاریخ پایان</span>
              <div className="h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726]">
                <JalaliDatePicker
                  label="تاریخ پایان"
                  value={form.endDate}
                  onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                  theme="dark"
                  singleLine
                  testId="ac-end"
                  placeholder="انتخاب"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="ac-add"
            onClick={addRow}
            className="rounded-[9px] bg-[#3b82f6] px-3 py-2 text-[11.5px] font-bold text-white"
          >
            افزودن تعهد آژانس
          </button>
        </div>

        <div
          data-testid="ac-list"
          className="rounded-xl border border-[#28344c] bg-[#0f1623] p-3"
        >
          <h4 className="m-0 mb-2 text-[12px] font-extrabold text-[#e7ecf3]">
            آژانس‌های متعهد
          </h4>
          {value.length === 0 ? (
            <p className="m-0 text-[11px] text-[#6b7b94]">هنوز تعهدی ثبت نشده است.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {value.map((row) => (
                <li
                  key={row.tempId}
                  data-testid="ac-row"
                  className="rounded-[10px] border border-[#28344c] px-2.5 py-2 text-[11px] text-[#cdd6e3]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white">{row.agencyName || row.agencyId}</div>
                      <div className="mt-0.5 text-[#9fb0c7]">
                        {faDigits(Number(latinDigits(row.seats)) || 0)} صندلی ·{' '}
                        {CABIN_OPTIONS.find((c) => c.value === row.cabin)?.label ?? row.cabin} ·{' '}
                        {row.status === 'ACTIVE' ? 'فعال' : 'لغو شده'}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="حذف تعهد"
                      onClick={() => onChange(value.filter((r) => r.tempId !== row.tempId))}
                      className="text-[11px] font-bold text-[#f87171]"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
