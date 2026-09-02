import { useEffect, useState } from 'react';
import { createTravelCost, deleteTravelCost, fetchTravelCosts, updateTravelCost } from '../../api/travel-costs';
import { faMoney, latinDigits, parseTomanToRial } from '../../lib/fa-format';
import type { TravelCost, TravelExtraBillingUnit, TravelExtraCode } from '../../types/travel-costs';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';

const CODE_OPTIONS: Array<{ value: TravelExtraCode; label: string }> = [
  { value: 'EXTRA_BAGGAGE', label: 'بار اضافه' },
  { value: 'SEAT_SELECTION', label: 'انتخاب صندلی' },
  { value: 'TRAVEL_INSURANCE', label: 'بیمه مسافرتی' },
  { value: 'SPECIAL_MEAL', label: 'وعده غذایی ویژه' },
  { value: 'DATE_CHANGE', label: 'تغییر تاریخ پرواز' },
  { value: 'REFUND_FEE', label: 'کارمزد استرداد' },
  { value: 'CIP', label: 'خدمات CIP' },
  { value: 'PET', label: 'حیوان خانگی' },
  { value: 'WHEELCHAIR', label: 'ویلچر' },
];

const UNIT_OPTIONS: Array<{ value: TravelExtraBillingUnit; label: string }> = [
  { value: 'PER_BOOKING', label: 'برای هر رزرو' },
  { value: 'PER_PASSENGER', label: 'برای هر مسافر' },
  { value: 'PER_KG', label: 'برای هر کیلوگرم' },
];

export default function TravelCostsTab() {
  const [rows, setRows] = useState<TravelCost[]>([]);
  const [code, setCode] = useState<TravelExtraCode>('EXTRA_BAGGAGE');
  const [titleFa, setTitleFa] = useState('');
  const [billingUnit, setBillingUnit] = useState<TravelExtraBillingUnit>('PER_BOOKING');
  const [priceToman, setPriceToman] = useState('');
  const [purchaseEnabled, setPurchaseEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TravelCost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchTravelCosts()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'خطا در دریافت هزینه‌های سفر.'))
      .finally(() => setLoading(false));
  }, []);

  async function add() {
    setError(null);
    setNotice(null);
    const priceIrr = parseTomanToRial(priceToman);
    if (!titleFa.trim() || priceIrr == null) {
      setError('عنوان و مبلغ معتبر را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      const created = await createTravelCost({
        code,
        titleFa: titleFa.trim(),
        billingUnit,
        priceIrr: String(priceIrr),
        active: true,
        purchaseEnabled,
        sortOrder: rows.length,
      });
      setRows((previous) => [...previous, created]);
      setTitleFa('');
      setPriceToman('');
      setNotice('هزینه سفر ثبت شد و در صورت فعال‌بودن، در سایت نمایش داده می‌شود.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت هزینه سفر.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: TravelCost, field: 'active' | 'purchaseEnabled') {
    setError(null);
    try {
      const updated = await updateTravelCost(row.id, { [field]: !row[field] });
      setRows((previous) => previous.map((item) => (item.id === row.id ? updated : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ویرایش هزینه سفر.');
    }
  }

  function requestRemove(row: TravelCost) {
    setDeleteTarget(row);
    setDeleteError(null);
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteTravelCost(deleteTarget.id);
      setRows((previous) => previous.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice('هزینه سفر حذف شد.');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'خطا در حذف هزینه سفر.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
        <h2 className="text-sm font-bold text-panel-ink">ثبت هزینه سفر</h2>
        <p className="mt-1 text-[11px] leading-6 text-panel-muted">
          فقط هزینه‌های ثبت‌شده و فعال در این بخش به مسافر نمایش داده می‌شوند؛ سندباکس هیچ مبلغ پیش‌فرضی ندارد.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={code}
            onChange={(e) => setCode(e.target.value as TravelExtraCode)}
            className="h-10 rounded-lg border border-panel-border bg-panel-surface px-3 text-xs text-panel-ink"
          >
            {CODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            aria-label="عنوان هزینه"
            value={titleFa}
            onChange={(e) => setTitleFa(e.target.value)}
            placeholder="عنوان هزینه"
            className="h-10 rounded-lg border border-panel-border bg-panel-surface px-3 text-xs text-panel-ink"
          />
          <select
            value={billingUnit}
            onChange={(e) => setBillingUnit(e.target.value as TravelExtraBillingUnit)}
            className="h-10 rounded-lg border border-panel-border bg-panel-surface px-3 text-xs text-panel-ink"
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            aria-label="مبلغ به تومان"
            inputMode="numeric"
            value={priceToman}
            onChange={(e) => setPriceToman(latinDigits(e.target.value).replace(/\D/g, ''))}
            placeholder="مبلغ (تومان)"
            className="font-num h-10 rounded-lg border border-panel-border bg-panel-surface px-3 text-xs text-panel-ink"
          />
          <button
            disabled={busy}
            onClick={() => void add()}
            className="h-10 rounded-lg bg-accent px-4 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'در حال ثبت…' : 'ثبت هزینه'}
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[11px] text-panel-muted">
          <input type="checkbox" checked={purchaseEnabled} onChange={(e) => setPurchaseEnabled(e.target.checked)} />
          قابل انتخاب هنگام خرید بلیت
        </label>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        {notice && <p className="mt-3 text-xs font-bold text-[#059669]">{notice}</p>}
      </section>

      <section className="overflow-hidden rounded-xl border border-panel-border bg-panel-surface">
        <div className="border-b border-panel-border px-5 py-3 text-sm font-bold text-panel-ink">هزینه‌های ثبت‌شده</div>
        {loading ? (
          <p className="p-6 text-center text-xs text-panel-muted">در حال بارگذاری…</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 gap-3 border-b border-panel-border px-5 py-4 text-xs md:grid-cols-[1.5fr_1fr_1fr_auto_auto_auto] md:items-center"
            >
              <div>
                <div className="font-bold text-panel-ink">{row.titleFa}</div>
                <div className="mt-1 font-num text-[10px] text-panel-muted">{row.code}</div>
              </div>
              <span className="text-panel-muted">{UNIT_OPTIONS.find((u) => u.value === row.billingUnit)?.label}</span>
              <span className="font-num font-bold text-panel-ink">{faMoney(row.priceIrr)} تومان</span>
              <button
                onClick={() => void toggle(row, 'active')}
                className={`rounded-full px-3 py-1.5 font-bold ${row.active ? 'bg-[#34d39924] text-[#059669]' : 'bg-panel-bg text-panel-muted'}`}
              >
                {row.active ? 'فعال' : 'غیرفعال'}
              </button>
              <button
                onClick={() => void toggle(row, 'purchaseEnabled')}
                className={`rounded-full px-3 py-1.5 font-bold ${row.purchaseEnabled ? 'bg-accent/10 text-accent' : 'bg-panel-bg text-panel-muted'}`}
              >
                {row.purchaseEnabled ? 'قابل خرید' : 'فقط اطلاع‌رسانی'}
              </button>
              <button onClick={() => requestRemove(row)} className="text-danger">
                حذف
              </button>
            </div>
          ))
        )}
        {!loading && rows.length === 0 && (
          <p className="p-8 text-center text-xs leading-6 text-panel-muted">
            هیچ هزینه سفری ثبت نشده است. سایت نیز هزینه ماک نمایش نمی‌دهد.
          </p>
        )}
      </section>
      <ConfirmActionDialog
        open={deleteTarget !== null}
        title="حذف هزینه سفر"
        message={deleteTarget ? `هزینه «${deleteTarget.titleFa}» حذف شود؟ این اقدام قابل بازگشت نیست.` : ''}
        confirmLabel="حذف هزینه"
        cancelLabel="انصراف"
        busy={deleteBusy}
        busyLabel="در حال حذف…"
        error={deleteError}
        testId="delete-travel-cost-dialog"
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
