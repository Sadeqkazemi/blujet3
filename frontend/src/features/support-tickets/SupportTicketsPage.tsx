import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAdminSupportTicket,
  fetchForwardTargets,
  fetchSupportTicketDetail,
  fetchSupportTickets,
  forwardSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
} from '../../api/support-tickets';
import AttachmentPicker from '../../components/AttachmentPicker';
import ConversationHistory from '../../components/ConversationHistory';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { ReferralAttachment } from '../../types/cartable';
import type {
  ForwardTarget,
  SupportTicketDept,
  SupportTicketRow,
  SupportTicketStatus,
} from '../../types/support-tickets';

const STATUS_META: Record<SupportTicketStatus, { label: string; className: string }> = {
  OPEN: { label: 'باز', className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]' },
  IN_PROGRESS: { label: 'در حال بررسی', className: 'bg-[rgba(59,130,246,.16)] text-[#60a5fa]' },
  ANSWERED: { label: 'پاسخ داده‌شده', className: 'bg-[rgba(52,211,153,.14)] text-[#34d399]' },
  CLOSED: { label: 'بسته شده', className: 'bg-[rgba(139,151,168,.16)] text-[#8b97a8]' },
};

const PRIORITY_META: Record<
  SupportTicketRow['priority'],
  { label: string; className: string }
> = {
  HIGH: { label: 'بالا', className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]' },
  MEDIUM: { label: 'متوسط', className: 'bg-[rgba(245,158,11,.14)] text-[#fbbf24]' },
  LOW: { label: 'پایین', className: 'bg-[rgba(52,211,153,.14)] text-[#34d399]' },
};

const DEPT_LABEL: Record<SupportTicketDept, string> = {
  SITE: 'سایت',
  AGENCY: 'آژانس‌ها',
};

const STATUS_TABS: { key: SupportTicketStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'همه' },
  { key: 'OPEN', label: 'باز' },
  { key: 'IN_PROGRESS', label: 'در حال بررسی' },
  { key: 'ANSWERED', label: 'پاسخ داده‌شده' },
  { key: 'CLOSED', label: 'بسته شده' },
];

const DEPT_CHIPS: { key: SupportTicketDept | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'همه بخش‌ها' },
  { key: 'SITE', label: 'سایت' },
  { key: 'AGENCY', label: 'آژانس‌ها' },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

function matchesQuery(t: SupportTicketRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  return [t.trackingCode, t.subject, t.requesterName, t.body]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/**
 * کارتابل تیکت مدیران و کارمندان — dark layout matching design screenshots:
 * 5 KPIs, status/dept filters, search, create modal, table, 10/page.
 */
export default function SupportTicketsPage({
  embedded = false,
  assignedMode = false,
}: {
  embedded?: boolean;
  assignedMode?: boolean;
}) {
  const siteAdminMode = !assignedMode;
  const [tickets, setTickets] = useState<SupportTicketRow[] | null>(null);
  const [detail, setDetail] = useState<SupportTicketRow | null>(null);
  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [targetPick, setTargetPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<ReferralAttachment[]>([]);
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'ALL'>('ALL');
  const [deptFilter, setDeptFilter] = useState<SupportTicketDept | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    subject: '',
    requesterName: '',
    dept: 'SITE' as SupportTicketDept,
    priority: 'MEDIUM' as SupportTicketRow['priority'],
    body: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAttachments, setCreateAttachments] = useState<ReferralAttachment[]>([]);

  const load = useCallback(async () => {
    try {
      setTickets(await fetchSupportTickets());
    } catch {
      setError('خطا در دریافت تیکت‌های پشتیبانی.');
    }
  }, []);

  useEffect(() => {
    void load();
    if (siteAdminMode) {
      fetchForwardTargets()
        .then(setTargets)
        .catch(() => setTargets([]));
    }
  }, [siteAdminMode, load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      setTargetPick('');
      setReplyBody('');
      setReplyAttachments([]);
      setReplyError(null);
      setDetail(await fetchSupportTicketDetail(id));
    } catch {
      setError('خطا در دریافت جزئیات تیکت.');
    }
  }

  async function onForward() {
    if (!detail || !targetPick) return;
    try {
      const updated = await forwardSupportTicket(detail.id, targetPick);
      const target = targets.find((t) => t.id === targetPick);
      setNotice(`تیکت به ${target?.fullName ?? 'کارمند'} ارجاع شد ✓`);
      setDetail(updated);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت ارجاع.');
    }
  }

  async function onStatusChange(status: SupportTicketStatus) {
    if (!detail) return;
    try {
      const updated = await updateSupportTicketStatus(detail.id, status);
      setDetail(updated);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تغییر وضعیت.');
    }
  }

  async function onReply() {
    if (!detail || detail.status === 'CLOSED' || replyBody.trim().length < 2 || replyBusy) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      const updated = await replySupportTicket(detail.id, {
        body: replyBody.trim(),
        attachmentIds: replyAttachments.map((file) => file.id),
      });
      setDetail(updated);
      setReplyBody('');
      setReplyAttachments([]);
      setNotice(`پاسخ تیکت ${updated.trackingCode} ارسال شد ✓`);
      await load();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'خطا در ارسال پاسخ.');
    } finally {
      setReplyBusy(false);
    }
  }

  async function onCreate() {
    setCreateError(null);
    if (!createForm.subject.trim() || !createForm.requesterName.trim() || !createForm.body.trim()) {
      setCreateError('موضوع، درخواست‌کننده و شرح تیکت الزامی است.');
      return;
    }
    setCreating(true);
    try {
      const created = await createAdminSupportTicket({
        subject: createForm.subject.trim(),
        requesterName: createForm.requesterName.trim(),
        dept: createForm.dept,
        priority: createForm.priority,
        body: createForm.body.trim(),
        attachmentIds: createAttachments.length ? createAttachments.map((file) => file.id) : undefined,
      });
      setNotice(`تیکت ${created.trackingCode} ثبت شد ✓`);
      setCreateOpen(false);
      setCreateForm({
        subject: '',
        requesterName: '',
        dept: 'SITE',
        priority: 'MEDIUM',
        body: '',
      });
      setCreateAttachments([]);
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'خطا در ثبت تیکت.');
    } finally {
      setCreating(false);
    }
  }

  const all = useMemo(() => tickets ?? [], [tickets]);
  const kpis = useMemo(
    () => ({
      total: all.length,
      open: all.filter((t) => t.status === 'OPEN').length,
      progress: all.filter((t) => t.status === 'IN_PROGRESS').length,
      answered: all.filter((t) => t.status === 'ANSWERED').length,
      closed: all.filter((t) => t.status === 'CLOSED').length,
    }),
    [all],
  );

  const filtered = useMemo(
    () =>
      all.filter((t) => {
        if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
        if (deptFilter !== 'ALL' && t.dept !== deptFilter) return false;
        return matchesQuery(t, query);
      }),
    [all, statusFilter, deptFilter, query],
  );

  const pager = usePagination(filtered);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on filters only
  }, [statusFilter, deptFilter, query]);

  return (
    <div data-testid="management-ticket-center" className={`flex flex-col gap-[15px] px-[21px] pb-[34px] ${embedded ? 'pt-[15px]' : 'pt-[18px]'}`}>
      <div>
        <h1 className="m-0 text-[20.5px] font-black text-white">{assignedMode ? 'تیکت‌های ارجاع‌شده' : 'تیکت‌ها'}</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          {assignedMode
            ? 'گفتگوهای مشتریان و آژانس‌ها که ادمین سایت برای اقدام به شما ارجاع داده است'
            : 'ثبت، پیگیری و ارجاع تیکت‌های پشتیبانی'}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">{notice}</p>
      )}

      <div className="grid grid-cols-2 gap-[11px] md:grid-cols-5">
        {([
          ['ALL', 'کل تیکت‌ها', kpis.total, 'text-white'],
          ['OPEN', 'باز', kpis.open, 'text-[#f59e0b]'],
          ['IN_PROGRESS', 'در حال بررسی', kpis.progress, 'text-[#60a5fa]'],
          ['ANSWERED', 'پاسخ داده‌شده', kpis.answered, 'text-[#34d399]'],
          ['CLOSED', 'بسته‌شده', kpis.closed, 'text-[#8b97a8]'],
        ] as const).map(([key, label, count, color]) => {
          const selected = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-label={`${label} ${faDigits(count)}`}
              aria-pressed={selected}
              onClick={() => setStatusFilter(key)}
              className={`rounded-[14px] border bg-[#141d2e] px-3 py-[11px] text-start transition focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 ${
                selected ? 'border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,.18)]' : 'border-[#1f2a3d] hover:border-[#34435f]'
              }`}
            >
              <div className="text-[11px] text-[#6b7b94]">{label}</div>
              <div className={`font-num mt-1 text-[20.5px] font-black ${color}`}>{faDigits(count)}</div>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#1f2a3d] px-[14px] py-[11px]">
          <div className="flex gap-[3px] rounded-[11px] border border-[#1f2a3d] bg-[#0f1623] p-[3px]">
            {STATUS_TABS.map((s) => {
              const on = statusFilter === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatusFilter(s.key)}
                  className={`whitespace-nowrap rounded-lg px-[11px] py-1.5 text-[11.5px] transition ${
                    on ? 'bg-[#3b82f6] font-bold text-white' : 'font-semibold text-[#6b7b94] hover:text-[#e7ecf3]'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-[#6b7b94]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو بر اساس شماره، موضوع یا درخواست‌کننده…"
              className="h-10 w-full rounded-[10px] border border-[#28344c] bg-[#18223a] py-0 pl-[11px] pr-[33px] text-[11.5px] text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
            />
          </div>
          {siteAdminMode && <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#3b82f6] px-3 py-2 text-[11.5px] font-bold text-white transition hover:bg-[#2563eb]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            ایجاد تیکت
          </button>}
        </div>

        <div className="flex flex-wrap items-center gap-[7px] border-b border-[#1a2436] px-[11px] py-2">
          {DEPT_CHIPS.map((d) => {
            const on = deptFilter === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDeptFilter(d.key)}
                className={`rounded-2xl border px-2.5 py-[5px] text-[10.5px] font-bold transition ${
                  on
                    ? 'border-[#3b82f6] bg-[rgba(59,130,246,.16)] text-[#60a5fa]'
                    : 'border-[#28344c] bg-transparent text-[#6b7b94] hover:text-[#e7ecf3]'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {tickets === null ? (
          <p className="py-10 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
        ) : filtered.length === 0 ? (
          <p className="py-[30px] text-center text-xs text-[#6b7b94]">
            {all.length === 0 ? 'تیکتی ثبت نشده است.' : 'تیکتی با این فیلتر یافت نشد'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[880px]">
                <div className="grid grid-cols-[1fr_2.4fr_1.4fr_1fr_1.1fr_1.2fr] gap-[11px] border-b border-[#1f2a3d] px-[15px] py-[11px] text-[11px] font-bold text-[#6b7b94]">
                  <span>شماره</span>
                  <span>موضوع</span>
                  <span>درخواست‌کننده</span>
                  <span>بخش</span>
                  <span>اولویت</span>
                  <span>وضعیت</span>
                </div>
                {pager.pageItems.map((t) => {
                  const st = STATUS_META[t.status];
                  const pr = PRIORITY_META[t.priority];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void openDetail(t.id)}
                      className="grid w-full grid-cols-[1fr_2.4fr_1.4fr_1fr_1.1fr_1.2fr] items-center gap-[11px] border-b border-[#1a2436] px-[15px] py-3 text-right text-[11.5px] transition hover:bg-[#18223a]"
                    >
                      <span className="ltr font-num font-bold text-[#60a5fa]">{t.trackingCode}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-[#e7ecf3]">{t.subject}</span>
                        <span className="mt-[3px] block text-[10px] text-[#6b7b94]">
                          {formatJalaliDateTime(t.updatedAt)}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-[7px]">
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#1d2a40] text-[10px] font-extrabold text-[#9fb0c7]">
                          {initials(t.requesterName)}
                        </span>
                        <span className="truncate text-[11px] text-[#cdd7e5]">{t.requesterName}</span>
                      </span>
                      <span className="text-[11px] text-[#9fb0c7]">{DEPT_LABEL[t.dept]}</span>
                      <span>
                        <span className={`rounded-[14px] px-[9px] py-[3px] text-[10.5px] font-bold ${pr.className}`}>
                          {pr.label}
                        </span>
                      </span>
                      <span>
                        <span className={`rounded-[14px] px-[9px] py-[3px] text-[10.5px] font-bold ${st.className}`}>
                          {st.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-[15px] pb-4">
              <Pagination
                page={pager.page}
                totalPages={pager.totalPages}
                onChange={pager.setPage}
                variant="dark"
              />
            </div>
          </>
        )}
      </section>

      {siteAdminMode && createOpen && (
        <Modal
          variant="dark"
          title="ایجاد تیکت جدید"
          onClose={() => setCreateOpen(false)}
          maxWidthClass="max-w-lg"
        >
          <p className="mb-4 text-[11.5px] text-[#60a5fa]">شماره تیکت پس از ثبت اختصاص می‌یابد</p>

          <label className="mb-1 block text-[11px] font-bold text-[#e7ecf3]">
            موضوع <span className="text-[#f87171]">*</span>
          </label>
          <input
            value={createForm.subject}
            onChange={(e) => setCreateForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="مثلاً: عدم صدور بلیط پس از پرداخت"
            className="mb-3 h-11 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
          />

          <label className="mb-1 block text-[11px] font-bold text-[#e7ecf3]">
            درخواست‌کننده <span className="text-[#f87171]">*</span>
          </label>
          <input
            value={createForm.requesterName}
            onChange={(e) => setCreateForm((f) => ({ ...f, requesterName: e.target.value }))}
            placeholder="نام آژانس یا کاربر"
            className="mb-3 h-11 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
          />

          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[#e7ecf3]">بخش</label>
              <select
                value={createForm.dept}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, dept: e.target.value as SupportTicketDept }))
                }
                className="h-11 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
              >
                <option value="SITE">سایت</option>
                <option value="AGENCY">آژانس‌ها</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[#e7ecf3]">اولویت</label>
              <select
                value={createForm.priority}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    priority: e.target.value as SupportTicketRow['priority'],
                  }))
                }
                className="h-11 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
              >
                <option value="HIGH">بالا</option>
                <option value="MEDIUM">متوسط</option>
                <option value="LOW">پایین</option>
              </select>
            </div>
          </div>

          <label className="mb-1 block text-[11px] font-bold text-[#e7ecf3]">
            شرح تیکت <span className="text-[#f87171]">*</span>
          </label>
          <textarea
            value={createForm.body}
            onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="جزئیات مشکل یا درخواست را بنویسید…"
            rows={4}
            className="mb-3 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
          />

          <div className="mb-3">
            <div className="mb-1 text-[11px] font-bold text-[#e7ecf3]">بارگذاری مستندات (PDF یا تصویر)</div>
            <AttachmentPicker
              theme="dark"
              value={createAttachments}
              onChange={(files) => setCreateAttachments(files.slice(-1))}
              disabled={creating}
            />
          </div>

          {createError && (
            <p role="alert" className="mb-3 text-xs text-[#f87171]">
              {createError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-[10px] border border-[#28344c] bg-[#18223a] px-4 py-2.5 text-xs font-bold text-[#9fb0c7]"
            >
              انصراف
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreate()}
              className="flex-1 rounded-[10px] bg-[#3b82f6] py-2.5 text-xs font-extrabold text-white transition hover:bg-[#2563eb] disabled:opacity-50"
            >
              ثبت تیکت
            </button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal
          variant="dark"
          title={`تیکت پشتیبانی · ${detail.trackingCode}`}
          onClose={() => setDetail(null)}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${STATUS_META[detail.status].className}`}>
              {STATUS_META[detail.status].label}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-bold ${PRIORITY_META[detail.priority].className}`}
            >
              اولویت {PRIORITY_META[detail.priority].label}
            </span>
            <span className="text-[11px] text-[#6b7b94]">{DEPT_LABEL[detail.dept]}</span>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">اطلاعات درخواست‌کننده</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <dt className="text-[#6b7b94]">نام</dt>
                <dd className="font-bold text-[#e7ecf3]">{detail.requesterName}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">شماره تماس</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{detail.requesterPhone}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#6b7b94]">موضوع</dt>
                <dd className="font-bold text-[#e7ecf3]">{detail.subject}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#6b7b94]">متن تیکت</dt>
                <dd className="text-[#e7ecf3]">{detail.body}</dd>
              </div>
            </dl>
          </div>

          <div className="mb-3">
            <ConversationHistory
              title="تاریخچه گفتگو"
              items={(detail.conversation?.length
                ? detail.conversation
                : [{
                    id: 'initial',
                    body: detail.body,
                    senderType: 'REQUESTER' as const,
                    senderLabel: detail.requesterName,
                    createdAt: detail.createdAt,
                    attachments: detail.attachments ?? [],
                  }]
              ).map((message) => ({
                id: message.id,
                body: message.body,
                actor: message.senderLabel,
                createdAt: message.createdAt,
                attachments: message.attachments,
                side: message.senderType === 'STAFF' ? 'recipient' : 'sender',
              }))}
            />
          </div>

          {detail.status === 'CLOSED' ? (
            <p className="mb-3 rounded-xl border border-[#5a2933] bg-[#26171b] px-4 py-3 text-center text-xs font-bold text-[#f08b98]">
              این تیکت بسته شده و امکان ارسال پاسخ ندارد.
            </p>
          ) : (
            <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
              <label htmlFor={`admin-ticket-reply-${detail.id}`} className="mb-2 block text-xs font-extrabold text-[#8fa1bb]">
                پاسخ به تیکت
              </label>
              <textarea
                id={`admin-ticket-reply-${detail.id}`}
                aria-label="پاسخ به تیکت"
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={3}
                placeholder="پاسخ پشتیبانی را بنویسید…"
                className="w-full resize-none rounded-xl border border-[#28344c] bg-[#0b111d] p-3 text-xs leading-6 text-white outline-none placeholder:text-[#66758a] focus:border-[#3b82f6]"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <AttachmentPicker
                  theme="dark"
                  value={replyAttachments}
                  onChange={(files) => setReplyAttachments(files.slice(-1))}
                  disabled={replyBusy}
                />
                <button
                  type="button"
                  onClick={() => void onReply()}
                  disabled={replyBusy || replyBody.trim().length < 2}
                  className="h-11 rounded-lg bg-[#3b82f6] px-4 text-xs font-black text-white transition hover:bg-[#2563eb] disabled:opacity-50"
                >
                  {replyBusy ? 'در حال ارسال…' : 'ارسال پاسخ'}
                </button>
              </div>
              {replyError && <p role="alert" className="mt-2 text-xs text-[#f87171]">{replyError}</p>}
            </div>
          )}

          {siteAdminMode && <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">ارجاع به کارمند</h3>
            <div className="flex gap-2">
              <select
                aria-label="گیرنده ارجاع"
                value={targetPick}
                onChange={(e) => setTargetPick(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-[#28344c] bg-[#18223a] px-2 text-xs text-[#e7ecf3] outline-none"
              >
                <option value="">— انتخاب کارمند —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} — {t.roleLabelFa}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void onForward()}
                disabled={!targetPick}
                className="rounded-lg bg-[#3b82f6] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#2563eb] disabled:opacity-50"
              >
                ثبت ارجاع
              </button>
            </div>
            {detail.forwardedTo && (
              <p className="mt-2 text-[11px] text-[#6b7b94]">ارجاع فعلی: {detail.forwardedTo.fullName}</p>
            )}
          </div>}

          {siteAdminMode && <div className="rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">تغییر وضعیت</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_META) as SupportTicketStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void onStatusChange(s)}
                  disabled={detail.status === s}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${STATUS_META[s].className}`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>}
        </Modal>
      )}
    </div>
  );
}
