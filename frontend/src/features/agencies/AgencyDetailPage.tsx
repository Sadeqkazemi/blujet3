import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  decideAgencyCreditRequest,
  decideAgencyDocument,
  decideAgencyWebserviceRequest,
  fetchAgencyApiKeys,
  fetchAgencyCreditRequests,
  fetchAgencyDetail,
  fetchAgencyDocuments,
  fetchAgencyInvoices,
  fetchAgencyMessages,
  fetchAgencyWebserviceRequests,
  issueAgencyApiKey,
  issueAgencyInvoice,
  payAgencyInvoice,
  postAgencyMessage,
  reactivateAgency,
  remindAgencyInvoice,
  settleAgency,
  suspendAgency,
  updateAgencyApiKey,
  updateAgencyCredit,
} from '../../api/agencies';
import { faDigits, faMoney, parseTomanToRial } from '../../lib/fa-format';
import { formatJalaliDate, formatJalaliDateTime, parseJalaliDateToIso } from '../../lib/jalali';
import { useStepUp } from '../../hooks/useStepUp';
import Modal from '../../components/Modal';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import { fetchAggregateSeatRequests } from '../../api/agencies';
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, INVOICE_STATUS, REQUEST_STATUS, TIER_LABELS, seatRequestTermLabel, statusBadge } from './agency-labels';
import type {
  AgencyApiKey,
  AgencyApiScope,
  AgencyDetail,
  AgencyDocument,
  AgencyInvoice,
  AgencyMessage,
  AgencySeatRequestRow,
} from '../../types/agencies';
import type { AgencyCreditRequest, AgencyWebserviceRequest } from '../../types/agency-portal';

type CommercialTab = 'overview' | 'finance' | 'messages' | 'history';

const SEAT_REQUEST_HISTORY_STATUS_LABEL: Record<AgencySeatRequestRow['status'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'در انتظار بررسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  PENDING_FINANCE: { label: 'در انتظار مالی', color: '#a78bfa', bg: 'rgba(167,139,250,.14)' },
  APPROVED: { label: 'تأیید شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  REJECTED: { label: 'رد شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
};

const API_SCOPE_OPTIONS: { value: AgencyApiScope; label: string }[] = [
  { value: 'FULL', label: 'کامل (جستجو + رزرو + صدور)' },
  { value: 'SEARCH_BOOK', label: 'جستجو + رزرو' },
  { value: 'SEARCH_ONLY', label: 'فقط جستجو (آزمایشی)' },
];

const WS_SCOPE_LABEL: Record<AgencyApiScope, string> = {
  SEARCH_BOOK: 'جستجو و رزرو',
  FULL: 'فروش کامل (صدور بلیط)',
  SEARCH_ONLY: 'فقط جستجو (آزمایشی)',
};

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-panel-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
      <div className="text-[11px] text-panel-muted">{label}</div>
      <div className="font-num mt-1 text-lg font-black text-panel-ink">{value}</div>
    </div>
  );
}

export default function AgencyDetailPage() {
  const { agencyId = '' } = useParams();
  const { user } = useAuth();
  const role = user?.role;
  const isSenior = role === 'SENIOR_MANAGER';
  const isFinance = role === 'FINANCE_MANAGER';
  const isCommercial = role === 'COMMERCIAL_MANAGER';
  // Phase 27: an EMPLOYEE granted ag_settle/fn_invoices reaches this page
  // via the real server-side permission check on each action below — the
  // settle button and the invoice list/pay/remind actions widen to
  // include them; «صدور فاکتور» (issue) stays COMMERCIAL_MANAGER-only,
  // matching the backend (fn_invoices never grants issuing).
  const isEmployee = role === 'EMPLOYEE';

  const [detail, setDetail] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<CommercialTab>('overview');

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendError, setSuspendError] = useState<string | null>(null);

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditInput, setCreditInput] = useState('');
  const [creditError, setCreditError] = useState<string | null>(null);

  const [apiKeys, setApiKeys] = useState<AgencyApiKey[]>([]);
  const [apiScope, setApiScope] = useState<AgencyApiScope>('FULL');
  const [freshRawKey, setFreshRawKey] = useState<string | null>(null);
  const stepUp = useStepUp('API_KEY_ROTATE');

  const [invoices, setInvoices] = useState<AgencyInvoice[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDue, setInvoiceDue] = useState('');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [messages, setMessages] = useState<AgencyMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');

  const [documents, setDocuments] = useState<AgencyDocument[]>([]);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [creditRequests, setCreditRequests] = useState<AgencyCreditRequest[]>([]);
  const [webserviceRequests, setWebserviceRequests] = useState<AgencyWebserviceRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  // History tab (design: HISTORY TAB). Payment history reuses the real
  // extras.transactions ledger data. Seat-request history uses
  // GET /agencies/seat-requests filtered by this agency.
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [seatRequestHistory, setSeatRequestHistory] = useState<AgencySeatRequestRow[]>([]);

  useEffect(() => {
    if (role !== 'COMMERCIAL_MANAGER' && role !== 'FINANCE_MANAGER') return;
    let cancelled = false;
    fetchAggregateSeatRequests()
      .then((rows) => {
        if (!cancelled) setSeatRequestHistory(rows.filter((r) => r.agencyId === agencyId));
      })
      .catch(() => {
        if (!cancelled) setSeatRequestHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, agencyId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await fetchAgencyDetail(agencyId);
      setDetail(d);
      if (role === 'SENIOR_MANAGER') setApiKeys(await fetchAgencyApiKeys(agencyId));
      if (role === 'COMMERCIAL_MANAGER') {
        const [inv, msgs] = await Promise.all([fetchAgencyInvoices(agencyId), fetchAgencyMessages(agencyId)]);
        setInvoices(inv);
        setMessages(msgs);
      }
      if (role === 'FINANCE_MANAGER') {
        setInvoices(await fetchAgencyInvoices(agencyId));
      }
      if (role === 'SENIOR_MANAGER' || role === 'FINANCE_MANAGER' || role === 'COMMERCIAL_MANAGER') {
        const [docs, creditReqs, wsReqs] = await Promise.all([
          fetchAgencyDocuments(agencyId),
          fetchAgencyCreditRequests(agencyId),
          fetchAgencyWebserviceRequests(agencyId),
        ]);
        setDocuments(docs);
        setCreditRequests(creditReqs);
        setWebserviceRequests(wsReqs);
      }
      // EMPLOYEE holding fn_invoices reaches the same invoices table as
      // COMMERCIAL_MANAGER (via the non-tabbed overview branch below) but
      // never messages. Some EMPLOYEE visitors here hold ag_settle only
      // (no fn_invoices) — that fetch 403s server-side; swallow it in its
      // own try so it never blocks the rest of the (permitted) page.
      if (role === 'EMPLOYEE') {
        try {
          setInvoices(await fetchAgencyInvoices(agencyId));
        } catch {
          setInvoices([]);
        }
      }
    } catch {
      setError('خطا در دریافت اطلاعات آژانس.');
    } finally {
      setLoading(false);
    }
  }, [agencyId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleSuspend() {
    if (!detail) return;
    if (detail.isActive) {
      setSuspendReason('');
      setSuspendError(null);
      setSuspendOpen(true);
      return;
    }
    try {
      await reactivateAgency(agencyId);
      setNotice('حساب آژانس مجدداً فعال شد ✓');
      await load();
    } catch {
      setError('خطا در فعال‌سازی مجدد.');
    }
  }

  async function onConfirmSuspend() {
    if (!suspendReason.trim()) {
      setSuspendError('برای تعلیق حساب، درج دلیل الزامی است.');
      return;
    }
    try {
      await suspendAgency(agencyId, suspendReason.trim());
      setSuspendOpen(false);
      setNotice('حساب آژانس تعلیق شد.');
      await load();
    } catch {
      setSuspendError('خطا در ثبت تعلیق.');
    }
  }

  async function onConfirmCredit() {
    const rial = parseTomanToRial(creditInput);
    if (rial === null) {
      setCreditError('مبلغ واردشده معتبر نیست.');
      return;
    }
    try {
      await updateAgencyCredit(agencyId, rial);
      setCreditOpen(false);
      setNotice('سقف اعتبار جدید ثبت شد ✓');
      await load();
    } catch {
      setCreditError('خطا در ثبت اعتبار.');
    }
  }

  async function onSettle() {
    try {
      const { settledIrr } = await settleAgency(agencyId);
      setNotice(`تسویه به مبلغ ${faMoney(settledIrr)} تومان ثبت شد ✓`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت تسویه.');
    }
  }

  async function onIssueApiKey() {
    try {
      const fields = await stepUp.confirm();
      const created = await issueAgencyApiKey(agencyId, apiScope, fields);
      setFreshRawKey(created.rawKey ?? null);
      setApiKeys(await fetchAgencyApiKeys(agencyId));
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError('خطا در تولید کلید API.');
    }
  }

  async function onApiKeyAction(key: AgencyApiKey, action: 'toggle' | 'regenerate') {
    try {
      if (action === 'regenerate') {
        const fields = await stepUp.confirm();
        const updated = await updateAgencyApiKey(agencyId, key.id, { regenerate: true, ...fields });
        setFreshRawKey(updated.rawKey ?? null);
      } else {
        await updateAgencyApiKey(agencyId, key.id, {
          status: key.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
        });
      }
      setApiKeys(await fetchAgencyApiKeys(agencyId));
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError('خطا در به‌روزرسانی کلید API.');
    }
  }

  async function onIssueInvoice() {
    const rial = parseTomanToRial(invoiceAmount);
    if (rial === null) {
      setInvoiceError('مبلغ واردشده معتبر نیست.');
      return;
    }
    const dueIso = parseJalaliDateToIso(invoiceDue);
    if (!dueIso) {
      setInvoiceError('تاریخ سررسید را به شکل ۱۴۰۵/۰۴/۳۰ وارد کنید.');
      return;
    }
    try {
      await issueAgencyInvoice(agencyId, rial, dueIso);
      setInvoiceOpen(false);
      setInvoiceAmount('');
      setInvoiceDue('');
      setNotice('فاکتور صادر شد ✓');
      setInvoices(await fetchAgencyInvoices(agencyId));
      await load();
    } catch {
      setInvoiceError('خطا در صدور فاکتور.');
    }
  }

  async function onPayInvoice(invoice: AgencyInvoice) {
    try {
      await payAgencyInvoice(agencyId, invoice.id);
      setNotice(`فاکتور ${invoice.invoiceNo} تسویه شد ✓`);
      setInvoices(await fetchAgencyInvoices(agencyId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت پرداخت.');
    }
  }

  async function onRemindInvoice(invoice: AgencyInvoice) {
    try {
      await remindAgencyInvoice(agencyId, invoice.id);
      setNotice(`یادآوری فاکتور ${invoice.invoiceNo} ارسال شد ✓`);
    } catch {
      setError('خطا در ارسال یادآوری.');
    }
  }

  async function onDecideDocument(doc: AgencyDocument, approve: boolean) {
    setDocumentError(null);
    try {
      await decideAgencyDocument(agencyId, doc.id, approve);
      setNotice(approve ? 'مدرک تأیید شد ✓' : 'مدرک رد شد.');
      setDocuments(await fetchAgencyDocuments(agencyId));
    } catch {
      setDocumentError('خطا در ثبت تصمیم روی مدرک.');
    }
  }

  async function onDecideCreditRequest(req: AgencyCreditRequest, approve: boolean) {
    setRequestError(null);
    try {
      await decideAgencyCreditRequest(agencyId, req.id, approve);
      setNotice(approve ? 'درخواست افزایش اعتبار تأیید شد ✓' : 'درخواست افزایش اعتبار رد شد.');
      setCreditRequests(await fetchAgencyCreditRequests(agencyId));
      await load();
    } catch {
      setRequestError('خطا در ثبت تصمیم روی درخواست اعتبار.');
    }
  }

  async function onDecideWebserviceRequest(req: AgencyWebserviceRequest, approve: boolean) {
    setRequestError(null);
    try {
      let dto: { approve: boolean; stepUpChallengeId?: string; stepUpCode?: string } = { approve };
      if (approve) {
        const fields = await stepUp.confirm();
        dto = { approve: true, ...fields };
      }
      const result = await decideAgencyWebserviceRequest(agencyId, req.id, dto);
      if (result.apiKey?.rawKey) setFreshRawKey(result.apiKey.rawKey);
      setNotice(approve ? 'درخواست وب‌سرویس تأیید و کلید صادر شد ✓' : 'درخواست وب‌سرویس رد شد.');
      setWebserviceRequests(await fetchAgencyWebserviceRequests(agencyId));
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setRequestError('خطا در ثبت تصمیم روی درخواست وب‌سرویس.');
    }
  }

  async function onSendMessage() {
    const body = messageDraft.trim();
    if (!body) return;
    try {
      await postAgencyMessage(agencyId, body);
      setMessageDraft('');
      setMessages(await fetchAgencyMessages(agencyId));
    } catch {
      setError('خطا در ارسال پیام.');
    }
  }

  if (loading) return <p className="p-10 text-center text-sm text-panel-muted">در حال بارگذاری…</p>;
  if (!detail)
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-danger">{error ?? 'آژانس یافت نشد.'}</p>
        <Link to="/panel/agencies" className="mt-3 inline-block text-xs font-bold text-accent">
          بازگشت به فهرست آژانس‌ها
        </Link>
      </div>
    );

  const badge = statusBadge(detail.isActive);
  const activeKey = apiKeys.find((k) => k.status === 'ACTIVE') ?? apiKeys[0];

  const creditCard = (
    <SectionCard
      title="اعتبار آژانس"
      action={
        <div className="flex gap-2">
          {(isSenior || isFinance || isEmployee) && Number(detail.credit.usedIrr) > 0 && (
            <button
              onClick={() => void onSettle()}
              className="rounded-lg bg-[#34d399] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#2bb583]"
            >
              ثبت تسویه
            </button>
          )}
          <button
            onClick={() => {
              setCreditInput('');
              setCreditError(null);
              setCreditOpen(true);
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            تعیین اعتبار
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-panel-canvas p-3">
          <div className="text-[10px] text-panel-muted">سقف اعتبار</div>
          <div className="font-num mt-1 text-sm font-black text-panel-ink">{faMoney(detail.credit.limitIrr)} تومان</div>
        </div>
        <div className="rounded-lg bg-panel-canvas p-3">
          <div className="text-[10px] text-panel-muted">مصرف‌شده</div>
          <div className="font-num mt-1 text-sm font-black text-danger">
            {faMoney(Math.max(Number(detail.credit.usedIrr), 0))} تومان
          </div>
        </div>
        <div className="rounded-lg bg-panel-canvas p-3">
          <div className="text-[10px] text-panel-muted">مانده اعتبار</div>
          <div className="font-num mt-1 text-sm font-black text-[#34d399]">
            {faMoney(Math.max(Number(detail.credit.remainingIrr), 0))} تومان
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const statsRow = (
    <div className="grid grid-cols-3 gap-4">
      <StatBox label="فروش کل" value={`${faMoney(detail.stats.totalSalesIrr)} تومان`} />
      <StatBox label="بلیط صادرشده" value={faDigits(detail.stats.ticketsIssued)} />
      <StatBox label="مسافران" value={faDigits(detail.stats.passengers)} />
    </div>
  );

  const documentsCard = (isSenior || isFinance || isCommercial) && (
    <SectionCard title="مدارک آپلودشده">
      {documentError && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{documentError}</p>}
      {documents.length === 0 ? (
        <p className="text-xs text-panel-muted">این آژانس هنوز مدرکی آپلود نکرده است.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const status = DOCUMENT_STATUS[doc.status];
            return (
              <div key={doc.id} className="flex items-center justify-between rounded-lg bg-panel-canvas p-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-panel-ink">{DOCUMENT_TYPE_LABELS[doc.docType]}</div>
                  <div className="ltr truncate text-[11px] text-panel-muted">{doc.file.fileName}</div>
                  <div className="mt-0.5 text-[10px] text-panel-muted">{formatJalaliDateTime(doc.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                  {doc.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => void onDecideDocument(doc, true)}
                        className="rounded-lg bg-[#34d399] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[#2bb583]"
                      >
                        تأیید
                      </button>
                      <button
                        onClick={() => void onDecideDocument(doc, false)}
                        className="rounded-lg bg-danger px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-danger/90"
                      >
                        رد
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const staffReviewRoles = isSenior || isFinance || isCommercial;

  const creditRequestsCard = staffReviewRoles && (
    <SectionCard title="درخواست‌های افزایش اعتبار">
      {requestError && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{requestError}</p>}
      {creditRequests.length === 0 ? (
        <p className="text-xs text-panel-muted">درخواستی ثبت نشده است.</p>
      ) : (
        <div className="space-y-2">
          {creditRequests.map((req) => {
            const status = REQUEST_STATUS[req.status];
            return (
              <div key={req.id} className="flex items-center justify-between rounded-lg bg-panel-canvas p-3">
                <div className="min-w-0">
                  <div className="font-num text-xs font-bold text-panel-ink">
                    سقف درخواستی: {faMoney(req.requestedLimitIrr)} تومان
                  </div>
                  {req.note && <div className="mt-0.5 text-[11px] text-panel-muted">{req.note}</div>}
                  <div className="mt-0.5 text-[10px] text-panel-muted">{formatJalaliDateTime(req.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>
                    {status.label}
                  </span>
                  {req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => void onDecideCreditRequest(req, true)}
                        className="rounded-lg bg-[#34d399] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[#2bb583]"
                      >
                        تأیید
                      </button>
                      <button
                        onClick={() => void onDecideCreditRequest(req, false)}
                        className="rounded-lg bg-danger px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-danger/90"
                      >
                        رد
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const webserviceRequestsCard = staffReviewRoles && (
    <SectionCard title="درخواست‌های خرید وب‌سرویس">
      {webserviceRequests.length === 0 ? (
        <p className="text-xs text-panel-muted">درخواستی ثبت نشده است.</p>
      ) : (
        <div className="space-y-2">
          {webserviceRequests.map((req) => {
            const status = REQUEST_STATUS[req.status];
            return (
              <div key={req.id} className="flex items-center justify-between rounded-lg bg-panel-canvas p-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-panel-ink">
                    {WS_SCOPE_LABEL[req.scope]} — {faDigits(req.months)} ماهه
                  </div>
                  <div className="font-num mt-0.5 text-[11px] text-panel-muted">
                    {faMoney(req.priceIrr)} تومان
                  </div>
                  {req.note && <div className="mt-0.5 text-[11px] text-panel-muted">{req.note}</div>}
                  <div className="mt-0.5 text-[10px] text-panel-muted">{formatJalaliDateTime(req.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>
                    {status.label}
                  </span>
                  {req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => void onDecideWebserviceRequest(req, true)}
                        className="rounded-lg bg-[#34d399] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[#2bb583]"
                      >
                        تأیید
                      </button>
                      <button
                        onClick={() => void onDecideWebserviceRequest(req, false)}
                        className="rounded-lg bg-danger px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-danger/90"
                      >
                        رد
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const scoreCard = detail.activityScore && (
    <SectionCard title="امتیاز فعالیت آژانس">
      <div className="flex items-center gap-4">
        <div className="font-num text-3xl font-black text-panel-ink">{faDigits(detail.activityScore.score)}</div>
        <span className="rounded-full bg-[#f59e0b1f] px-3 py-1 text-xs font-bold text-[#b45309]">
          سطح {detail.activityScore.badge === 'GOLD' ? 'گلد' : detail.activityScore.badge === 'SILVER' ? 'نقره‌ای' : 'برنز'}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-panel-muted">
        امتیاز بر اساس صندلی‌های فروخته‌شده، فاکتورهای پرداخت‌شده و وضعیت فعالیت محاسبه می‌شود.
      </p>
    </SectionCard>
  );

  const infoAndActivity = (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="اطلاعات آژانس">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-panel-muted">مدیر مسئول</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">{detail.managerName}</dd>
          </div>
          <div>
            <dt className="text-panel-muted">شماره مجوز بند ب</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr font-num">{detail.licenseNo}</span>
            </dd>
          </div>
          <div>
            <dt className="text-panel-muted">شهر</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">{detail.city}</dd>
          </div>
          <div>
            <dt className="text-panel-muted">سطح همکاری</dt>
            <dd className="mt-0.5 font-bold text-[#b45309]">{TIER_LABELS[detail.tier]}</dd>
          </div>
          <div>
            <dt className="text-panel-muted">تلفن</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr font-num">{detail.phone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-panel-muted">ایمیل</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr">{detail.email}</span>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-panel-muted">آدرس</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">{detail.address || '—'}</dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard title="فعالیت‌های اخیر">
        {detail.recentActivity.length === 0 ? (
          <p className="py-4 text-center text-xs text-panel-muted">فعالیتی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-3">
            {detail.recentActivity.map((a) => (
              <li key={a.id} className="border-r-2 border-accent/40 pr-3">
                <div className="text-xs font-bold text-panel-ink">{a.action}</div>
                <div className="mt-0.5 text-[11px] text-panel-muted">{a.detail}</div>
                <div className="font-num mt-0.5 text-[10px] text-panel-muted-2">{formatJalaliDateTime(a.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );

  const apiKeyCard = isSenior && (
    <SectionCard
      title="دسترسی API رزرواسیون"
      action={
        activeKey && (
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              activeKey.status === 'ACTIVE'
                ? 'bg-[#34d39924] text-[#34d399]'
                : activeKey.status === 'REVOKED'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-[#f59e0b24] text-[#b45309]'
            }`}
          >
            {activeKey.status === 'ACTIVE' ? 'فعال' : activeKey.status === 'REVOKED' ? 'لغوشده' : 'معلق'}
          </span>
        )
      }
    >
      <p className="mb-4 text-[11px] leading-relaxed text-panel-muted">
        صدور کلید API برای اتصال این آژانس به سامانه رزرواسیون — پس از تولید، نام آژانس در بخش «دسترسی
        آژانس‌ها»ی سامانه رزرواسیون نمایش داده می‌شود.
      </p>

      {freshRawKey && (
        <div className="mb-4 rounded-lg border border-[#f59e0b40] bg-[#f59e0b0d] p-3">
          <div className="text-[11px] font-bold text-[#92400e]">
            کلید جدید — فقط همین یک‌بار نمایش داده می‌شود؛ آن را کپی کنید:
          </div>
          <code className="ltr font-num mt-1 block break-all text-xs text-panel-ink">{freshRawKey}</code>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <div>
          <div className="mb-2 text-xs font-bold text-panel-ink">سطح دسترسی API:</div>
          <div className="mb-4 flex flex-wrap gap-2">
            {API_SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setApiScope(opt.value)}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  apiScope === opt.value ? 'bg-accent text-white' : 'bg-panel-canvas text-panel-muted hover:bg-panel-surface-2'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void onIssueApiKey()}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            تولید API
          </button>
        </div>
      ) : (
        activeKey && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-panel-canvas p-3">
              <span className="text-[10px] text-panel-muted">API Key</span>
              <code className="ltr font-num text-xs text-panel-ink">{activeKey.keyHint}</code>
              <span className="mr-auto text-[10px] font-bold text-panel-muted">
                {API_SCOPE_OPTIONS.find((o) => o.value === activeKey.scope)?.label}
              </span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#34d39910] p-3">
                <div className="text-[10px] text-panel-muted">زمان فعال‌سازی</div>
                <div className="font-num mt-0.5 text-xs font-bold text-[#34d399]">
                  {formatJalaliDate(activeKey.activatedAt)}
                </div>
              </div>
              <div className="rounded-lg bg-[#f59e0b10] p-3">
                <div className="text-[10px] text-panel-muted">زمان اتمام</div>
                <div className="font-num mt-0.5 text-xs font-bold text-[#b45309]">
                  {activeKey.expiresAt ? formatJalaliDate(activeKey.expiresAt) : 'نامحدود'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {activeKey.status === 'REVOKED' ? (
                <button
                  onClick={() => void onIssueApiKey()}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
                >
                  صدور کلید تازه
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void onApiKeyAction(activeKey, 'toggle')}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      activeKey.status === 'ACTIVE'
                        ? 'bg-danger/10 text-danger hover:bg-danger/20'
                        : 'bg-[#34d39915] text-[#34d399] hover:bg-[#34d39925]'
                    }`}
                  >
                    {activeKey.status === 'ACTIVE' ? 'تعلیق دسترسی' : 'فعال‌سازی دسترسی'}
                  </button>
                  <button
                    onClick={() => void onApiKeyAction(activeKey, 'regenerate')}
                    className="rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/5"
                  >
                    تولید کلید جدید
                  </button>
                </>
              )}
            </div>
          </div>
        )
      )}
    </SectionCard>
  );

  const invoicesSection = (isCommercial || isFinance || isEmployee) && (
    <SectionCard
      title="فاکتورهای صادرشده"
      action={
        isCommercial ? (
          <button
            onClick={() => {
              setInvoiceError(null);
              setInvoiceOpen(true);
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            صدور فاکتور
          </button>
        ) : undefined
      }
    >
      {invoices.length === 0 ? (
        <p className="py-4 text-center text-xs text-panel-muted">فاکتوری صادر نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-panel-border text-[10px] text-panel-muted">
                <th className="py-2 font-bold">شماره فاکتور</th>
                <th className="py-2 font-bold">تاریخ صدور</th>
                <th className="py-2 font-bold">سررسید</th>
                <th className="py-2 font-bold">مبلغ</th>
                <th className="py-2 font-bold">وضعیت</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = INVOICE_STATUS[inv.status];
                return (
                  <tr key={inv.id} className="border-b border-panel-border/60">
                    <td className="py-2.5">
                      <span className="ltr font-num">{inv.invoiceNo}</span>
                    </td>
                    <td className="font-num py-2.5">{formatJalaliDate(inv.issuedAt)}</td>
                    <td className="font-num py-2.5">{formatJalaliDate(inv.dueAt)}</td>
                    <td className="font-num py-2.5 font-bold">{faMoney(inv.amountIrr)} تومان</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="py-2.5">
                      {inv.status !== 'PAID' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => void onRemindInvoice(inv)}
                            className="rounded-md bg-[#f59e0b1a] px-2.5 py-1 text-[10px] font-bold text-[#b45309] transition hover:bg-[#f59e0b2c]"
                          >
                            یادآوری
                          </button>
                          <button
                            onClick={() => void onPayInvoice(inv)}
                            className="rounded-md bg-[#34d39918] px-2.5 py-1 text-[10px] font-bold text-[#34d399] transition hover:bg-[#34d39930]"
                          >
                            ثبت پرداخت این فاکتور
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const messagesSection = isCommercial && (
    <section className="flex h-[540px] flex-col rounded-xl border border-panel-border bg-panel-surface">
      <div className="border-b border-panel-border px-5 py-4">
        <div className="text-sm font-bold text-panel-ink">مکاتبهٔ ایرلاین blujet با {detail.fullName}</div>
        <div className="mt-0.5 text-[11px] text-panel-muted">گفتگوی اختصاصی این آژانس</div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-panel-muted">هنوز پیامی با این آژانس رد و بدل نشده است.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.senderIsAgency ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  m.senderIsAgency ? 'bg-panel-canvas text-panel-ink' : 'bg-accent text-white'
                }`}
              >
                <p>{m.body}</p>
                <div className={`font-num mt-1 text-[10px] ${m.senderIsAgency ? 'text-panel-muted' : 'text-white/70'}`}>
                  {m.senderIsAgency ? detail.fullName : 'ایرلاین blujet'} · {formatJalaliDateTime(m.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2 border-t border-panel-border p-4">
        <input
          value={messageDraft}
          onChange={(e) => setMessageDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSendMessage();
          }}
          placeholder="پیام خود را به این آژانس بنویسید…"
          className="h-10 flex-1 rounded-lg border border-panel-border-2 bg-panel-canvas px-3 text-xs text-panel-ink outline-none transition focus:border-accent"
        />
        <button
          onClick={() => void onSendMessage()}
          className="rounded-lg bg-accent px-4 text-xs font-bold text-white transition hover:bg-accent/90"
        >
          ارسال
        </button>
      </div>
    </section>
  );

  const extras = detail.commercialExtras;

  const flightsSoldSection = extras && (
    <SectionCard title="میزان پرواز فروخته‌شده">
      {extras.flightsSold.length === 0 ? (
        <p className="py-4 text-center text-xs text-panel-muted">فروشی برای این آژانس ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-right text-xs">
            <thead>
              <tr className="border-b border-panel-border text-[10px] text-panel-muted">
                <th className="py-2 font-bold">مسیر</th>
                <th className="py-2 font-bold">پرواز</th>
                <th className="py-2 font-bold">تاریخ</th>
                <th className="py-2 font-bold">صندلی</th>
                <th className="py-2 font-bold">مبلغ فروش</th>
              </tr>
            </thead>
            <tbody>
              {extras.flightsSold.map((f, i) => (
                <tr key={`${f.flightNo}-${i}`} className="border-b border-panel-border/60">
                  <td className="py-2.5 font-bold text-panel-ink">{f.routeFa}</td>
                  <td className="ltr font-num py-2.5 text-panel-muted">{f.flightNo}</td>
                  <td className="font-num py-2.5 text-panel-muted">{formatJalaliDate(f.departAt)}</td>
                  <td className="font-num py-2.5 font-bold">{faDigits(f.seatCount)}</td>
                  <td className="font-num py-2.5 font-bold text-[#34d399]">{faMoney(f.salesIrr)} تومان</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const purchasedServicesSection = extras && (
    <SectionCard title="سرویس‌های خریداری‌شده">
      {extras.purchasedServices.length === 0 ? (
        <p className="py-4 text-center text-xs text-panel-muted">سرویسی خریداری نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-right text-xs">
            <thead>
              <tr className="border-b border-panel-border text-[10px] text-panel-muted">
                <th className="py-2 font-bold">سرویس</th>
                <th className="py-2 font-bold">تاریخ خرید</th>
                <th className="py-2 font-bold">تاریخ انقضا</th>
                <th className="py-2 font-bold">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {extras.purchasedServices.map((s, i) => (
                <tr key={`${s.name}-${i}`} className="border-b border-panel-border/60">
                  <td className="py-2.5 font-bold text-panel-ink">{s.name}</td>
                  <td className="font-num py-2.5 text-panel-muted">{formatJalaliDate(s.purchasedAt)}</td>
                  <td className="font-num py-2.5 text-panel-muted">
                    {s.expiresAt ? formatJalaliDate(s.expiresAt) : '—'}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        s.status === 'ACTIVE' ? 'bg-[#34d39924] text-[#34d399]' : 'bg-panel-canvas text-panel-muted'
                      }`}
                    >
                      {s.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const unpaidInvoices = invoices.filter((inv) => inv.status !== 'PAID');
  const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
  const financeSummary = extras?.financeSummary ?? {
    paidTotalIrr: paidInvoices.reduce((s, i) => s + Number(i.amountIrr), 0),
    unpaidTotalIrr: unpaidInvoices.reduce((s, i) => s + Number(i.amountIrr), 0),
  };

  const financeKpiRow = (isCommercial || isFinance) && (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatBox label="درآمد کل فروش" value={`${faMoney(detail.stats.totalSalesIrr)} تومان`} />
      <StatBox label="مجموع پرداخت‌شده" value={`${faMoney(financeSummary.paidTotalIrr)} تومان`} />
      <StatBox label="مانده پرداخت‌نشده" value={`${faMoney(financeSummary.unpaidTotalIrr)} تومان`} />
      <StatBox label="مانده اعتبار" value={`${faMoney(detail.credit.remainingIrr)} تومان`} />
    </div>
  );

  const unpaidInvoicesSection = (isCommercial || isFinance) && unpaidInvoices.length > 0 && (
    <SectionCard
      title="فاکتورهای پرداخت‌نشده"
      action={
        <span className="font-num text-sm font-extrabold text-danger">
          {faMoney(unpaidInvoices.reduce((s, i) => s + Number(i.amountIrr), 0))} تومان
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {unpaidInvoices.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border/60 py-2.5">
            <div>
              <div className="ltr font-num text-xs font-bold text-panel-ink">{inv.invoiceNo}</div>
              <div className="mt-0.5 text-[10.5px] text-panel-muted">
                صدور {formatJalaliDate(inv.issuedAt)} · سررسید {formatJalaliDate(inv.dueAt)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-num text-xs font-extrabold text-danger">{faMoney(inv.amountIrr)} تومان</span>
              <button
                onClick={() => void onRemindInvoice(inv)}
                className="rounded-md bg-[#f59e0b1a] px-2.5 py-1 text-[10px] font-bold text-[#b45309]"
              >
                یادآوری
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );

  const transactionsSection = extras && extras.transactions.length > 0 && (
    <SectionCard title="تراکنش‌ها">
      <div className="flex flex-col gap-2">
        {extras.transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 border-b border-panel-border/60 py-2.5">
            <div>
              <div className="text-xs font-bold text-panel-ink">{t.titleFa}</div>
              <div className="mt-0.5 text-[10.5px] text-panel-muted">
                {formatJalaliDateTime(t.occurredAt)}
                {t.ref ? ` · PNR ${t.ref}` : ''}
              </div>
            </div>
            <span
              className={`font-num text-xs font-extrabold ${
                t.signedAmountIrr >= 0 ? 'text-[#34d399]' : 'text-danger'
              }`}
            >
              {t.signedAmountIrr >= 0 ? '+' : ''}
              {faMoney(Math.abs(t.signedAmountIrr))} تومان
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );

  const filteredHistoryTransactions = (extras?.transactions ?? []).filter((t) => {
    const q = historyQuery.trim();
    if (q && !t.titleFa.includes(q) && !(t.ref ?? '').includes(q)) return false;
    if (historyDate && !t.occurredAt.startsWith(historyDate.slice(0, 10))) return false;
    return true;
  });

  const filteredSeatRequestHistory = seatRequestHistory.filter((r) => {
    const q = historyQuery.trim();
    if (q && !r.routeFa.includes(q)) return false;
    if (historyDate && !r.createdAt.startsWith(historyDate.slice(0, 10))) return false;
    return true;
  });

  const historyContent = (
    <div className="flex flex-col gap-[15px]">
      <div className="flex flex-wrap gap-[9px]">
        <input
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
          placeholder="جستجو در سابقه بر اساس مسیر یا شماره…"
          className="h-11 min-w-[220px] flex-1 rounded-[11px] border border-panel-border-2 bg-panel-canvas px-3.5 text-xs text-panel-ink outline-none transition focus:border-accent"
        />
        <div className="h-11 overflow-hidden rounded-[11px] border border-panel-border-2 bg-panel-surface-2">
          <JalaliDatePicker label="تاریخ" value={historyDate} onChange={setHistoryDate} theme="dark" compact placeholder="انتخاب تاریخ" />
        </div>
        {historyDate && (
          <button onClick={() => setHistoryDate(null)} className="px-1 text-[11px] font-bold text-accent">
            پاک‌کردن تاریخ
          </button>
        )}
      </div>

      <SectionCard
        title="سابقهٔ درخواست‌های خرید صندلی"
        action={<span className="rounded-xl bg-panel-canvas px-2 py-0.5 text-[10.5px] font-bold text-panel-muted">{faDigits(filteredSeatRequestHistory.length)}</span>}
      >
        {filteredSeatRequestHistory.length === 0 ? (
          <p className="py-4 text-center text-xs text-panel-muted">درخواستی یافت نشد.</p>
        ) : (
          <div className="flex flex-col">
            {filteredSeatRequestHistory.map((r) => {
              const st = SEAT_REQUEST_HISTORY_STATUS_LABEL[r.status];
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b border-panel-border/60 py-2.5 last:border-b-0">
                  <div>
                    <div className="text-xs font-extrabold text-panel-ink">{r.routeFa}</div>
                    <div className="mt-0.5 text-[10.5px] text-panel-muted">
                      {faDigits(r.seats)} صندلی · {seatRequestTermLabel(r.months)} · {faMoney(r.totalIrr)} تومان
                    </div>
                  </div>
                  <span className="rounded-2xl px-2.5 py-1 text-[10px] font-bold" style={{ color: st.color, background: st.bg }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="تاریخچهٔ پرداخت"
        action={<span className="rounded-xl bg-panel-canvas px-2 py-0.5 text-[10.5px] font-bold text-panel-muted">{faDigits(filteredHistoryTransactions.length)}</span>}
      >
        {filteredHistoryTransactions.length === 0 ? (
          <p className="py-4 text-center text-xs text-panel-muted">پرداختی یافت نشد.</p>
        ) : (
          <div className="flex flex-col">
            {filteredHistoryTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b border-panel-border/60 py-2.5 last:border-b-0">
                <div>
                  <div className="text-xs font-bold text-panel-ink">{t.titleFa}</div>
                  <div className="mt-0.5 text-[10.5px] text-panel-muted">
                    {formatJalaliDateTime(t.occurredAt)}
                    {t.ref ? ` · PNR ${t.ref}` : ''}
                  </div>
                </div>
                <span className={`font-num text-xs font-extrabold ${t.signedAmountIrr >= 0 ? 'text-[#34d399]' : 'text-danger'}`}>
                  {t.signedAmountIrr >= 0 ? '+' : ''}
                  {faMoney(Math.abs(t.signedAmountIrr))} تومان
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );

  const overviewContent = (
    <div className="space-y-4">
      {statsRow}
      {creditCard}
      {scoreCard}
      {apiKeyCard}
      {/* isCommercial is always false in this non-tabbed branch, so this
         only ever renders for an EMPLOYEE holding fn_invoices. */}
      {invoicesSection}
      {documentsCard}
      {creditRequestsCard}
      {webserviceRequestsCard}
      {infoAndActivity}
    </div>
  );

  return (
    <div className="space-y-4 p-8">
      <Link to="/panel/agencies" className="inline-block text-xs font-bold text-accent">
        بازگشت به فهرست آژانس‌ها
      </Link>

      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p className="rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">{notice}</p>}

      <header className="rounded-2xl bg-gradient-to-l from-navy to-navy-2 p-6 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">
            {detail.fullName.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black">{detail.fullName}</h1>
            <p className="mt-1 text-xs text-white/70">
              مجوز بند ب: <span className="ltr font-num">{detail.licenseNo}</span> · عضویت از{' '}
              <span className="font-num">{formatJalaliDate(detail.joinedAt)}</span>
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${badge.className}`}>{badge.label}</span>
          <button
            onClick={() => void onToggleSuspend()}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
              detail.isActive ? 'bg-danger text-white hover:bg-danger/90' : 'bg-[#34d399] text-white hover:bg-[#2bb583]'
            }`}
          >
            {detail.isActive ? 'تعلیق حساب' : 'فعال‌سازی مجدد'}
          </button>
        </div>
        {!detail.isActive && (
          <div className="mt-4 rounded-lg bg-danger/20 p-3 text-xs">
            <div className="font-bold">حساب این آژانس تعلیق شده است</div>
            {detail.suspendReason && <div className="mt-1 text-white/80">دلیل تعلیق: {detail.suspendReason}</div>}
          </div>
        )}
      </header>

      {isCommercial || isFinance || isSenior ? (
        <>
          <div
            className={`gap-1.5 border border-panel-border bg-panel-surface p-1 ${
              isCommercial ? 'grid grid-cols-4 rounded-xl' : 'flex rounded-xl'
            }`}
          >
            {(
              [
                { key: 'overview', label: 'نمای کلی' },
                { key: 'finance', label: 'مالی' },
                ...(isCommercial
                  ? [{ key: 'messages' as const, label: 'مکاتبه‌ها' }]
                  : []),
                { key: 'history', label: 'سابقه' },
              ] as { key: CommercialTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  tab === t.key ? 'bg-accent text-white' : 'bg-panel-canvas text-panel-muted hover:bg-panel-surface-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              {statsRow}
              {scoreCard}
              {creditCard}
              {infoAndActivity}
              {isCommercial && flightsSoldSection}
              {isCommercial && purchasedServicesSection}
              {isSenior && apiKeyCard}
            </div>
          )}
          {tab === 'finance' && (
            <div className="space-y-4">
              {(isCommercial || isFinance) && financeKpiRow}
              {creditCard}
              {invoicesSection}
              {unpaidInvoicesSection}
              {(isCommercial || isFinance) && transactionsSection}
              {documentsCard}
              {creditRequestsCard}
              {webserviceRequestsCard}
            </div>
          )}
          {tab === 'messages' && isCommercial && messagesSection}
          {tab === 'history' && historyContent}
        </>
      ) : (
        overviewContent
      )}

      {suspendOpen && (
        <Modal title="تعلیق حساب آژانس" onClose={() => setSuspendOpen(false)}>
          <p className="mb-3 text-xs text-panel-muted">
            دلیل تعلیق حساب را وارد کنید. این متن در پروفایل آژانس ثبت و نمایش داده می‌شود.
          </p>
          <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="suspend-reason">
            دلیل تعلیق *
          </label>
          <textarea
            id="suspend-reason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="مثلاً: بدهی معوق و عدم تسویه در موعد مقرر…"
            rows={3}
            className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />
          {suspendError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {suspendError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setSuspendOpen(false)} className="rounded-lg bg-panel-canvas px-4 py-2 text-xs font-bold text-panel-muted">
              انصراف
            </button>
            <button
              onClick={() => void onConfirmSuspend()}
              className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white transition hover:bg-danger/90"
            >
              تعلیق و ثبت دلیل
            </button>
          </div>
        </Modal>
      )}

      {creditOpen && (
        <Modal title="تعیین سقف اعتبار" onClose={() => setCreditOpen(false)}>
          <div className="mb-3 inline-block rounded-full bg-panel-canvas px-3 py-1 text-[11px] text-panel-muted">
            سقف فعلی: <span className="font-num font-bold">{faMoney(detail.credit.limitIrr)} تومان</span>
          </div>
          <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="credit-input">
            سقف اعتبار جدید (تومان)
          </label>
          <input
            id="credit-input"
            dir="ltr"
            value={creditInput}
            onChange={(e) => setCreditInput(e.target.value)}
            placeholder="مثلاً 100000000"
            className="font-num w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />
          {creditError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {creditError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setCreditOpen(false)} className="rounded-lg bg-panel-canvas px-4 py-2 text-xs font-bold text-panel-muted">
              انصراف
            </button>
            <button
              onClick={() => void onConfirmCredit()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
            >
              ثبت اعتبار
            </button>
          </div>
        </Modal>
      )}

      {invoiceOpen && (
        <Modal title="صدور فاکتور جدید" onClose={() => setInvoiceOpen(false)}>
          <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="invoice-amount">
            مبلغ فاکتور (تومان)
          </label>
          <input
            id="invoice-amount"
            dir="ltr"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value)}
            placeholder="مثلاً ۱۵۰۰۰۰۰۰۰"
            className="font-num w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />
          {parseTomanToRial(invoiceAmount) !== null && (
            <p className="mt-1 text-[11px] text-panel-muted">
              مبلغ واردشده: <span className="font-num">{faMoney(parseTomanToRial(invoiceAmount)!)} تومان</span>
            </p>
          )}
          <label className="mb-1 mt-3 block text-xs font-bold text-panel-ink" htmlFor="invoice-due">
            تاریخ سررسید
          </label>
          <input
            id="invoice-due"
            value={invoiceDue}
            onChange={(e) => setInvoiceDue(e.target.value)}
            placeholder="مثلاً ۱۴۰۵/۰۴/۳۰"
            className="font-num w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />
          {invoiceError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {invoiceError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setInvoiceOpen(false)} className="rounded-lg bg-panel-canvas px-4 py-2 text-xs font-bold text-panel-muted">
              انصراف
            </button>
            <button
              onClick={() => void onIssueInvoice()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
            >
              صدور و ثبت فاکتور
            </button>
          </div>
        </Modal>
      )}
      {stepUp.modal}
    </div>
  );
}
