import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAgencyBulletin,
  fetchAgencyBulletinHistory,
  fetchAgencyBulletinRecipients,
} from '../../api/agency-bulletins';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type {
  AgencyBulletinDispatch,
  AgencyBulletinKind,
  AgencyBulletinRecipient,
} from '../../types/agency-bulletins';

type AudienceUi = 'ALL' | 'ONE' | 'MULTIPLE';

const KIND_META: Record<AgencyBulletinKind, { label: string; className: string }> = {
  NOTICE: { label: 'اطلاعیه', className: 'bg-blue-400/15 text-blue-300' },
  AMENDMENT: { label: 'اصلاحیه', className: 'bg-amber-400/15 text-amber-300' },
};

export default function SiteAdminAgencyBulletinsPage() {
  const [recipients, setRecipients] = useState<AgencyBulletinRecipient[]>([]);
  const [history, setHistory] = useState<AgencyBulletinDispatch[]>([]);
  const [kind, setKind] = useState<AgencyBulletinKind>('NOTICE');
  const [audience, setAudience] = useState<AudienceUi>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [recipientRows, historyRows] = await Promise.all([
        fetchAgencyBulletinRecipients(),
        fetchAgencyBulletinHistory(),
      ]);
      setRecipients(recipientRows);
      setHistory(historyRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در دریافت اطلاعات اطلاعیه‌ها.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRecipients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return recipients;
    return recipients.filter((agency) =>
      [agency.fullName, agency.managerName, agency.city]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, recipients]);

  const historyPager = usePagination(history);
  const recipientCount = audience === 'ALL' ? recipients.length : selectedIds.length;
  const canSubmit = title.trim().length >= 3 && body.trim().length >= 3 && recipientCount > 0;

  function changeAudience(next: AudienceUi) {
    setAudience(next);
    setSelectedIds([]);
  }

  function toggleRecipient(id: string) {
    if (audience === 'ONE') {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function submit() {
    if (!canSubmit || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createAgencyBulletin({
        kind,
        title: title.trim(),
        body: body.trim(),
        audienceMode: audience === 'ALL' ? 'ALL' : 'SELECTED',
        recipientIds: audience === 'ALL' ? undefined : selectedIds,
      });
      setHistory((current) => [created, ...current]);
      setTitle('');
      setBody('');
      setSelectedIds([]);
      setNotice(`پیام برای ${faDigits(created.recipientCount)} آژانس ارسال شد ✓`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ارسال اطلاعیه انجام نشد.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5 px-[21px] pb-[34px] pt-[18px]" dir="rtl">
      <header>
        <h1 className="m-0 text-[20.5px] font-black text-white">اصلاحیه و اطلاعیه آژانس‌ها</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          ارسال مستقیم پیام ادمین سایت به همه آژانس‌ها یا گیرندگان انتخابی
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-400/10 p-3 text-xs text-rose-300">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-500/30 bg-emerald-400/10 p-3 text-xs text-emerald-300">{notice}</p>}

      <section className="overflow-hidden rounded-[16px] border border-[#24304a] bg-[#141d2e]">
        <div className="border-b border-[#24304a] px-5 py-4">
          <h2 className="m-0 text-sm font-black text-white">ایجاد پیام جدید</h2>
          <p className="mb-0 mt-1 text-[10.5px] text-[#7f90aa]">پیام پس از ثبت، فقط در حساب آژانس‌های انتخاب‌شده نمایش داده می‌شود.</p>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <span className="mb-2 block text-[11px] font-bold text-[#9fb0c7]">نوع پیام</span>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#0e1625] p-1">
                {(['NOTICE', 'AMENDMENT'] as AgencyBulletinKind[]).map((value) => (
                  <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${kind === value ? 'bg-[#3b82f6] text-white' : 'text-[#8fa1bb] hover:text-white'}`}>
                    {KIND_META[value].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-2 block text-[11px] font-bold text-[#9fb0c7]">مخاطب</span>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#0e1625] p-1">
                {([
                  ['ALL', 'همه آژانس‌ها'],
                  ['ONE', 'یک آژانس'],
                  ['MULTIPLE', 'چند آژانس'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => changeAudience(value)} className={`rounded-lg px-2 py-2.5 text-[11px] font-black transition ${audience === value ? 'bg-[#3b82f6] text-white' : 'text-[#8fa1bb] hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="block text-[11px] font-bold text-[#9fb0c7]">
            عنوان پیام
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="عنوان اطلاعیه یا اصلاحیه…" className="mt-2 h-11 w-full rounded-xl border border-[#2b3850] bg-[#0e1625] px-4 text-xs text-white outline-none placeholder:text-[#63738b] focus:border-blue-400" />
          </label>
          <label className="block text-[11px] font-bold text-[#9fb0c7]">
            متن کامل
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={8000} rows={6} placeholder="متن پیام را کامل بنویسید…" className="mt-2 w-full resize-y rounded-xl border border-[#2b3850] bg-[#0e1625] p-4 text-xs leading-7 text-white outline-none placeholder:text-[#63738b] focus:border-blue-400" />
          </label>

          {audience !== 'ALL' && (
            <div className="rounded-xl border border-[#27344c] bg-[#0e1625] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی نام آژانس، مدیر یا شهر…" className="h-10 min-w-[240px] flex-1 rounded-lg border border-[#2b3850] bg-[#141d2e] px-3 text-xs text-white outline-none placeholder:text-[#63738b]" />
                <span className="rounded-full bg-blue-400/15 px-3 py-1.5 text-[10px] font-bold text-blue-300">{faDigits(selectedIds.length)} انتخاب</span>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pl-1">
                {filteredRecipients.map((agency) => {
                  const selected = selectedIds.includes(agency.id);
                  return (
                    <button key={agency.id} type="button" onClick={() => toggleRecipient(agency.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition ${selected ? 'border-blue-400 bg-blue-400/10' : 'border-[#253149] bg-[#141d2e] hover:border-[#3a4a68]'}`}>
                      <span>
                        <span className="block text-xs font-black text-white">{agency.fullName}</span>
                        <span className="mt-1 block text-[10px] text-[#75869f]">{agency.managerName} · {agency.city}</span>
                      </span>
                      <span className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${selected ? 'border-blue-400 bg-blue-500 text-white' : 'border-[#3a4963] text-transparent'}`}>✓</span>
                    </button>
                  );
                })}
                {!loading && filteredRecipients.length === 0 && <p className="py-5 text-center text-xs text-[#6b7b94]">آژانس فعالی یافت نشد.</p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#24304a] pt-4">
            <p className="m-0 text-[11px] text-[#7f90aa]">تعداد گیرندگان: <strong className="text-blue-300">{faDigits(recipientCount)} آژانس</strong></p>
            <button type="button" disabled={!canSubmit || sending} onClick={() => void submit()} className="rounded-xl bg-[#3b82f6] px-6 py-3 text-xs font-black text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40">
              {sending ? 'در حال ارسال…' : 'ارسال پیام'}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[16px] border border-[#24304a] bg-[#141d2e]">
        <div className="border-b border-[#24304a] px-5 py-4">
          <h2 className="m-0 text-sm font-black text-white">تاریخچه ارسال</h2>
        </div>
        {loading ? (
          <p className="py-10 text-center text-xs text-[#6b7b94]">در حال بارگذاری…</p>
        ) : history.length === 0 ? (
          <p className="py-10 text-center text-xs text-[#6b7b94]">هنوز اطلاعیه‌ای ارسال نشده است.</p>
        ) : (
          <div>
            {historyPager.pageItems.map((item) => (
              <article key={item.id} className="grid gap-3 border-b border-[#202b40] px-5 py-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                <span className={`w-fit rounded-full px-3 py-1 text-[10px] font-black ${KIND_META[item.kind].className}`}>{KIND_META[item.kind].label}</span>
                <div className="min-w-0">
                  <h3 className="m-0 truncate text-xs font-black text-white">{item.title}</h3>
                  <p className="mb-0 mt-1 line-clamp-2 text-[10.5px] leading-5 text-[#7f90aa]">{item.body}</p>
                </div>
                <div className="text-[10px] text-[#7f90aa] md:text-left">
                  <div>{faDigits(item.recipientCount)} گیرنده{item.readCount != null ? ` · ${faDigits(item.readCount)} خوانده‌شده` : ''}</div>
                  <time className="mt-1 block">{formatJalaliDateTime(item.createdAt)}</time>
                </div>
              </article>
            ))}
            <div className="px-5 pb-4"><Pagination page={historyPager.page} totalPages={historyPager.totalPages} onChange={historyPager.setPage} variant="dark" /></div>
          </div>
        )}
      </section>
    </div>
  );
}
