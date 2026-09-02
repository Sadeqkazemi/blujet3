import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchEmployeeContext } from '../../api/panels';
import type { EmployeeContext } from '../../types/panels';
import ComingSoonPage from '../../components/ComingSoonPage';
import {
  addCustomService,
  deleteCustomService,
  fetchOtherServices,
  fetchSeatServices,
  setOtherServicePrice,
  setSeatServicePrice,
  toggleOtherService,
  toggleSeatService,
} from '../../api/ancillary-services';
import { faDigits, latinDigits, parseTomanToRial } from '../../lib/fa-format';
import type { AncillaryServiceRow, SeatServiceRow } from '../../types/ancillary-services';
import { expandPermissionSelection } from '../it-manager/employee-permission-dependencies';

const inputClass =
  'font-num h-[38px] w-[140px] rounded-[9px] border border-[#28344c] bg-[#0f1623] px-[11px] text-left text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]';

const COMMERCIAL_HIDDEN_SERVICE_KEYS = new Set(['refund-fee']);

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className="relative h-[26px] w-[46px] flex-none rounded-[14px] transition"
      style={{ background: enabled ? '#34d399' : '#28344c' }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
        style={{ [enabled ? 'right' : 'left']: 3 } as React.CSSProperties}
      />
    </button>
  );
}

function ServiceIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
      <path d="M17 11V9a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3 3v-6a2 2 0 0 1 2-2h11z" />
    </svg>
  );
}

function ServiceRow({
  titleFa,
  descriptionFa,
  priceIrr,
  enabled,
  onSave,
  onToggle,
  onDelete,
  editable = true,
}: {
  titleFa: string;
  descriptionFa: string;
  priceIrr: string;
  enabled: boolean;
  onSave: (tomanInput: string) => void;
  onToggle: () => void;
  onDelete?: () => void;
  editable?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.floor(Number(priceIrr) / 10)));

  useEffect(() => {
    setDraft(String(Math.floor(Number(priceIrr) / 10)));
  }, [priceIrr]);

  return (
    <div className="flex flex-wrap items-center gap-3.5 border-b border-[#1f2a3d] px-[15px] py-[14px] last:border-b-0">
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[#18223a] text-[#9fb0c7]">
        <ServiceIcon />
      </span>
      <div className="min-w-[150px] flex-1">
        <div className="text-[12.5px] font-bold text-[#e7ecf3]">{titleFa}</div>
        <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">{descriptionFa}</div>
      </div>
      <div className="flex-none overflow-hidden rounded-[9px] border border-[#28344c] bg-[#0f1623]">
        <input
          dir="ltr"
          inputMode="numeric"
          value={faDigits(draft)}
          onChange={(e) => setDraft(latinDigits(e.target.value).replace(/[^\d]/g, ''))}
          placeholder="قیمت (تومان)"
          className={inputClass}
        />
      </div>
      {editable ? (
        <button
          onClick={() => onSave(draft)}
          className="flex-none rounded-lg bg-[#8a5cf6] px-3.5 py-2 text-[11px] font-bold text-white transition hover:brightness-110"
        >
          ثبت قیمت
        </button>
      ) : (
        <span className="flex-none rounded-lg border border-[#28344c] px-3 py-2 text-[10.5px] font-bold text-[#6b7b94]">
          فقط مشاهده
        </span>
      )}
      {editable ? <Toggle enabled={enabled} onToggle={onToggle} /> : null}
      <span className="min-w-[52px] flex-none text-[10.5px] font-bold" style={{ color: enabled ? '#34d399' : '#6b7b94' }}>
        {enabled ? 'فعال' : 'غیرفعال'}
      </span>
      {editable && onDelete && (
        <button
          onClick={onDelete}
          aria-label="حذف خدمت"
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-[rgba(248,113,113,.1)] text-[#f87171] transition hover:bg-[rgba(248,113,113,.2)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Design: SERVICES (per-service pricing) — «خدمات».
 */
export default function AncillaryServicesPage() {
  const { user } = useAuth();
  const [employeeContext, setEmployeeContext] = useState<EmployeeContext | null>(null);
  const [employeePermissionKeys, setEmployeePermissionKeys] = useState<Set<string>>(new Set());
  const [seatServices, setSeatServices] = useState<SeatServiceRow[]>([]);
  const [otherServices, setOtherServices] = useState<AncillaryServiceRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'EMPLOYEE') {
      setEmployeeContext(null);
      setEmployeePermissionKeys(new Set());
      return;
    }

    let cancelled = false;
    fetchEmployeeContext()
      .then((context) => {
        if (!cancelled) {
          setEmployeeContext(context);
          setEmployeePermissionKeys(expandPermissionSelection(context.permissionKeys));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployeeContext(null);
          setEmployeePermissionKeys(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const isCommercialEmployee =
    user?.role === 'EMPLOYEE' &&
    (employeeContext?.dept === 'commercial' || employeeContext?.dept === 'sales');
  const canView =
    user?.role === 'COMMERCIAL_MANAGER' ||
    (isCommercialEmployee &&
      (employeePermissionKeys.has('sv_view') || employeePermissionKeys.has('sv_manage')));
  const canManage =
    user?.role === 'COMMERCIAL_MANAGER' ||
    (isCommercialEmployee && employeePermissionKeys.has('sv_manage'));

  useEffect(() => {
    if (!canView) return;
    void Promise.all([fetchSeatServices(), fetchOtherServices()])
      .then(([seats, others]) => {
        setSeatServices(seats);
        setOtherServices(others);
      })
      .catch(() => setNotice('دریافت خدمات جانبی انجام نشد.'));
  }, [canView]);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 2600);
  }

  async function onSaveSeatPrice(key: string, tomanInput: string) {
    const rial = parseTomanToRial(tomanInput);
    if (rial === null || rial < 0) return;
    setSeatServices(await setSeatServicePrice(key, String(rial)));
    flash('قیمت ثبت شد ✓');
  }

  async function onToggleSeat(key: string) {
    setSeatServices(await toggleSeatService(key));
  }

  async function onSaveOtherPrice(key: string, tomanInput: string) {
    const rial = parseTomanToRial(tomanInput);
    if (rial === null || rial < 0) return;
    setOtherServices(await setOtherServicePrice(key, String(rial)));
    flash('قیمت ثبت شد ✓');
  }

  async function onToggleOther(key: string) {
    setOtherServices(await toggleOtherService(key));
  }

  async function onDeleteOther(key: string) {
    setOtherServices(await deleteCustomService(key));
    flash('خدمت حذف شد.');
  }

  async function onSubmitAdd() {
    setAddError(null);
    if (!addTitle.trim()) {
      setAddError('عنوان خدمت الزامی است.');
      return;
    }
    const rial = parseTomanToRial(addPrice) ?? 0;
    setOtherServices(await addCustomService({ titleFa: addTitle.trim(), descriptionFa: addDesc.trim(), priceIrr: String(rial) }));
    setAddOpen(false);
    setAddTitle('');
    setAddDesc('');
    setAddPrice('');
    flash('خدمت جدید ثبت شد ✓');
  }

  // This route is TabGate-wrapped; keep a client-side permission check so a
  // direct render cannot expose the commercial service surface to unrelated
  // employees. The API guards remain authoritative for every mutation.
  if (!canView) return <ComingSoonPage />;

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      <div>
        <h1 className="m-0 text-[20.5px] font-black text-white">خدمات جانبی پروازی</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">قیمت‌گذاری صندلی و سایر خدمات جانبی قابل ارائه به مسافران</p>
      </div>

      {notice && <p className="rounded-xl bg-[rgba(52,211,153,.12)] p-3 text-xs font-bold text-[#34d399]">{notice}</p>}

      <div className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="border-b border-[#1f2a3d] px-[15px] py-[13px]">
          <h4 className="m-0 text-[13px] font-extrabold text-white">قیمت انواع صندلی</h4>
          <div className="mt-[3px] text-[11px] text-[#6b7b94]">
            برای هر نوع صندلی یک قیمت پایه تعیین کنید؛ فقط خدمات فعال در سایت به مسافران نمایش داده می‌شوند.
          </div>
        </div>
        {seatServices.map((sv) => (
          <ServiceRow
            key={sv.key}
            titleFa={sv.titleFa}
            descriptionFa={sv.descriptionFa}
            priceIrr={sv.priceIrr}
            enabled={sv.enabled}
            onSave={(v) => void onSaveSeatPrice(sv.key, v)}
            onToggle={() => void onToggleSeat(sv.key)}
            editable={canManage}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1f2a3d] px-[15px] py-[13px]">
          <div>
            <h4 className="m-0 text-[13px] font-extrabold text-white">سایر خدمات جانبی</h4>
            <div className="mt-[3px] text-[11px] text-[#6b7b94]">قیمت و وضعیت هر خدمت را جداگانه مدیریت کنید.</div>
          </div>
          {canManage && (
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="flex flex-none items-center gap-1.5 rounded-[9px] bg-accent px-[13px] py-2 text-[11.5px] font-bold text-white transition hover:brightness-110"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              افزودن خدمت جدید
            </button>
          )}
        </div>

        {addOpen && (
          <div className="flex flex-col gap-[9px] border-b border-[#1f2a3d] bg-[#0f1623] px-[15px] py-[14px]">
            <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2">
              <div>
                <label htmlFor="svc-add-title" className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                  عنوان خدمت *
                </label>
                <input
                  id="svc-add-title"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="مثلاً اینترنت پروازی"
                  className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-2.5 text-xs text-[#e7ecf3] outline-none"
                />
              </div>
              <div>
                <label htmlFor="svc-add-price" className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                  قیمت (تومان)
                </label>
                <input
                  id="svc-add-price"
                  dir="ltr"
                  inputMode="numeric"
                  value={faDigits(addPrice)}
                  onChange={(e) => setAddPrice(latinDigits(e.target.value).replace(/[^\d]/g, ''))}
                  placeholder="مثلاً ۱۵۰۰۰۰"
                  className="font-num h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-2.5 text-xs text-[#e7ecf3] outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="svc-add-desc" className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                توضیح (اختیاری)
              </label>
              <input
                id="svc-add-desc"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="توضیح کوتاه خدمت"
                className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-2.5 text-xs text-[#e7ecf3] outline-none"
              />
            </div>
            {addError && <p className="text-[11px] text-[#f87171]">{addError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void onSubmitAdd()}
                className="flex h-10 flex-1 items-center justify-center rounded-[9px] bg-accent text-[11.5px] font-extrabold text-white transition hover:brightness-110"
              >
                ثبت خدمت
              </button>
              <button
                onClick={() => setAddOpen(false)}
                className="flex h-10 items-center justify-center rounded-[9px] border border-[#28344c] px-3.5 text-[11.5px] font-bold text-[#9fb0c7]"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {otherServices.filter((sv) => !COMMERCIAL_HIDDEN_SERVICE_KEYS.has(sv.key)).map((sv) => (
          <ServiceRow
            key={sv.key}
            titleFa={sv.titleFa}
            descriptionFa={sv.descriptionFa}
            priceIrr={sv.priceIrr}
            enabled={sv.enabled}
            onSave={(v) => void onSaveOtherPrice(sv.key, v)}
            onToggle={() => void onToggleOther(sv.key)}
            onDelete={sv.isCustom ? () => void onDeleteOther(sv.key) : undefined}
            editable={canManage}
          />
        ))}
      </div>
    </div>
  );
}
