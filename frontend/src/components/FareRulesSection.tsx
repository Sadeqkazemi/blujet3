import { useEffect, useState } from 'react';
import {
  createFareRule,
  deleteFareRule,
  fetchFareRules,
  updateFareRule,
} from '../api/flights';
import { faDigits, faMoney, latinDigits, parseTomanToRial } from '../lib/fa-format';
import { CABIN_OPTIONS, cabinLabel, type CabinKind } from '../lib/flight-definition';
import { formatJalaliDate } from '../lib/jalali';
import type { CreateFareRulePayload, FareRuleRow } from '../types/flights';

const CHANNEL_LABELS: Record<string, string> = {
  SYSTEM: 'سیستمی',
  CHARTER: 'چارتری',
  AGENCY: 'آژانس',
};

const EMPTY_FORM = {
  cabin: 'ECONOMY' as CabinKind,
  classCode: '',
  priceToman: '',
  taxToman: '0',
  seatsAllocated: '',
  baggageKg: '',
  refundable: true,
  changeable: true,
  allowedChannels: [] as ('SYSTEM' | 'CHARTER' | 'AGENCY')[],
};

interface FareRulesSectionProps {
  instanceId: string;
  readOnly?: boolean;
}

export default function FareRulesSection({ instanceId, readOnly = false }: FareRulesSectionProps) {
  const [rules, setRules] = useState<FareRuleRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetchFareRules(instanceId)
      .then(setRules)
      .catch(() => setRules([]));
  }

  useEffect(reload, [instanceId]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(rule: FareRuleRow) {
    setEditingId(rule.id);
    setForm({
      cabin: rule.cabin,
      classCode: rule.classCode,
      priceToman: String(Math.round(rule.priceIrr / 10)),
      taxToman: String(Math.round(rule.taxIrr / 10)),
      seatsAllocated: String(rule.seatsAllocated),
      baggageKg: rule.baggageAllowanceKg != null ? String(rule.baggageAllowanceKg) : '',
      refundable: rule.refundable,
      changeable: rule.changeable,
      allowedChannels: [...rule.allowedChannels],
    });
    setError(null);
    setFormOpen(true);
  }

  function toggleChannel(ch: 'SYSTEM' | 'CHARTER' | 'AGENCY') {
    setForm((f) => ({
      ...f,
      allowedChannels: f.allowedChannels.includes(ch)
        ? f.allowedChannels.filter((c) => c !== ch)
        : [...f.allowedChannels, ch],
    }));
  }

  async function onSave() {
    setError(null);
    const priceIrr = parseTomanToRial(form.priceToman);
    const taxIrr = parseTomanToRial(form.taxToman) ?? 0;
    const seats = Number(latinDigits(form.seatsAllocated));
    if (!form.classCode.trim() || priceIrr == null || !Number.isInteger(seats) || seats < 1) {
      setError('کد کلاس، قیمت و تعداد صندلی معتبر را وارد کنید.');
      return;
    }

    const payload: CreateFareRulePayload = {
      cabin: form.cabin,
      classCode: latinDigits(form.classCode.trim()).toUpperCase(),
      priceIrr,
      seatsAllocated: seats,
      taxIrr,
      refundable: form.refundable,
      changeable: form.changeable,
      baggageAllowanceKg: form.baggageKg ? Number(latinDigits(form.baggageKg)) : undefined,
      allowedChannels: form.allowedChannels.length > 0 ? form.allowedChannels : undefined,
    };

    try {
      if (editingId) {
        await updateFareRule(instanceId, editingId, payload);
      } else {
        await createFareRule(instanceId, payload);
      }
      setFormOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت کلاس نرخی.');
    }
  }

  async function onDelete(ruleId: string) {
    setError(null);
    try {
      await deleteFareRule(instanceId, ruleId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در حذف کلاس نرخی.');
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold text-ink">کلاس‌های نرخی</h3>
        {!formOpen && !readOnly && (
          <button onClick={openCreate} className="text-[11px] font-bold text-accent">
            + افزودن
          </button>
        )}
      </div>

      {rules.length === 0 && !formOpen && (
        <p className="mb-2 text-[11px] text-muted">هنوز کلاس نرخی برای این پرواز ثبت نشده است.</p>
      )}

      <div className="mb-3 flex flex-col gap-1.5">
        {rules.map((r) => (
          <div
            key={r.id}
            className="rounded-lg bg-surface px-2.5 py-2 text-[11px]"
            data-testid="fare-rule-row"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">
                <span className="ltr font-num inline-block">{r.classCode}</span>
                {' · '}
                {cabinLabel(r.cabin)}
              </span>
              <span className="font-num text-muted">{faMoney(r.priceIrr)} تومان</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
              <span>{faDigits(r.seatsAllocated)} صندلی</span>
              {r.baggageAllowanceKg != null && <span>{faDigits(r.baggageAllowanceKg)} کیلو بار</span>}
              <span>{r.refundable ? 'استرداد‌پذیر' : 'غیرقابل استرداد'}</span>
              <span>{r.changeable ? 'قابل تغییر' : 'غیرقابل تغییر'}</span>
              {r.allowedChannels.length > 0 && (
                <span>{r.allowedChannels.map((c) => CHANNEL_LABELS[c]).join('، ')}</span>
              )}
              {(r.validFrom || r.validUntil) && (
                <span>
                  {r.validFrom ? formatJalaliDate(r.validFrom) : '—'} تا{' '}
                  {r.validUntil ? formatJalaliDate(r.validUntil) : '—'}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => openEdit(r)} className="text-accent">ویرایش</button>
                <button onClick={() => void onDelete(r.id)} className="text-danger">حذف</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {formOpen && !readOnly && (
        <div className="mb-3 rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-bold text-ink">
            {editingId ? 'ویرایش کلاس نرخی' : 'افزودن کلاس نرخی'}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select
              aria-label="کابین"
              value={form.cabin}
              disabled={!!editingId}
              onChange={(e) =>
                setForm((f) => ({ ...f, cabin: e.target.value as CabinKind }))
              }
              className="h-9 rounded-lg border border-border px-2 text-xs outline-none disabled:opacity-60"
            >
              {CABIN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              aria-label="کد کلاس"
              dir="ltr"
              disabled={!!editingId}
              value={form.classCode}
              onChange={(e) => setForm((f) => ({ ...f, classCode: e.target.value }))}
              placeholder="Y"
              className="font-num h-9 rounded-lg border border-border px-2 text-xs outline-none disabled:opacity-60"
            />
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <input
              aria-label="قیمت تومان"
              dir="ltr"
              value={form.priceToman}
              onChange={(e) => setForm((f) => ({ ...f, priceToman: e.target.value }))}
              placeholder="قیمت (تومان)"
              className="font-num h-9 rounded-lg border border-border px-2 text-xs outline-none"
            />
            <input
              aria-label="مالیات تومان"
              dir="ltr"
              value={form.taxToman}
              onChange={(e) => setForm((f) => ({ ...f, taxToman: e.target.value }))}
              placeholder="مالیات (تومان)"
              className="font-num h-9 rounded-lg border border-border px-2 text-xs outline-none"
            />
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <input
              aria-label="تعداد صندلی"
              dir="ltr"
              value={form.seatsAllocated}
              onChange={(e) => setForm((f) => ({ ...f, seatsAllocated: e.target.value }))}
              placeholder="تعداد صندلی"
              className="font-num h-9 rounded-lg border border-border px-2 text-xs outline-none"
            />
            <input
              aria-label="بار مجاز کیلو"
              dir="ltr"
              value={form.baggageKg}
              onChange={(e) => setForm((f) => ({ ...f, baggageKg: e.target.value }))}
              placeholder="بار (کیلو)"
              className="font-num h-9 rounded-lg border border-border px-2 text-xs outline-none"
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {(['SYSTEM', 'CHARTER', 'AGENCY'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                  form.allowedChannels.includes(ch)
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-2'
                }`}
              >
                {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-4 text-[11px]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.refundable}
                onChange={(e) => setForm((f) => ({ ...f, refundable: e.target.checked }))}
              />
              استرداد‌پذیر
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.changeable}
                onChange={(e) => setForm((f) => ({ ...f, changeable: e.target.checked }))}
              />
              قابل تغییر تاریخ
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void onSave()}
              className="rounded-lg bg-accent px-4 py-1.5 text-[11px] font-bold text-white"
            >
              {editingId ? 'ذخیره' : 'ثبت کلاس نرخی'}
            </button>
            <button
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="rounded-lg bg-surface px-4 py-1.5 text-[11px] font-bold text-text-2"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
