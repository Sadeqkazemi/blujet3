import { useMemo, useState } from "react";
import JalaliDatePicker from "../../../components/JalaliDatePicker";
import MoneyInput from "../../../components/MoneyInput";
import {
  type DraftChargeRule,
  draftRulesForPreview,
  emptyDraftChargeRule,
} from "../../../lib/charge-rules-adapter";
import {
  CABIN_KIND_ORDER,
  CABIN_OPTIONS,
  cabinLabel,
  previewChargeTotalsByCabin,
  type CabinKind,
  type ChargeKind,
  type ChargeMethod,
} from "../../../lib/flight-definition";
import { moneyInputToRialString } from "../../../lib/money-input";
import { faDigits, faMoney, latinDigits } from "../../../lib/fa-format";
import { dayjs } from "../../../lib/jalali";

const inputClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none";
const selectClass = inputClass;

export default function ChargeRulesEditor({
  rules,
  onChange,
  basePriceIrr,
}: {
  rules: DraftChargeRule[];
  onChange: (rules: DraftChargeRule[]) => void;
  basePriceIrr: number | string;
}) {
  const [editing, setEditing] = useState<DraftChargeRule | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const previewsByCabin = useMemo(() => {
    const apiLike = draftRulesForPreview(rules);
    return previewChargeTotalsByCabin(basePriceIrr, apiLike);
  }, [rules, basePriceIrr]);

  function openCreate() {
    setEditing(emptyDraftChargeRule());
    setFormError(null);
  }

  function openEdit(rule: DraftChargeRule) {
    setEditing({ ...rule });
    setFormError(null);
  }

  function saveEditing() {
    if (!editing) return;
    if (!editing.title.trim()) {
      setFormError("عنوان قانون را وارد کنید");
      return;
    }
    if (editing.method === "FIXED") {
      const rial = moneyInputToRialString(editing.amountInput);
      if (rial == null || BigInt(rial) < 0n) {
        setFormError("مبلغ تومان معتبر وارد کنید");
        return;
      }
    } else {
      const pct = Number(
        latinDigits(editing.amountInput).replace(/[^\d.]/g, ""),
      );
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setFormError("درصد باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
    }
    if (
      editing.validFromIso &&
      editing.validUntilIso &&
      editing.validUntilIso.slice(0, 10) < editing.validFromIso.slice(0, 10)
    ) {
      setFormError("پایان اعتبار باید بعد از شروع باشد");
      return;
    }
    const exists = rules.some((r) => r.key === editing.key);
    onChange(
      exists
        ? rules.map((r) => (r.key === editing.key ? editing : r))
        : [...rules, editing],
    );
    setEditing(null);
  }

  return (
    <section
      className="mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]"
      data-testid="charge-rules-section"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#34d399]" />
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">
            قوانین مالیات و عوارض
          </h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-[9px] bg-[#3b82f6] px-3 py-2 text-[11.5px] font-bold text-white"
        >
          افزودن قانون
        </button>
      </div>
      <p className="mb-3 text-[11px] text-[#6b7b94]">
        محاسبه زیر فقط پیش‌نمایش است؛ مبلغ نهایی فروش از سرور دریافت می‌شود.
      </p>

      {editing && (
        <div
          className="mb-3 rounded-xl border border-[#2a3550] bg-[#0f1623] p-3"
          data-testid="charge-rule-form"
        >
          {formError && (
            <div className="mb-2 rounded-[9px] border border-[rgba(248,113,113,.3)] bg-[rgba(248,113,113,.1)] px-2.5 py-2 text-[11px] text-[#f87171]">
              {formError}
            </div>
          )}
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-[10.5px] text-[#9fb0c7]"
                htmlFor="ch-title"
              >
                عنوان
              </label>
              <input
                id="ch-title"
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[10.5px] text-[#9fb0c7]"
                htmlFor="ch-kind"
              >
                نوع
              </label>
              <select
                id="ch-kind"
                value={editing.kind}
                onChange={(e) =>
                  setEditing({ ...editing, kind: e.target.value as ChargeKind })
                }
                className={selectClass}
              >
                <option value="TAX">مالیات</option>
                <option value="FEE">عوارض</option>
              </select>
            </div>
            <div>
              <label
                className="mb-1 block text-[10.5px] text-[#9fb0c7]"
                htmlFor="ch-method"
              >
                روش
              </label>
              <select
                id="ch-method"
                value={editing.method}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    method: e.target.value as ChargeMethod,
                    amountInput: "",
                  })
                }
                className={selectClass}
              >
                <option value="FIXED">مبلغ ثابت</option>
                <option value="PERCENT">درصد</option>
              </select>
            </div>
            <div>
              {editing.method === "FIXED" ? (
                <MoneyInput
                  id="ch-amount"
                  label="مبلغ (تومان)"
                  valueToman={editing.amountInput}
                  onChangeToman={(v) =>
                    setEditing({ ...editing, amountInput: v })
                  }
                  testId="charge-amount-money"
                />
              ) : (
                <>
                  <label
                    className="mb-1 block text-[10.5px] text-[#9fb0c7]"
                    htmlFor="ch-pct"
                  >
                    درصد
                  </label>
                  <input
                    id="ch-pct"
                    dir="ltr"
                    value={editing.amountInput}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        amountInput: latinDigits(e.target.value).replace(
                          /[^\d.]/g,
                          "",
                        ),
                      })
                    }
                    className={`${inputClass} text-left font-num`}
                  />
                </>
              )}
            </div>
            <div>
              <label
                className="mb-1 block text-[10.5px] text-[#9fb0c7]"
                htmlFor="ch-cabin"
              >
                کابین
              </label>
              <select
                id="ch-cabin"
                value={editing.cabin}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    cabin: e.target.value as CabinKind | "ALL",
                  })
                }
                className={selectClass}
              >
                <option value="ALL">همه</option>
                {CABIN_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#e7ecf3]">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                />
                فعال
              </label>
            </div>
            <div className="h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726]">
              <JalaliDatePicker
                label="شروع اعتبار"
                value={editing.validFromIso}
                onChange={(iso) =>
                  setEditing({ ...editing, validFromIso: iso })
                }
                theme="dark"
                singleLine
                testId="charge-valid-from"
                placeholder="شروع اعتبار"
              />
            </div>
            <div className="h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726]">
              <JalaliDatePicker
                label="پایان اعتبار"
                value={editing.validUntilIso}
                onChange={(iso) =>
                  setEditing({ ...editing, validUntilIso: iso })
                }
                theme="dark"
                singleLine
                minDate={editing.validFromIso ?? undefined}
                testId="charge-valid-until"
                placeholder="پایان اعتبار"
              />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveEditing}
              className="h-10 flex-1 rounded-[9px] bg-[#3b82f6] text-[11.5px] font-extrabold text-white"
            >
              ذخیره قانون
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="h-10 rounded-[9px] border border-[#28344c] px-4 text-[11.5px] text-[#9fb0c7]"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2">
        {rules.map((r) => (
          <div
            key={r.key}
            className="rounded-xl border border-[#28344c] bg-[#18223a] p-3"
            data-testid="charge-rule-row"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12.5px] font-bold text-[#e7ecf3]">
                {r.title}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded-lg bg-[rgba(59,130,246,.1)] px-2.5 py-1.5 text-[10.5px] font-bold text-[#60a5fa]"
                >
                  ویرایش
                </button>
                <button
                  type="button"
                  onClick={() => onChange(rules.filter((x) => x.key !== r.key))}
                  className="rounded-lg bg-[rgba(248,113,113,.1)] px-2.5 py-1.5 text-[10.5px] font-bold text-[#f87171]"
                >
                  حذف
                </button>
              </div>
            </div>
            <div className="text-[11px] text-[#9fb0c7]">
              {r.kind === "TAX" ? "مالیات" : "عوارض"} ·{" "}
              {r.method === "FIXED" ? "مبلغ ثابت" : "درصد"} ·{" "}
              {r.cabin === "ALL"
                ? "همه کابین‌ها"
                : CABIN_OPTIONS.find((c) => c.value === r.cabin)?.label}{" "}
              · {r.active ? "فعال" : "غیرفعال"}
              {r.validFromIso
                ? ` · از ${faDigits(dayjs(r.validFromIso).calendar("jalali").format("YYYY/MM/DD"))}`
                : ""}
              {r.validUntilIso
                ? ` تا ${faDigits(dayjs(r.validUntilIso).calendar("jalali").format("YYYY/MM/DD"))}`
                : ""}
            </div>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="py-3 text-center text-[11px] text-[#6b7b94]">
            قانونی تعریف نشده است.
          </div>
        )}
      </div>

      <div
        className="rounded-xl border border-[#2a3550] bg-[#0f1623] p-3"
        data-testid="charge-breakdown-preview"
      >
        <div className="mb-3 text-[12px] font-extrabold text-white">
          خلاصه محاسبه (پیش‌نمایش)
        </div>
        <div className="flex flex-col gap-3">
          {CABIN_KIND_ORDER.map((cabin) => {
            const preview = previewsByCabin[cabin];
            return (
              <div
                key={cabin}
                className="rounded-lg border border-[#28344c] bg-[#141d2e] p-3"
                data-testid={`charge-preview-${cabin}`}
              >
                <div className="mb-2 text-[11.5px] font-extrabold text-[#60a5fa]">
                  {cabinLabel(cabin)}
                </div>
                <div className="flex justify-between text-[11.5px] text-[#9fb0c7]">
                  <span>قیمت پایه</span>
                  <span className="font-num text-[#e7ecf3]">
                    {faMoney(basePriceIrr)} تومان
                  </span>
                </div>
                {preview.lines.map((line, i) => (
                  <div
                    key={`${cabin}-${line.title}-${i}`}
                    className="mt-1 flex justify-between text-[11.5px] text-[#9fb0c7]"
                  >
                    <span>{line.title}</span>
                    <span className="font-num text-[#e7ecf3]">
                      {faMoney(line.amountIrr)} تومان
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-[#28344c] pt-2 text-[12px] font-extrabold text-white">
                  <span>مجموع نهایی</span>
                  <span className="font-num">
                    {faMoney(preview.totalIrr)} تومان
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
