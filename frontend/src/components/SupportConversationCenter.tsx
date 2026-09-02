import { useEffect, useMemo, useState } from 'react';
import { formatLocaleDateTime } from '../lib/locale-format';
import type { StoredLocale } from '../hooks/useLocale';
import type { ReferralAttachment } from '../types/cartable';
import type {
  MySupportTicketRow,
  SupportTicketStatus,
} from '../types/support-tickets';
import AttachmentPicker from './AttachmentPicker';
import AttachmentList from './AttachmentList';

const STATUS_ORDER: SupportTicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
];

const COPY = {
  fa: {
    title: 'تیکت‌های من',
    newTicket: 'تیکت جدید',
    open: 'تیکت‌های باز',
    inProgress: 'در حال بررسی',
    answered: 'پاسخ داده شده',
    closed: 'بسته شده',
    view: 'مشاهده',
    subject: 'عنوان',
    id: 'شناسه',
    status: 'وضعیت',
    operation: 'عملیات',
    empty: 'هنوز پیامی ثبت نشده است.',
    reply: 'پاسخ جدید',
    replyPlaceholder: 'پیام خود را بنویسید…',
    send: 'ارسال پیام',
    closedNotice: 'این گفتگو بسته شده است.',
    satisfied: 'از پاسخ راضی بودم',
    dissatisfied: 'از پاسخ راضی نیستم',
    attach: 'پیوست‌ها',
    search: 'جستجو با شماره تیکت یا موضوع…',
    noResults: 'تیکتی با این شماره یا موضوع پیدا نشد.',
  },
  en: {
    title: 'My tickets',
    newTicket: 'New ticket',
    open: 'Open',
    inProgress: 'In progress',
    answered: 'Answered',
    closed: 'Closed',
    view: 'View',
    subject: 'Subject',
    id: 'ID',
    status: 'Status',
    operation: 'Action',
    empty: 'No support messages yet.',
    reply: 'New reply',
    replyPlaceholder: 'Write your message…',
    send: 'Send message',
    closedNotice: 'This conversation is closed.',
    satisfied: 'I am satisfied',
    dissatisfied: 'I am not satisfied',
    attach: 'Attachments',
    search: 'Search by ticket number or subject…',
    noResults: 'No ticket matches this number or subject.',
  },
  ar: {
    title: 'تذاكري',
    newTicket: 'تذكرة جديدة',
    open: 'مفتوحة',
    inProgress: 'قيد المراجعة',
    answered: 'تم الرد',
    closed: 'مغلقة',
    view: 'عرض',
    subject: 'العنوان',
    id: 'المعرّف',
    status: 'الحالة',
    operation: 'الإجراء',
    empty: 'لا توجد رسائل دعم بعد.',
    reply: 'رد جديد',
    replyPlaceholder: 'اكتب رسالتك…',
    send: 'إرسال الرسالة',
    closedNotice: 'هذه المحادثة مغلقة.',
    satisfied: 'أنا راضٍ عن الإجابة',
    dissatisfied: 'لست راضياً عن الإجابة',
    attach: 'المرفقات',
    search: 'ابحث برقم التذكرة أو الموضوع…',
    noResults: 'لم يتم العثور على تذكرة مطابقة.',
  },
} as const;

const STATUS_ICON: Record<SupportTicketStatus, string> = {
  OPEN: '✉',
  IN_PROGRESS: '◷',
  ANSWERED: '✓',
  CLOSED: '▰',
};

export default function SupportConversationCenter({
  theme = 'dark',
  title,
  locale,
  tickets,
  selectedId,
  onSelect,
  onReply,
  onFeedback,
  onNew,
  newLabel,
  busy = false,
}: {
  theme?: 'light' | 'dark';
  title?: string;
  locale: StoredLocale;
  tickets: MySupportTicketRow[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReply: (id: string, body: string, attachmentIds: string[]) => Promise<void>;
  onFeedback?: (id: string, satisfied: boolean) => Promise<void>;
  onNew: () => void;
  newLabel?: string;
  busy?: boolean;
}) {
  const light = theme === 'light';
  const t = COPY[locale];
  const [reply, setReply] = useState('');
  const [attachments, setAttachments] = useState<ReferralAttachment[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(1);
  const visibleTickets = useMemo(() => {
    const normalized = query.trim().replace(/^#/, '').toLocaleLowerCase();
    return (tickets ?? []).filter((ticket) => {
      if (statusFilter && ticket.status !== statusFilter) return false;
      if (!normalized) return true;
      return `${ticket.trackingCode} ${ticket.subject}`
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [query, statusFilter, tickets]);
  const active = visibleTickets.find((ticket) => ticket.id === selectedId) ?? null;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleTickets.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedTickets = visibleTickets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((status) => [
          status,
          tickets?.filter((ticket) => ticket.status === status).length ?? 0,
        ]),
      ) as Record<SupportTicketStatus, number>,
    [tickets],
  );

  useEffect(() => {
    setReply('');
    setAttachments([]);
    setSendError(null);
  }, [active?.id]);

  const labels: Record<SupportTicketStatus, string> = {
    OPEN: t.open,
    IN_PROGRESS: t.inProgress,
    ANSWERED: t.answered,
    CLOSED: t.closed,
  };

  async function sendReply() {
    if (!active || reply.trim().length < 2 || busy) return;
    setSendError(null);
    try {
      await onReply(active.id, reply.trim(), attachments.map((file) => file.id));
      setReply('');
      setAttachments([]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'خطا در ارسال پیام.');
    }
  }

  const replyComposer = active && active.status !== 'CLOSED' ? (
    <div className={`border-t pt-4 ${light ? 'border-[#e6edf4]' : 'border-[#1d2738]'}`}>
      <label className="sr-only" htmlFor={`support-reply-${active.id}`}>{t.reply}</label>
      <textarea id={`support-reply-${active.id}`} aria-label={t.reply} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t.replyPlaceholder} rows={3} className={`w-full resize-none rounded-xl border p-3 text-xs leading-6 outline-none focus:border-[#4f82e8] ${light ? 'border-[#cedbe8] bg-[#fbfdff] text-[#102a43] placeholder:text-[#8797a8]' : 'border-[#1c293b] bg-[#07111a] text-white placeholder:text-[#66758a]'}`} />
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <AttachmentPicker value={attachments} onChange={(files) => setAttachments(files.slice(-1))} disabled={busy} />
        <button type="button" disabled={busy || reply.trim().length < 2} onClick={() => void sendReply()} className="h-11 rounded-xl bg-[#4f82e8] px-5 text-xs font-black text-white disabled:opacity-50">{t.send}</button>
      </div>
      {sendError && <p role="alert" className="mt-2 text-xs text-[#d44f61]">{sendError}</p>}
    </div>
  ) : null;

  return (
    <section
      data-testid="support-conversation-center"
      data-theme={theme}
      className={`overflow-hidden rounded-[22px] border shadow-[0_16px_44px_rgba(15,35,55,.08)] ${light ? 'border-[#dce6f0] bg-white text-[#334e68]' : 'border-[#202a3c] bg-[#0b111d] text-[#dce5f2]'}`}
      dir={locale === 'en' ? 'ltr' : 'rtl'}
    >
      <header className={`flex min-h-16 items-center justify-between gap-3 border-b px-5 py-3 sm:px-7 ${light ? 'border-[#e7edf4]' : 'border-[#1d2738]'}`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSearchOpen((value) => !value)} aria-label={t.search} className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${light ? 'text-[#52677d] hover:bg-[#edf4fb]' : 'text-[#a8b4c6] hover:bg-[#152033]'}`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          </button>
          <button type="button" onClick={() => { setStatusFilter(null); setPage(1); }} aria-label={locale === 'fa' ? 'حذف فیلتر' : 'Clear filter'} className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${statusFilter ? 'bg-[#eaf3ff] text-[#1668c4]' : light ? 'text-[#52677d] hover:bg-[#edf4fb]' : 'text-[#a8b4c6] hover:bg-[#152033]'}`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" /></svg>
          </button>
        </div>
        <h2 className={`m-0 text-base font-black ${light ? 'text-[#102a43]' : 'text-white'}`}>{title ?? t.title}</h2>
        <button type="button" onClick={onNew} className="rounded-xl bg-[#4f82e8] px-3.5 py-2 text-[11px] font-black text-white shadow-[0_7px_16px_rgba(79,130,232,.2)]">＋ {newLabel ?? t.newTicket}</button>
      </header>

      {searchOpen && (
        <div className={`border-b px-5 py-3 sm:px-7 ${light ? 'border-[#e7edf4] bg-[#f8fbfe]' : 'border-[#1d2738] bg-[#0e1624]'}`}>
          <input type="search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.search} className={`h-11 w-full rounded-xl border px-4 text-xs outline-none focus:border-[#4f82e8] ${light ? 'border-[#cedbe8] bg-white text-[#102a43] placeholder:text-[#8797a8]' : 'border-[#27344a] bg-[#101827] text-white placeholder:text-[#66758a]'}`} />
        </div>
      )}

      {active ? (
        <article className="p-5 sm:p-7" data-testid="support-ticket-detail">
          <header className={`flex flex-wrap items-start justify-between gap-3 border-b pb-4 ${light ? 'border-[#e6edf4]' : 'border-[#1d2738]'}`}>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => onSelect('')} className={`flex h-9 w-9 items-center justify-center rounded-xl ${light ? 'bg-[#eef4fa] text-[#52677d]' : 'bg-[#152033] text-[#a8b4c6]'}`} aria-label={locale === 'fa' ? 'بازگشت به فهرست تیکت‌ها' : 'Back to tickets'}>→</button>
              <div><h3 className={`m-0 text-sm font-black ${light ? 'text-[#102a43]' : 'text-white'}`}>{active.subject}</h3><p dir="ltr" className={`font-num mt-1 text-[10px] ${light ? 'text-[#71859a]' : 'text-[#79879c]'}`}>#{active.trackingCode}</p></div>
            </div>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${light ? 'bg-[#e5f6ef] text-[#14805e]' : 'bg-[#123027] text-[#64d7ad]'}`}>{labels[active.status]}</span>
          </header>
          <div className="flex min-h-[300px] max-h-[520px] flex-col gap-4 overflow-y-auto py-6">
            {(active.conversation?.length ? active.conversation : [{ id: 'initial', body: active.body, senderType: 'REQUESTER' as const, senderLabel: '', createdAt: active.createdAt, attachments: active.attachments ?? [] }]).map((message) => (
              <div key={message.id} className={`max-w-[88%] rounded-2xl border px-4 py-3 ${message.senderType === 'STAFF' ? light ? 'self-start border-[#d8e2ec] bg-[#f1f5f9]' : 'self-start border-[#364052] bg-[#29313f]' : light ? 'self-end border-[#b9d3f3] bg-[#eaf3ff]' : 'self-end border-[#274b84] bg-[#142743]'}`}>
                {message.senderLabel && <div className={`mb-2 text-[10px] font-black ${light ? 'text-[#2563b9]' : 'text-[#75a8ff]'}`}>{message.senderLabel}</div>}
                <p className={`m-0 whitespace-pre-wrap text-xs leading-7 ${light ? 'text-[#29445e]' : 'text-[#d7dfeb]'}`}>{message.body}</p>
                {message.attachments.length > 0 && <div aria-label={t.attach}><AttachmentList attachments={message.attachments} /></div>}
                <time className={`font-num mt-2 block text-[9px] ${light ? 'text-[#71859a]' : 'text-[#738196]'}`}>{formatLocaleDateTime(message.createdAt, locale)}</time>
              </div>
            ))}
          </div>
          {active.status === 'CLOSED' ? (
            <p className={`rounded-xl px-4 py-3 text-center text-xs font-bold ${light ? 'bg-[#fff1f2] text-[#c84d5e]' : 'bg-[#26171b] text-[#f08b98]'}`}>{t.closedNotice}</p>
          ) : (
            <>
              {active.status === 'ANSWERED' && onFeedback && <div className="mb-4 grid gap-3 sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => void onFeedback(active.id, true)} className="h-11 rounded-xl bg-[#16845f] px-5 text-xs font-black text-white disabled:opacity-50">{t.satisfied}</button><button type="button" disabled={busy} onClick={() => void onFeedback(active.id, false)} className={`h-11 rounded-xl border px-5 text-xs font-black disabled:opacity-50 ${light ? 'border-[#e9a2aa] text-[#bb3e4d]' : 'border-[#7a3540] text-[#f08b98]'}`}>{t.dissatisfied}</button></div>}
              {replyComposer}
            </>
          )}
        </article>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-2 border-b px-4 py-5 sm:grid-cols-4 sm:gap-4 sm:px-8 ${light ? 'border-[#e7edf4] bg-[#fbfdff]' : 'border-[#1d2738]'}`}>
            {STATUS_ORDER.map((status) => <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => { setStatusFilter((current) => current === status ? null : status); setPage(1); }} data-testid={`support-status-${status}`} className={`group rounded-2xl px-2 py-3 text-center transition focus:outline-none ${statusFilter === status ? light ? 'bg-[#eaf3ff] text-[#1668c4]' : 'bg-[#13233d] text-[#69a0ff]' : light ? 'text-[#52677d] hover:bg-[#f0f5fa]' : 'text-[#c5cedd] hover:bg-[#101827]'}`}><div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${statusFilter === status ? 'bg-[#4f82e8] text-white' : light ? 'bg-[#edf2f7] text-[#52677d]' : 'bg-[#151e2d] text-[#c5cedd]'}`} aria-hidden="true">{STATUS_ICON[status]}</div><div className="mt-2 text-[11px] font-black">{labels[status]}</div><div className={`font-num mt-1 text-[9px] ${light ? 'text-[#71859a]' : 'text-[#8290a6]'}`}>{counts[status].toLocaleString(locale)}</div></button>)}
          </div>
          {!tickets ? <div className={`p-10 text-center text-xs ${light ? 'text-[#71859a]' : 'text-[#8290a6]'}`}>…</div> : tickets.length === 0 ? <div className={`p-14 text-center text-sm ${light ? 'text-[#71859a]' : 'text-[#8290a6]'}`}>{t.empty}</div> : <div>
            <div className={`grid grid-cols-[minmax(0,1fr)_90px_96px] gap-2 border-b px-4 py-3 text-[10px] font-bold sm:grid-cols-[minmax(0,1fr)_150px_120px_100px] sm:px-7 ${light ? 'border-[#e7edf4] bg-[#f8fafc] text-[#687b8f]' : 'border-[#1d2738] text-[#7f8ba0]'}`}><span className="text-start">{t.subject}</span><span data-testid="support-ticket-id-header" className="text-center">{t.id}</span><span className="text-center">{t.status}</span><span className="hidden text-center sm:block">{t.operation}</span></div>
            <div>{pagedTickets.map((ticket) => <button key={ticket.id} data-testid="account-ticket" type="button" onClick={() => onSelect(ticket.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_90px_96px] items-center gap-2 border-b px-4 py-4 text-start text-[11px] transition sm:grid-cols-[minmax(0,1fr)_150px_120px_100px] sm:px-7 ${light ? 'border-[#e7edf4] bg-white hover:bg-[#f7fafc]' : 'border-[#1d2738] hover:bg-[#101827]'}`}><span className={`truncate font-black ${light ? 'text-[#17324d]' : 'text-[#dce5f2]'}`}>{ticket.subject}</span><span data-testid="support-ticket-id" dir="ltr" className={`font-num block w-full truncate text-center ${light ? 'text-[#61788f]' : 'text-[#8f9cb0]'}`}>#{ticket.trackingCode}</span><span className={`w-fit justify-self-center rounded-full px-2 py-1 text-[9px] font-bold ${ticket.status === 'IN_PROGRESS' ? 'bg-[#fff4d8] text-[#a76a00]' : ticket.status === 'CLOSED' ? 'bg-[#edf1f5] text-[#65778a]' : 'bg-[#e5f6ef] text-[#14805e]'}`}>{labels[ticket.status]}</span><span className={`hidden justify-self-center rounded-lg px-2 py-1.5 text-center text-[10px] font-bold sm:block ${light ? 'bg-[#eaf3ff] text-[#2563b9]' : 'bg-[#152136] text-[#6da2ff]'}`}>← {t.view}</span></button>)}{visibleTickets.length === 0 && <p className={`px-5 py-10 text-center text-xs ${light ? 'text-[#71859a]' : 'text-[#8290a6]'}`}>{t.noResults}</p>}</div>
            {visibleTickets.length > 0 && <footer className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[10px] sm:px-7 ${light ? 'bg-[#fbfdff] text-[#71859a]' : 'bg-[#0e1624] text-[#8290a6]'}`}><span>{Math.min(currentPage * pageSize, visibleTickets.length).toLocaleString(locale)} / {visibleTickets.length.toLocaleString(locale)}</span><div className="flex items-center gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-35 ${light ? 'bg-[#edf2f7] text-[#52677d]' : 'bg-[#151e2d] text-[#c5cedd]'}`}>›</button><span className="font-num px-2">{currentPage.toLocaleString(locale)}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-35 ${light ? 'bg-[#edf2f7] text-[#52677d]' : 'bg-[#151e2d] text-[#c5cedd]'}`}>‹</button></div></footer>}
          </div>}
        </>
      )}
    </section>
  );
}
