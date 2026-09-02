import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createAircraftDefinition,
  fetchAircraftDefinition,
  updateAircraftDefinition,
} from '../../api/aircraft';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import {
  AIRCRAFT_CABIN_OPTIONS,
  STANDARD_AIRCRAFT_CLASS_CODE,
  type AircraftCabinType,
  type UpsertAircraftDefinitionPayload,
} from '../../types/aircraft';
import SeatMapEditor from './SeatMapEditor';
import {
  bandsToUpsertFields,
  countBandSeats,
  detailToBands,
  emptyBands,
  totalBandSeats,
} from './seat-map-utils';

const inputClass =
  'font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none';
const cardClass = 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]';

export default function AircraftFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id || id === 'new';

  const [code, setCode] = useState('');
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [totalCapacity, setTotalCapacity] = useState('');
  const [bands, setBands] = useState(emptyBands);
  const [cabinCapacities, setCabinCapacities] = useState<Record<AircraftCabinType, string>>({
    FIRST: '',
    BUSINESS: '',
    COMFORT: '',
    ECONOMY: '',
  });
  const [cabinClassCodes, setCabinClassCodes] = useState<
    Record<AircraftCabinType, string>
  >(STANDARD_AIRCRAFT_CLASS_CODE);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedSeats = useMemo(
    () => totalBandSeats(bands, excluded),
    [bands, excluded],
  );
  const physicalByCabin = useMemo(
    () =>
      Object.fromEntries(bands.map((band) => [band.cabinType, countBandSeats(band)])) as Record<
        AircraftCabinType,
        number
      >,
    [bands],
  );

  useEffect(() => {
    if (isCreate || !id) return;
    setLoading(true);
    fetchAircraftDefinition(id)
      .then((def) => {
        setCode(def.code);
        setModel(def.model);
        setTitle(def.title);
        setTotalCapacity(String(def.totalCapacity));
        setBands(detailToBands(def));
        setCabinCapacities({
          FIRST: String(def.cabins.find((c) => c.cabinType === 'FIRST')?.capacity ?? ''),
          BUSINESS: String(def.cabins.find((c) => c.cabinType === 'BUSINESS')?.capacity ?? ''),
          COMFORT: String(def.cabins.find((c) => c.cabinType === 'COMFORT')?.capacity ?? ''),
          ECONOMY: String(def.cabins.find((c) => c.cabinType === 'ECONOMY')?.capacity ?? ''),
        });
        setCabinClassCodes({
          FIRST:
            def.cabins.find((c) => c.cabinType === 'FIRST')?.defaultClassCode ??
            STANDARD_AIRCRAFT_CLASS_CODE.FIRST,
          BUSINESS:
            def.cabins.find((c) => c.cabinType === 'BUSINESS')?.defaultClassCode ??
            STANDARD_AIRCRAFT_CLASS_CODE.BUSINESS,
          COMFORT:
            def.cabins.find((c) => c.cabinType === 'COMFORT')?.defaultClassCode ??
            STANDARD_AIRCRAFT_CLASS_CODE.COMFORT,
          ECONOMY:
            def.cabins.find((c) => c.cabinType === 'ECONOMY')?.defaultClassCode ??
            STANDARD_AIRCRAFT_CLASS_CODE.ECONOMY,
        });
        setExcluded([...(def.seatMap?.excludedSeatCodes ?? [])]);
      })
      .catch((e) =>
        setError(
          e instanceof ApiRequestError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'خطا در بارگذاری هواپیما.',
        ),
      )
      .finally(() => setLoading(false));
  }, [id, isCreate]);

  async function onSubmit() {
    setError(null);
    const capacity = Number(totalCapacity) || 0;
    if (!code.trim() || !model.trim()) {
      setError('کد و مدل هواپیما الزامی است.');
      return;
    }
    if (capacity <= 0) {
      setError('ظرفیت کل را وارد کنید.');
      return;
    }
    const configuredCabins = AIRCRAFT_CABIN_OPTIONS.flatMap(({ value }) => {
      const cabinCapacity = Number(cabinCapacities[value]) || 0;
      return cabinCapacity > 0
        ? [
            {
              cabinType: value,
              capacity: cabinCapacity,
              defaultClassCode:
                cabinClassCodes[value].trim().toUpperCase() ||
                STANDARD_AIRCRAFT_CLASS_CODE[value],
            },
          ]
        : [];
    });
    const configuredTotal = configuredCabins.reduce((sum, cabin) => sum + cabin.capacity, 0);
    if (configuredCabins.length === 0) {
      setError('مجموع صندلی‌های کابین باید بیشتر از صفر باشد.');
      return;
    }
    if (configuredTotal !== capacity) {
      setError(
        `مجموع ظرفیت کابین‌ها (${faDigits(configuredTotal)}) باید برابر ظرفیت کل (${faDigits(capacity)}) باشد.`,
      );
      return;
    }
    const abovePhysical = configuredCabins.find(
      (cabin) => cabin.capacity > physicalByCabin[cabin.cabinType],
    );
    if (abovePhysical) {
      setError(
        `ظرفیت ${AIRCRAFT_CABIN_OPTIONS.find((c) => c.value === abovePhysical.cabinType)?.label} از تعداد صندلی فیزیکی آن بیشتر است.`,
      );
      return;
    }
    if (derivedSeats < capacity) {
      setError(
        `مجموع صندلی‌های فیزیکی (${faDigits(derivedSeats)}) نباید از ظرفیت کل (${faDigits(capacity)}) کمتر باشد.`,
      );
      return;
    }

    const payload: UpsertAircraftDefinitionPayload = {
      code: code.trim().toUpperCase(),
      model: model.trim(),
      title: title.trim() || model.trim(),
      totalCapacity: capacity,
      cabinCapacities: configuredCabins,
      ...bandsToUpsertFields(bands, excluded),
    };

    setSaving(true);
    try {
      if (isCreate) {
        const created = await createAircraftDefinition(payload);
        navigate(`/panel/aircraft/${created.id}`, { replace: true });
      } else if (id) {
        await updateAircraftDefinition(id, payload);
        navigate(`/panel/aircraft/${id}`, { replace: true });
      }
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'خطا در ذخیره هواپیما.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="px-[21px] pt-[18px] text-sm text-[#6b7b94]" data-testid="aircraft-form-loading">
        در حال بارگذاری…
      </p>
    );
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]" data-testid="aircraft-form-page">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">
            {isCreate ? 'افزودن هواپیما' : 'ویرایش هواپیما'}
          </h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            ظرفیت کابین‌ها باید با ظرفیت کل برابر باشد
          </p>
        </div>
        <Link to="/panel/aircraft" className="text-[12px] font-bold text-[#9fb0c7]">
          بازگشت
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="aircraft-form-error"
          className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]"
        >
          {error}
        </p>
      ) : null}

      <div className={`${cardClass} mb-4 space-y-3`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="ac-code">
              کد
            </label>
            <input
              id="ac-code"
              data-testid="aircraft-code"
              dir="ltr"
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="ac-model">
              مدل
            </label>
            <input
              id="ac-model"
              data-testid="aircraft-model"
              className={inputClass}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="ac-title">
              نام / عنوان
            </label>
            <input
              id="ac-title"
              data-testid="aircraft-name"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="max-w-xs">
          <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="ac-capacity">
            تعداد کل صندلی
          </label>
          <input
            id="ac-capacity"
            data-testid="aircraft-total-seats"
            dir="ltr"
            inputMode="numeric"
            className={inputClass}
            value={totalCapacity}
            onChange={(e) => setTotalCapacity(e.target.value.replace(/\D/g, ''))}
          />
          <p className="mt-1 text-[11px] text-[#6b7b94]">
            مجموع نقشه: <span className="font-num">{faDigits(derivedSeats)}</span>
          </p>
        </div>
      </div>

      <div className={`${cardClass} mb-4`} data-testid="aircraft-cabin-capacities">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-extrabold text-white">تعریف ظرفیت کابین‌ها</h2>
            <p className="mt-1 text-[11px] text-[#6b7b94]">
              ظرفیت عددی هر کابین را وارد کنید؛ مقدار صفر یعنی آن کابین در این هواپیما وجود ندارد.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = { ...cabinCapacities };
              for (const cabin of AIRCRAFT_CABIN_OPTIONS) {
                const count = physicalByCabin[cabin.value];
                next[cabin.value] = count > 0 ? String(count) : '';
              }
              setCabinCapacities(next);
              setTotalCapacity(String(Object.values(physicalByCabin).reduce((a, b) => a + b, 0)));
            }}
            className="rounded-lg border border-[#33415c] px-3 py-2 text-[11px] font-bold text-[#8fb8ff]"
          >
            کپی ظرفیت از نقشه صندلی
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AIRCRAFT_CABIN_OPTIONS.map((cabin) => (
            <label
              key={cabin.value}
              className="rounded-xl border border-[#28344c] bg-[#0f1623] p-3 text-[11px] text-[#9fb0c7]"
            >
              {cabin.label}
              <input
                data-testid={`aircraft-cabin-capacity-${cabin.value}`}
                dir="ltr"
                inputMode="numeric"
                value={cabinCapacities[cabin.value]}
                onChange={(event) =>
                  setCabinCapacities((current) => ({
                    ...current,
                    [cabin.value]: event.target.value.replace(/\D/g, '').slice(0, 4),
                  }))
                }
                placeholder="0"
                className={`${inputClass} mt-2 text-left`}
              />
              <span className="mt-1 block text-[10px] text-[#6b7b94]">
                ظرفیت فیزیکی نقشه: {faDigits(physicalByCabin[cabin.value])}
              </span>
              <span className="mt-3 block text-[10px] font-bold text-[#9fb0c7]">
                کلاس استاندارد کابین
              </span>
              <input
                data-testid={`aircraft-cabin-class-${cabin.value}`}
                dir="ltr"
                maxLength={3}
                aria-label={`کلاس استاندارد ${cabin.label}`}
                value={cabinClassCodes[cabin.value]}
                onChange={(event) =>
                  setCabinClassCodes((current) => ({
                    ...current,
                    [cabin.value]: event.target.value
                      .replace(/[^A-Za-z0-9]/g, '')
                      .toUpperCase()
                      .slice(0, 3),
                  }))
                }
                className={`${inputClass} mt-1 text-left uppercase`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className={`${cardClass} mb-4`}>
        <h2 className="mb-3 text-[14px] font-extrabold text-white">نقشه صندلی</h2>
        <SeatMapEditor
          bands={bands}
          onChange={setBands}
          excludedSeatCodes={excluded}
          onExcludedChange={setExcluded}
        />
      </div>

      <button
        type="button"
        data-testid="aircraft-form-submit"
        disabled={saving}
        onClick={() => void onSubmit()}
        className="rounded-[10px] bg-[#1668c4] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-60"
      >
        {saving ? 'در حال ذخیره…' : 'ذخیره'}
      </button>
    </div>
  );
}
