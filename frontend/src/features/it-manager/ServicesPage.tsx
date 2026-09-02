import { useCallback, useEffect, useState } from 'react';
import {
  createExternalService,
  fetchItServices,
  fetchServiceReport,
  fetchSmsLog,
  removeExternalService,
  testExternalService,
  toggleInternalService,
  updateExternalService,
} from '../../api/it-manager';
import { faDigits, faPercent } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useOptionalAuth } from '../../hooks/useAuth';
import type { ExternalService, InternalService, ServiceReportResult, SmsLogResult } from '../../types/it-manager';

const SMS_MESSAGE_TYPE_LABEL: Record<string, string> = {
  OTP: 'کد یکبار مصرف',
  TEMP_PASSWORD: 'رمز موقت',
};

export default function ServicesPage() {
  const user = useOptionalAuth()?.user;
  const readOnly = user?.role === 'EMPLOYEE';
  const [internal, setInternal] = useState<InternalService[]>([]);
  const [external, setExternal] = useState<ExternalService[]>([]);
  const [smsLog, setSmsLog] = useState<SmsLogResult | null>(null);
  const [selectedReport, setSelectedReport] = useState<{ kind: 'internal' | 'external'; id: string; nameFa: string } | null>(null);
  const [serviceReport, setServiceReport] = useState<ServiceReportResult | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({ nameFa: '', provider: '', endpoint: '', apiKey: '' });

  const [editTarget, setEditTarget] = useState<ExternalService | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nameFa: '',
    endpoint: '',
    method: 'POST' as 'GET' | 'POST',
    timeoutMs: '',
    apiKey: '',
  });

  const [confirmTarget, setConfirmTarget] = useState<
    { kind: 'internal'; service: InternalService } | { kind: 'external'; service: ExternalService } | null
  >(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchItServices();
      setInternal(data.internal);
      setExternal(data.external);
    } catch {
      setError('خطا در دریافت سرویس‌ها.');
    }
  }, []);

  const smsPager = usePagination(smsLog?.recent ?? [], 5);

  async function openReport(kind: 'internal' | 'external', id: string, nameFa: string, page = 1) {
    setSelectedReport({ kind, id, nameFa });
    setReportLoading(true);
    setReportError(null);
    try {
      if (kind === 'internal' && id === 'sms') {
        smsPager.setPage(1);
        setSmsLog(await fetchSmsLog());
        setServiceReport(null);
      } else {
        setSmsLog(null);
        setServiceReport(await fetchServiceReport(kind, id, page, 5));
      }
    } catch {
      setSmsLog(null);
      setServiceReport(null);
      setReportError('گزارش این سرویس دریافت نشد. دوباره تلاش کنید.');
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleInternal(s: InternalService) {
    setConfirmTarget({ kind: 'internal', service: s });
  }

  async function confirmToggleInternal() {
    if (!confirmTarget || confirmTarget.kind !== 'internal') return;
    const s = confirmTarget.service;
    try {
      await toggleInternalService(s.key, !s.enabled);
      setConfirmTarget(null);
      await load();
    } catch {
      setError('خطا در تغییر وضعیت سرویس.');
    }
  }

  async function onToggleExternal(s: ExternalService) {
    setConfirmTarget({ kind: 'external', service: s });
  }

  async function confirmToggleExternal() {
    if (!confirmTarget || confirmTarget.kind !== 'external') return;
    const s = confirmTarget.service;
    try {
      await updateExternalService(s.id, { enabled: !s.enabled });
      setConfirmTarget(null);
      await load();
    } catch {
      setError('خطا در تغییر وضعیت سرویس.');
    }
  }

  async function onTest(s: ExternalService) {
    try {
      const result = await testExternalService(s.id);
      setTestResult({ id: s.id, ok: result.ok, message: result.message });
      await load();
    } catch {
      setError('خطا در تست اتصال.');
    }
  }

  function onOpenSettings(s: ExternalService) {
    setEditTarget(s);
    setEditError(null);
    setEditForm({
      nameFa: s.nameFa,
      endpoint: s.endpoint,
      method: s.method,
      timeoutMs: String(s.timeoutMs),
      apiKey: '',
    });
  }

  async function onSaveSettings() {
    if (!editTarget) return;
    if (!editForm.nameFa.trim() || !editForm.endpoint.trim()) {
      setEditError('نام سرویس و آدرس Endpoint الزامی است.');
      return;
    }
    const timeoutMs = Number(editForm.timeoutMs);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
      setEditError('مهلت اتصال باید بین ۱۰۰۰ تا ۱۲۰۰۰۰ میلی‌ثانیه باشد.');
      return;
    }
    try {
      await updateExternalService(editTarget.id, {
        nameFa: editForm.nameFa.trim(),
        endpoint: editForm.endpoint.trim(),
        method: editForm.method,
        timeoutMs,
        ...(editForm.apiKey.trim() ? { apiKey: editForm.apiKey.trim() } : {}),
      });
      setEditTarget(null);
      await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'خطا در ثبت تنظیمات سرویس.');
    }
  }

  async function onRemove(s: ExternalService) {
    try {
      await removeExternalService(s.id);
      await load();
    } catch {
      setError('خطا در حذف سرویس.');
    }
  }

  async function onCreate() {
    if (!form.nameFa.trim() || !form.endpoint.trim()) {
      setAddError('نام سرویس و آدرس Endpoint الزامی است.');
      return;
    }
    try {
      await createExternalService({
        nameFa: form.nameFa.trim(),
        provider: form.provider.trim() || form.nameFa.trim(),
        endpoint: form.endpoint.trim(),
        apiKey: form.apiKey.trim() || undefined,
      });
      setAddOpen(false);
      setForm({ nameFa: '', provider: '', endpoint: '', apiKey: '' });
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'خطا در ثبت سرویس خارجی.');
    }
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">سرویس‌های سایت</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">وضعیت و کنترل تمام سرویس‌های فعال در سایت</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] px-3 py-2">
            <span className="font-num font-black text-[#34d399]">
              {faDigits(internal.filter((s) => s.enabled).length + external.filter((s) => s.enabled).length)}
            </span>{' '}
            <span className="text-[#6b7b94]">سرویس فعال</span>
          </span>
          <span className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] px-3 py-2">
            <span className="font-num font-black text-[#e7ecf3]">
              {faDigits(internal.length + external.length)}
            </span>{' '}
            <span className="text-[#6b7b94]">کل سرویس‌ها</span>
          </span>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>}

      <h2 className="mb-3 text-[14.5px] font-extrabold text-white">سرویس‌های داخلی سایت</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {internal.map((s) => (
          <div key={s.id} className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#e7ecf3]">{s.nameFa}</div>
                <div className="mt-0.5 text-[10px] text-[#6b7b94]">آپ‌تایم {faPercent(s.uptimePct)}</div>
              </div>
              <button
                role="switch"
                aria-checked={s.enabled}
                aria-label={s.nameFa}
                onClick={() => void onToggleInternal(s)}
                disabled={readOnly}
                className={`relative h-6 w-11 rounded-full transition ${s.enabled ? 'bg-[#3b82f6]' : 'bg-[#28344c]'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    s.enabled ? 'right-0.5' : 'right-[22px]'
                  }`}
                />
              </button>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                s.enabled ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
              }`}
            >
              {s.enabled ? 'فعال' : 'غیرفعال'}
            </span>
            {!readOnly && <button
              type="button"
              onClick={() => void openReport('internal', s.key, s.nameFa)}
              className="mr-2 text-[10.5px] font-bold text-[#60a5fa]"
            >
              مشاهده گزارش
            </button>}
          </div>
        ))}
      </div>

      {selectedReport?.kind === 'internal' && selectedReport.id === 'sms' && smsLog && (
        <div className="mb-8 rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14.5px] font-extrabold text-white">سامانه پیامک (SMS)</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                smsLog.enabled ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
              }`}
            >
              {smsLog.enabled ? 'فعال' : 'غیرفعال'}
            </span>
          </div>
          <div className="mb-4 flex gap-6 text-xs">
            <div>
              <span className="font-num font-black text-[#34d399]">{faDigits(smsLog.todaySuccessCount)}</span>{' '}
              <span className="text-[#6b7b94]">ارسال موفق امروز</span>
            </div>
            <div>
              <span className="font-num font-black text-[#f87171]">{faDigits(smsLog.todayFailedCount)}</span>{' '}
              <span className="text-[#6b7b94]">ارسال ناموفق امروز</span>
            </div>
          </div>
          <div className="flex flex-col divide-y divide-[#1f2a3d]">
            {smsLog.recent.length === 0 && (
              <p className="py-2 text-xs text-[#6b7b94]">پیامکی ثبت نشده است.</p>
            )}
            {smsPager.pageItems.map((r) => (
              <div key={r.id} data-testid="sms-log-row" className="flex items-center gap-3 py-2 text-xs">
                <div className="ltr font-num min-w-[110px] text-[#6b7b94]">{r.phoneMasked}</div>
                <div className="min-w-[110px] text-[#e7ecf3]">{SMS_MESSAGE_TYPE_LABEL[r.messageType] ?? r.messageType}</div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    r.status === 'SUCCESS' ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                  }`}
                >
                  {r.status === 'SUCCESS' ? 'موفق' : 'ناموفق'}
                </span>
                {r.failureReason && <span className="text-[10.5px] text-[#f87171]">{r.failureReason}</span>}
                <span className="mr-auto text-[10.5px] text-[#6b7b94]">{formatJalaliDateTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
          <Pagination page={smsPager.page} totalPages={smsPager.totalPages} onChange={smsPager.setPage} />
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14.5px] font-extrabold text-white">سرویس‌های خارجی (API)</h2>
        {!readOnly && <button
          onClick={() => {
            setAddError(null);
            setAddOpen(true);
          }}
          className="rounded-lg bg-[#3b82f6] px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110"
        >
          افزودن سرویس خارجی
        </button>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {external.map((s) => (
          <div key={s.id} className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#e7ecf3]">{s.nameFa}</div>
                <div className="mt-0.5 text-[10px] text-[#6b7b94]">{s.provider}</div>
              </div>
              <button
                role="switch"
                aria-checked={s.enabled}
                aria-label={s.nameFa}
                onClick={() => onToggleExternal(s)}
                disabled={readOnly}
                className={`relative h-6 w-11 rounded-full transition ${s.enabled ? 'bg-[#3b82f6]' : 'bg-[#28344c]'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    s.enabled ? 'right-0.5' : 'right-[22px]'
                  }`}
                />
              </button>
            </div>
            <div className="ltr mb-2 truncate rounded-md bg-[#18223a] px-2 py-1 text-[10px] text-[#6b7b94]">{s.endpoint}</div>
            {testResult?.id === s.id && (
              <div className={`mb-2 rounded-md p-1.5 text-[10px] ${testResult.ok ? 'bg-[rgba(16,185,129,.12)] text-[#34d399]' : 'bg-[rgba(248,113,113,.12)] text-[#f87171]'}`}>
                {testResult.message}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  s.enabled ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                }`}
              >
                {s.enabled ? 'فعال' : 'غیرفعال'}
              </span>
              {!readOnly && <div className="flex gap-2">
                <button onClick={() => void openReport('external', s.id, s.nameFa)} className="text-[10.5px] font-bold text-[#60a5fa]">
                  مشاهده گزارش
                </button>
                <button onClick={() => onOpenSettings(s)} className="text-[10.5px] font-bold text-[#3b82f6]">
                  تنظیمات
                </button>
                <button onClick={() => void onTest(s)} className="text-[10.5px] font-bold text-[#3b82f6]">
                  تست اتصال
                </button>
                <button onClick={() => void onRemove(s)} className="text-[10.5px] font-bold text-[#f87171]">
                  حذف
                </button>
              </div>}
            </div>
          </div>
        ))}
      </div>

      {selectedReport && !(selectedReport.kind === 'internal' && selectedReport.id === 'sms' && smsLog) && (
        <section className="mt-6 rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-4" data-testid="service-report">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[14.5px] font-extrabold text-white">گزارش {selectedReport.nameFa}</h2>
              <p className="mt-1 text-[11px] text-[#6b7b94]">رویدادهای واقعی ثبت‌شده برای این سرویس</p>
            </div>
            <button type="button" onClick={() => setSelectedReport(null)} className="text-xs text-[#9fb0c7]">بستن</button>
          </div>
          {reportLoading && <p className="py-5 text-center text-xs text-[#9fb0c7]">در حال دریافت گزارش…</p>}
          {reportError && <p role="alert" className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-xs text-[#f87171]">{reportError}</p>}
          {!reportLoading && !reportError && serviceReport && (
            <>
              <div className="divide-y divide-[#1f2a3d] overflow-hidden rounded-lg border border-[#1f2a3d]">
                {serviceReport.items.length === 0 && <p className="p-4 text-xs text-[#6b7b94]">هنوز رویدادی برای این سرویس ثبت نشده است.</p>}
                {serviceReport.items.map((row) => (
                  <div key={row.id} data-testid="service-report-row" className="grid gap-2 p-3 text-xs md:grid-cols-[1fr_2fr_1fr_1fr]">
                    <span className="font-bold text-[#e7ecf3]">{row.action}</span>
                    <span className="text-[#9fb0c7]">{row.detail}</span>
                    <span className="text-[#9fb0c7]">{row.actorName}</span>
                    <span className="ltr font-num text-[#6b7b94]">{formatJalaliDateTime(row.createdAt)}</span>
                  </div>
                ))}
              </div>
              <Pagination
                page={serviceReport.page}
                totalPages={Math.max(1, Math.ceil(serviceReport.total / serviceReport.limit))}
                onChange={(page) => void openReport(selectedReport.kind, selectedReport.id, selectedReport.nameFa, page)}
              />
            </>
          )}
        </section>
      )}

      {addOpen && (
        <Modal variant="dark" title="تعریف سرویس خارجی جدید" onClose={() => setAddOpen(false)}>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="svc-name">
            نام سرویس
          </label>
          <input
            id="svc-name"
            value={form.nameFa}
            onChange={(e) => setForm({ ...form, nameFa: e.target.value })}
            className="w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          <label className="mb-1 mt-3 block text-xs font-bold text-[#e7ecf3]" htmlFor="svc-endpoint">
            آدرس Endpoint
          </label>
          <input
            id="svc-endpoint"
            dir="ltr"
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            placeholder="https://api.provider.com/v1/"
            className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          <label className="mb-1 mt-3 block text-xs font-bold text-[#e7ecf3]" htmlFor="svc-key">
            کلید احراز (API Key)
          </label>
          <input
            id="svc-key"
            dir="ltr"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          {addError && (
            <p role="alert" className="mt-2 text-xs text-[#f87171]">
              {addError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAddOpen(false)} className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]">
              انصراف
            </button>
            <button
              onClick={() => void onCreate()}
              className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              ثبت و اتصال سرویس
            </button>
          </div>
        </Modal>
      )}

      {editTarget && (
        <Modal variant="dark" title="تنظیمات سرویس" onClose={() => setEditTarget(null)}>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="edit-svc-name">
            نام سرویس
          </label>
          <input
            id="edit-svc-name"
            value={editForm.nameFa}
            onChange={(e) => setEditForm({ ...editForm, nameFa: e.target.value })}
            className="w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          <label className="mb-1 mt-3 block text-xs font-bold text-[#e7ecf3]" htmlFor="edit-svc-endpoint">
            آدرس Endpoint
          </label>
          <input
            id="edit-svc-endpoint"
            dir="ltr"
            value={editForm.endpoint}
            onChange={(e) => setEditForm({ ...editForm, endpoint: e.target.value })}
            className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="edit-svc-method">
                متد
              </label>
              <select
                id="edit-svc-method"
                dir="ltr"
                value={editForm.method}
                onChange={(e) => setEditForm({ ...editForm, method: e.target.value as 'GET' | 'POST' })}
                className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="edit-svc-timeout">
                مهلت اتصال (میلی‌ثانیه)
              </label>
              <input
                id="edit-svc-timeout"
                dir="ltr"
                inputMode="numeric"
                value={editForm.timeoutMs}
                onChange={(e) => setEditForm({ ...editForm, timeoutMs: e.target.value })}
                className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
              />
            </div>
          </div>
          <label className="mb-1 mt-3 block text-xs font-bold text-[#e7ecf3]" htmlFor="edit-svc-key">
            کلید احراز (API Key)
          </label>
          <input
            id="edit-svc-key"
            dir="ltr"
            value={editForm.apiKey}
            onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
            placeholder={editTarget.hasApiKey ? 'برای تغییر وارد کنید — خالی یعنی بدون تغییر' : '—'}
            className="ltr w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6] placeholder:text-[10px]"
          />
          {editError && (
            <p role="alert" className="mt-2 text-xs text-[#f87171]">
              {editError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditTarget(null)} className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]">
              انصراف
            </button>
            <button
              onClick={() => void onSaveSettings()}
              className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              ثبت تغییرات
            </button>
          </div>
        </Modal>
      )}

      {confirmTarget && (
        <Modal
          variant="dark"
          title={confirmTarget.service.enabled ? 'غیرفعال‌سازی سرویس' : 'فعال‌سازی سرویس'}
          onClose={() => setConfirmTarget(null)}
        >
          <p className="mb-4 text-xs text-[#6b7b94]">
            آیا سرویس «{confirmTarget.service.nameFa}» روی سایت{' '}
            {confirmTarget.service.enabled ? 'غیرفعال' : 'فعال'} شود؟
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmTarget(null)}
              className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]"
            >
              انصراف
            </button>
            <button
              onClick={() =>
                void (confirmTarget.kind === 'internal'
                  ? confirmToggleInternal()
                  : confirmToggleExternal())
              }
              className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${
                confirmTarget.service.enabled ? 'bg-danger' : 'bg-[#3b82f6]'
              }`}
            >
              {confirmTarget.service.enabled ? 'غیرفعال کن' : 'فعال کن'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
