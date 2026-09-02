import { useCallback, useEffect, useState } from 'react';
import {
  closeReferral,
  createReferral,
  fetchReferralDetail,
  fetchReferrals,
  fetchStaffDirectory,
  remindReferral,
  requestReferralRevision,
} from '../../api/cartable';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import { parseJalaliDateToIso } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import AttachmentPicker from '../../components/AttachmentPicker';
import AttachmentList from '../../components/AttachmentList';
import type {
  Referral,
  ReferralAttachment,
  ReferralListResult,
  ReferralPriority,
  ReferralReport,
  StaffDirectoryEntry,
} from '../../types/cartable';

const STATUS_META: Record<Referral['status'], { label: string; className: string }> = {
  SENT: { label: 'ارسال‌شده', className: 'bg-[#f59e0b24] text-[#b45309]' },
  REVIEWING: { label: 'در حال بررسی', className: 'bg-accent/10 text-accent' },
  REPORTED: { label: 'گزارش دریافت‌شد', className: 'bg-[#34d39924] text-[#34d399]' },
  CLOSED: { label: 'بسته‌شده', className: 'bg-panel-canvas text-panel-muted' },
};

const PRIORITY_META: Record<ReferralPriority, string> = { HIGH: 'بالا', MEDIUM: 'متوسط', LOW: 'پایین' };

export default function ReferralsPage() {
  const [result, setResult] = useState<ReferralListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [detail, setDetail] = useState<(Referral & { reports: ReferralReport[] }) | null>(null);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [priority, setPriority] = useState<ReferralPriority>('MEDIUM');
  const [due, setDue] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createAttachments, setCreateAttachments] = useState<ReferralAttachment[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setResult(await fetchReferrals());
    } catch {
      setError('خطا در دریافت ارجاعات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [load]);

  async function openDetail(id: string) {
    try {
      setDetail(await fetchReferralDetail(id));
    } catch {
      setError('خطا در دریافت جزئیات ارجاع.');
    }
  }

  function toggleRecipient(id: string) {
    setRecipients((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onCreate() {
    if (!title.trim() || !body.trim() || recipients.length === 0) {
      setCreateError('موضوع، شرح درخواست و حداقل یک مدیر مقصد الزامی است.');
      return;
    }
    let dueAt: string | undefined;
    if (due.trim()) {
      const iso = parseJalaliDateToIso(due);
      if (!iso) {
        setCreateError('مهلت را به شکل ۱۴۰۵/۰۴/۲۵ وارد کنید.');
        return;
      }
      dueAt = iso;
    }
    try {
      await createReferral({
        title: title.trim(),
        body: body.trim(),
        recipientIds: recipients,
        priority,
        dueAt,
        attachmentIds: createAttachments.map((a) => a.id),
      });
      const names = staff.filter((s) => recipients.includes(s.id)).map((s) => s.fullName).join('، ');
      setNotice(`ارجاع به «${names}» ارسال شد ✓`);
      setCreateOpen(false);
      setTitle('');
      setBody('');
      setRecipients([]);
      setDue('');
      setCreateAttachments([]);
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'خطا در ایجاد ارجاع.');
    }
  }

  async function onSenderAction(action: 'close' | 'revision' | 'remind') {
    if (!detail) return;
    try {
      if (action === 'close') {
        await closeReferral(detail.id);
        setNotice('گزارش تأیید و ارجاع بسته شد ✓');
      } else if (action === 'revision') {
        await requestReferralRevision(detail.id);
        setNotice('درخواست اصلاح و تکمیل گزارش ارسال شد');
      } else {
        await remindReferral(detail.id);
        setNotice('یادآوری دریافت گزارش ارسال شد');
      }
      await openDetail(detail.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت اقدام.');
    }
  }

  const kpis = result?.kpis;
  const referralsPager = usePagination(result?.referrals ?? []);

  if (detail) {
    const st = STATUS_META[detail.status];
    return (
      <div className="space-y-4 p-8">
        <button onClick={() => setDetail(null)} className="text-xs font-bold text-accent">
          بازگشت به فهرست ارجاعات
        </button>
        {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {notice && <p className="rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">{notice}</p>}

        <header className="rounded-2xl bg-gradient-to-l from-navy to-navy-2 p-6 text-white">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex-1 text-lg font-black">{detail.title}</h1>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${st.className}`}>{st.label}</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
              اولویت {PRIORITY_META[detail.priority]}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/80">
            <span>
              مدیر(ان) مقصد: {detail.recipients.map((r) => r.recipient.fullName).join('، ')}
            </span>
            <span className="font-num">تاریخ ایجاد: {formatJalaliDate(detail.createdAt)}</span>
            {detail.dueAt && <span className="font-num">مهلت دریافت گزارش: {formatJalaliDate(detail.dueAt)}</span>}
          </div>
        </header>

        <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
          <h2 className="mb-2 text-sm font-bold text-panel-ink">شرح درخواست</h2>
          <p className="text-xs leading-relaxed text-panel-muted">{detail.body}</p>
          <AttachmentList attachments={detail.attachments} variant="neutral" />
        </section>

        <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
          <h2 className="mb-3 text-sm font-bold text-panel-ink">
            گزارش‌های دریافتی ({faDigits(detail.reports.length)})
          </h2>
          {detail.reports.length === 0 ? (
            <p className="py-4 text-center text-xs text-panel-muted">هنوز گزارشی از مدیر(ان) مقصد دریافت نشده است.</p>
          ) : (
            <ul className="space-y-3">
              {detail.reports.map((r) => (
                <li key={r.id} className="rounded-lg bg-panel-canvas p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-panel-ink">{r.from.fullName}</span>
                    <span className="font-num text-panel-muted-2">{formatJalaliDate(r.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-panel-muted">{r.body}</p>
                  <AttachmentList attachments={r.attachments} variant="success" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-panel-border bg-panel-surface p-5">
          <span className="text-xs text-panel-muted">اقدام نسبت به این ارجاع:</span>
          {detail.status === 'REPORTED' ? (
            <>
              <button
                onClick={() => void onSenderAction('close')}
                className="rounded-lg bg-[#34d399] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2bb583]"
              >
                تأیید دریافت گزارش و بستن
              </button>
              <button
                onClick={() => void onSenderAction('revision')}
                className="rounded-lg bg-[#f59e0b1f] px-4 py-2 text-xs font-bold text-[#b45309] transition hover:bg-[#f59e0b33]"
              >
                درخواست اصلاح گزارش
              </button>
            </>
          ) : detail.status === 'CLOSED' ? (
            <span className="text-xs text-panel-muted">این ارجاع پس از تأیید گزارش بسته شده است.</span>
          ) : (
            <button
              onClick={() => void onSenderAction('remind')}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
            >
              ارسال یادآوری دریافت گزارش
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-panel-ink">ارجاعات من به مدیران</h1>
          <p className="mt-1 text-sm text-panel-muted">
            با ایجاد ارجاع، یک درخواست مشخص به یک یا چند مدیر ارسال می‌شود؛ سپس می‌توانید گزارش دریافتی هر
            مدیر را بررسی کنید.
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError(null);
            setCreateAttachments([]);
            setCreateOpen(true);
          }}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
        >
          ایجاد ارجاع جدید
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">{notice}</p>}

      {kpis && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {(
            [
              ['کل ارجاعات', kpis.total],
              ['در انتظار گزارش', kpis.awaitingReport],
              ['گزارش دریافت‌شده', kpis.reported],
              ['بسته‌شده', kpis.closed],
            ] as [string, number][]
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-panel-border bg-panel-surface p-4">
              <div className="text-[11px] text-panel-muted">{label}</div>
              <div className="font-num mt-1 text-lg font-black text-panel-ink">{faDigits(value)}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-panel-muted">در حال بارگذاری…</p>
      ) : (result?.referrals.length ?? 0) === 0 ? (
        <p className="py-10 text-center text-sm text-panel-muted">هنوز ارجاعی ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-panel-border bg-panel-surface">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-panel-border text-[10px] text-panel-muted">
                <th className="p-3 font-bold">موضوع ارجاع</th>
                <th className="p-3 font-bold">مدیر(ان) مقصد</th>
                <th className="p-3 font-bold">اولویت</th>
                <th className="p-3 font-bold">مهلت</th>
                <th className="p-3 font-bold">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {referralsPager.pageItems.map((r) => {
                const st = STATUS_META[r.status];
                return (
                  <tr
                    key={r.id}
                    onClick={() => void openDetail(r.id)}
                    className="cursor-pointer border-b border-panel-border/60 transition hover:bg-panel-surface-2/50"
                  >
                    <td className="p-3">
                      <div className="font-bold text-panel-ink">{r.title}</div>
                      <div className="font-num mt-0.5 text-[10px] text-panel-muted">
                        ایجاد: {formatJalaliDate(r.createdAt)}
                      </div>
                    </td>
                    <td className="p-3">{r.recipients.map((x) => x.recipient.fullName).join('، ')}</td>
                    <td className="p-3">{PRIORITY_META[r.priority]}</td>
                    <td className="font-num p-3">{r.dueAt ? formatJalaliDate(r.dueAt) : '—'}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (result?.referrals.length ?? 0) > 0 && (
        <Pagination
          page={referralsPager.page}
          totalPages={referralsPager.totalPages}
          onChange={referralsPager.setPage}
          variant="dark"
        />
      )}

      {createOpen && (
        <Modal title="ایجاد ارجاع جدید" onClose={() => setCreateOpen(false)}>
          <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="ref-title">
            موضوع ارجاع *
          </label>
          <input
            id="ref-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: درخواست گزارش فروش سه‌ماهه"
            className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />

          <div className="mb-1 mt-3 text-xs font-bold text-panel-ink">مدیر(ان) مقصد *</div>
          <div className="flex flex-wrap gap-1.5">
            {staff.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleRecipient(s.id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  recipients.includes(s.id) ? 'bg-accent text-white' : 'bg-panel-canvas text-panel-muted hover:bg-panel-surface-2'
                }`}
              >
                {s.fullName} — {s.roleLabelFa}
              </button>
            ))}
          </div>

          <label className="mb-1 mt-3 block text-xs font-bold text-panel-ink" htmlFor="ref-body">
            شرح درخواست *
          </label>
          <textarea
            id="ref-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="مشخص کنید چه گزارش یا اقدامی از مدیر(ان) انتظار دارید…"
            rows={3}
            className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="ref-priority">
                اولویت
              </label>
              <select
                id="ref-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ReferralPriority)}
                className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
              >
                <option value="HIGH">بالا</option>
                <option value="MEDIUM">متوسط</option>
                <option value="LOW">پایین</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="ref-due">
                مهلت دریافت گزارش
              </label>
              <input
                id="ref-due"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                placeholder="مثلاً ۱۴۰۵/۰۴/۲۵"
                className="font-num w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
              />
            </div>
          </div>

          <label className="mb-1 mt-3 block text-xs font-bold text-panel-ink">بارگذاری مستندات (PDF یا تصویر)</label>
          <AttachmentPicker value={createAttachments} onChange={setCreateAttachments} />

          {createError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {createError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="rounded-lg bg-panel-canvas px-4 py-2 text-xs font-bold text-panel-muted">
              انصراف
            </button>
            <button
              onClick={() => void onCreate()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
            >
              ارسال ارجاع
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
