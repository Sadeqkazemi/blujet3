import { useEffect, useState, type FormEvent } from 'react';
import { fetchInbox, postInboxMessage } from '../../api/agency-portal';
import {
  fetchMySupportTickets,
  replyMySupportTicket,
  submitMySupportTicketFeedback,
  submitMySupportTicket,
} from '../../api/support-tickets';
import { formatLocaleDateTime } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { AgencyMessage } from '../../types/agency-portal';
import type { MySupportTicketRow } from '../../types/support-tickets';
import Modal from '../../components/Modal';
import AttachmentPicker from '../../components/AttachmentPicker';
import AttachmentList from '../../components/AttachmentList';
import type { ReferralAttachment } from '../../types/cartable';
import SupportConversationCenter from '../../components/SupportConversationCenter';

function messageParts(message: AgencyMessage) {
  const lines = message.body.split(/\r?\n/);
  const subjectLine = lines.find((line) => /^(موضوع|Subject|الموضوع):/i.test(line.trim()));
  const subject = subjectLine?.replace(/^[^:]+:\s*/, '').trim() || '';
  const body = lines
    .filter((line) => !/^(گیرنده|Recipient|المستلم|موضوع|Subject|الموضوع):/i.test(line.trim()))
    .join('\n')
    .trim() || message.body;
  return { subject, body };
}

// کارتابل و پیام‌ها — most strings reuse
// design-reference-v2/پنل آژانس.dc.html's own isEN vocabulary
// (inboxTitle, replyPlaceholder, sendReplyLabel, noMessagesLabel); AR has
// no counterpart there and is hand-translated.
const STR: Record<StoredLocale, {
  heading: string;
  subtitle: string;
  errorFallback: string;
  sendErrorFallback: string;
  loading: string;
  empty: string;
  youLabel: string;
  placeholder: string;
  sendBtn: string;
  newMessage: string;
  recipient: string;
  subject: string;
  subjectPlaceholder: string;
  validation: string;
  cancel: string;
  requesterName: string;
  requesterPhone: string;
  phonePlaceholder: string;
  ticketValidation: string;
  ticketSuccess: string;
  ticketsHeading: string;
  ticketsEmpty: string;
  ticketsLoadError: string;
}> = {
  fa: {
    heading: 'کارتابل و پیام‌ها',
    subtitle: 'مکاتبه مستقیم با واحد بازرگانی blujet',
    errorFallback: 'خطا در دریافت پیام‌ها.',
    sendErrorFallback: 'خطا در ارسال پیام.',
    loading: 'در حال بارگذاری…',
    empty: 'پیامی ثبت نشده است.',
    youLabel: 'شما',
    placeholder: 'پیام خود را بنویسید…',
    sendBtn: 'ارسال',
    newMessage: 'پیام جدید', recipient: 'گیرنده', subject: 'موضوع',
    subjectPlaceholder: 'موضوع پیام', validation: 'لطفاً گیرنده، موضوع و متن پیام را کامل کنید.', cancel: 'انصراف',
    requesterName: 'نام درخواست‌کننده', requesterPhone: 'شماره تماس', phonePlaceholder: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷',
    ticketValidation: 'نام، شماره تماس معتبر، موضوع و متن پیام را کامل کنید.', ticketSuccess: 'پیام شما ثبت شد. کد پیگیری:',
    ticketsHeading: 'پیام‌های ارسالی', ticketsEmpty: 'پیامی برای پشتیبانی ثبت نشده است.', ticketsLoadError: 'خطا در دریافت پیام‌های پشتیبانی.',
  },
  en: {
    heading: 'Inbox & Messages',
    subtitle: "Direct correspondence with blujet's commercial team",
    errorFallback: 'Error loading messages.',
    sendErrorFallback: 'Error sending the message.',
    loading: 'Loading…',
    empty: 'No messages yet.',
    youLabel: 'You',
    placeholder: 'Write your message…',
    sendBtn: 'Send',
    newMessage: 'New message', recipient: 'Recipient', subject: 'Subject',
    subjectPlaceholder: 'Message subject', validation: 'Complete the recipient, subject and message.', cancel: 'Cancel',
    requesterName: 'Requester name', requesterPhone: 'Phone number', phonePlaceholder: 'e.g. +989121234567',
    ticketValidation: 'Enter a name, valid phone number, subject, and message.', ticketSuccess: 'Your message was submitted. Tracking code:',
    ticketsHeading: 'Sent messages', ticketsEmpty: 'No support messages yet.', ticketsLoadError: 'Error loading support messages.',
  },
  ar: {
    heading: 'الوارد والرسائل',
    subtitle: 'تواصل مباشر مع فريق blujet التجاري',
    errorFallback: 'خطأ في تحميل الرسائل.',
    sendErrorFallback: 'خطأ في إرسال الرسالة.',
    loading: 'جارٍ التحميل…',
    empty: 'لا توجد رسائل بعد.',
    youLabel: 'أنت',
    placeholder: 'اكتب رسالتك…',
    sendBtn: 'إرسال',
    newMessage: 'رسالة جديدة', recipient: 'المستلم', subject: 'الموضوع',
    subjectPlaceholder: 'موضوع الرسالة', validation: 'أكمل المستلم والموضوع ونص الرسالة.', cancel: 'إلغاء',
    requesterName: 'اسم مقدم الطلب', requesterPhone: 'رقم الهاتف', phonePlaceholder: 'مثال: ٠٩١٢١٢٣٤٥٦٧',
    ticketValidation: 'أدخل الاسم ورقم هاتف صحيحاً والموضوع ونص الرسالة.', ticketSuccess: 'تم تسجيل رسالتك. رمز المتابعة:',
    ticketsHeading: 'الرسائل المرسلة', ticketsEmpty: 'لا توجد رسائل دعم بعد.', ticketsLoadError: 'خطأ في تحميل رسائل الدعم.',
  },
};

export default function AgencyInboxPage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [messages, setMessages] = useState<AgencyMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [subject, setSubject] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MySupportTicketRow[] | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [ticketNotice, setTicketNotice] = useState<string | null>(null);
  const [ticketAttachments, setTicketAttachments] = useState<ReferralAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<ReferralAttachment[]>([]);
  const [activeSection, setActiveSection] = useState<'support' | 'commercial'>('support');

  function reload() {
    fetchInbox()
      .then((rows) => {
        setMessages(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => setError(t.errorFallback));
  }

  function reloadTickets() {
    fetchMySupportTickets()
      .then((rows) => {
        setTickets(rows);
        setTicketsError(null);
      })
      .catch(() => {
        setTickets([]);
        setTicketsError(t.ticketsLoadError);
      });
  }

  useEffect(() => {
    fetchInbox()
      .then((rows) => {
        setMessages(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => setError(t.errorFallback));
    fetchMySupportTickets()
      .then((rows) => {
        setTickets(rows);
        setTicketsError(null);
      })
      .catch(() => {
        setTickets([]);
        setTicketsError(t.ticketsLoadError);
      });
  }, [t.errorFallback, t.ticketsLoadError]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (
      requesterName.trim().length < 2 ||
      requesterPhone.trim().length < 8 ||
      body.trim().length < 2 ||
      subject.trim().length < 2
    ) {
      setValidationError(t.ticketValidation);
      return;
    }
    setSending(true);
    setValidationError(null);
    setTicketNotice(null);
    try {
      const created = await submitMySupportTicket({
        requesterName: requesterName.trim(),
        requesterPhone: requesterPhone.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachmentIds: ticketAttachments.map((file) => file.id),
      });
      setBody('');
      setSubject('');
      setRequesterName('');
      setRequesterPhone('');
      setTicketAttachments([]);
      setComposeOpen(false);
      setTicketNotice(`${t.ticketSuccess} ${created.trackingCode}`);
      reloadTickets();
    } catch {
      setValidationError(t.sendErrorFallback);
    } finally {
      setSending(false);
    }
  }

  async function onReply(replySubject: string) {
    if (!replyBody.trim()) return;
    setSending(true);
    setValidationError(null);
    try {
      await postInboxMessage(
        `${t.subject}: ${replySubject}\n\n${replyBody.trim()}`,
        replyAttachments.map((file) => file.id),
      );
      setReplyBody('');
      setReplyAttachments([]);
      reload();
    } catch {
      setError(t.sendErrorFallback);
    } finally {
      setSending(false);
    }
  }

  async function onTicketReply(id: string, reply: string, attachmentIds: string[]) {
    setSending(true);
    try {
      const updated = await replyMySupportTicket(id, {
        body: reply,
        attachmentIds: attachmentIds.length ? attachmentIds : undefined,
      });
      setTickets((current) =>
        current?.map((ticket) => (ticket.id === id ? updated : ticket)) ?? [updated],
      );
      setTicketNotice(locale === 'fa' ? 'پیام شما ارسال شد ✓' : locale === 'ar' ? 'تم إرسال رسالتك ✓' : 'Your message was sent ✓');
    } finally {
      setSending(false);
    }
  }

  async function onTicketFeedback(id: string, satisfied: boolean) {
    setSending(true);
    try {
      const updated = await submitMySupportTicketFeedback(id, satisfied);
      setTickets((current) => current?.map((ticket) => ticket.id === id ? updated : ticket) ?? [updated]);
      setTicketNotice(satisfied
        ? locale === 'fa' ? 'رضایت شما ثبت و تیکت بسته شد؛ شماره پیگیری همچنان قابل جستجو است.' : locale === 'ar' ? 'تم تسجيل رضاك وإغلاق التذكرة، ويبقى رقم التتبع قابلاً للبحث.' : 'Your feedback was recorded and the ticket was closed; its tracking number remains searchable.'
        : locale === 'fa' ? 'نارضایتی شما ثبت شد و تیکت برای پیگیری مجدد باز شد.' : locale === 'ar' ? 'تم تسجيل عدم رضاك وأعيد فتح التذكرة للمتابعة.' : 'Your feedback was recorded and the ticket was reopened for follow-up.');
    } finally {
      setSending(false);
    }
  }

  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!messages) return <p className="p-8 text-sm text-muted">{t.loading}</p>;

  const selected = messages.find((message) => message.id === selectedId) ?? messages[0] ?? null;
  const fallbackSubject = locale === 'fa' ? 'پیام مدیریت' : locale === 'ar' ? 'رسالة الإدارة' : 'Management message';
  const replyPlaceholder = locale === 'fa' ? 'پاسخ خود را بنویسید…' : locale === 'ar' ? 'اكتب ردك…' : 'Write your reply…';
  const pageCopy = locale === 'fa'
    ? {
        title: 'مرکز پیام آژانس',
        description: 'تیکت‌های پشتیبانی و مکاتبات با واحد بازرگانی را از یک محل پیگیری کنید.',
        support: 'تیکت‌های پشتیبانی',
        supportHint: 'ثبت درخواست، پیگیری پاسخ و مشاهده تاریخچه',
        commercial: 'مکاتبات بازرگانی',
        commercialHint: 'پیام‌های مستقیم میان آژانس و واحد بازرگانی',
        supportTitle: 'تیکت‌های من',
        commercialTitle: 'صندوق مکاتبات بازرگانی',
        conversation: 'گفتگو با واحد بازرگانی',
        messageCount: 'پیام',
        ticketCount: 'تیکت',
      }
    : locale === 'ar'
      ? {
          title: 'مركز رسائل الوكالة',
          description: 'تابع تذاكر الدعم والمراسلات التجارية من مكان واحد.',
          support: 'تذاكر الدعم',
          supportHint: 'إنشاء الطلب ومتابعة الرد وسجل المحادثة',
          commercial: 'المراسلات التجارية',
          commercialHint: 'رسائل مباشرة بين الوكالة والفريق التجاري',
          supportTitle: 'تذاكري',
          commercialTitle: 'صندوق المراسلات التجارية',
          conversation: 'محادثة مع الفريق التجاري',
          messageCount: 'رسالة',
          ticketCount: 'تذكرة',
        }
      : {
          title: 'Agency message center',
          description: 'Track support tickets and commercial correspondence in one place.',
          support: 'Support tickets',
          supportHint: 'Create requests, follow replies, and review history',
          commercial: 'Commercial messages',
          commercialHint: 'Direct messages between your agency and the commercial team',
          supportTitle: 'My tickets',
          commercialTitle: 'Commercial correspondence inbox',
          conversation: 'Conversation with the commercial team',
          messageCount: 'messages',
          ticketCount: 'tickets',
        };

  return (
    <div data-testid="agency-inbox-page" dir={locale === 'en' ? 'ltr' : 'rtl'} className="space-y-5">
      <nav className="grid gap-2 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_8px_24px_rgba(15,35,55,.05)] sm:grid-cols-2" aria-label={pageCopy.title}>
          {([
            { key: 'support' as const, title: pageCopy.support, hint: pageCopy.supportHint, count: tickets?.length ?? 0 },
            { key: 'commercial' as const, title: pageCopy.commercial, hint: pageCopy.commercialHint, count: messages.length },
          ]).map((item) => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveSection(item.key)}
                className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-start transition ${active ? 'border-[#9fc2f4] bg-[#eef5fd]' : 'border-transparent bg-white hover:bg-[#f8fbfe]'}`}
              >
                <span className="min-w-0">
                  <span className={`block text-xs font-black ${active ? 'text-[#1668c4]' : 'text-[#29445e]'}`}>{item.title}</span>
                  <span className="mt-1 block truncate text-[10px] text-[#71859a]">{item.hint}</span>
                </span>
                <span className={`font-num flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-[10px] font-black ${active ? 'bg-[#1668c4] text-white' : 'bg-[#e9eff5] text-[#61788f]'}`}>{item.count.toLocaleString(locale)}</span>
              </button>
            );
          })}
      </nav>

      {ticketNotice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{ticketNotice}</p>}

      {activeSection === 'support' ? (
        <>
          <SupportConversationCenter
            theme="light"
            title={pageCopy.supportTitle}
            locale={locale}
            tickets={tickets}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
            onReply={onTicketReply}
            onFeedback={onTicketFeedback}
            onNew={() => setComposeOpen(true)}
            newLabel={t.newMessage}
            busy={sending}
          />
          {ticketsError && <p role="alert" className="text-xs text-danger">{ticketsError}</p>}
        </>
      ) : (
        <section className="overflow-hidden rounded-[22px] border border-[#dce6f0] bg-white shadow-[0_14px_40px_rgba(15,35,55,.07)]" data-testid="agency-commercial-inbox">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6edf4] px-5 py-4 sm:px-7">
            <div>
              <h2 className="m-0 text-base font-black text-[#102a43]">{pageCopy.commercialTitle}</h2>
              <p className="mt-1 text-[10px] text-[#71859a]">{pageCopy.commercialHint}</p>
            </div>
            <span className="rounded-full bg-[#eaf3ff] px-3 py-1.5 text-[10px] font-black text-[#1668c4]">
              {messages.length.toLocaleString(locale)} {pageCopy.messageCount}
            </span>
          </header>

          {messages.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1f6fb] text-[#8aa0b5]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H7l-3 3V5Z" /><path d="M8 10h8" /></svg>
              </span>
              <p className="mt-4 text-xs font-bold text-[#71859a]">{t.empty}</p>
            </div>
          ) : (
            <div className="grid min-h-[500px] lg:grid-cols-[minmax(300px,.82fr)_minmax(440px,1.35fr)]">
              <div className="border-b border-[#e6edf4] lg:border-b-0 lg:border-e">
                <div className="max-h-[610px] overflow-y-auto p-3 sm:p-4">
                  {messages.map((message) => {
                    const parts = messageParts(message);
                    const active = selected?.id === message.id;
                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setSelectedId(message.id)}
                        className={`mb-2 block w-full rounded-2xl border px-4 py-4 text-start transition last:mb-0 ${active ? 'border-[#9fc2f4] bg-[#eef5fd] shadow-[0_7px_18px_rgba(22,104,196,.08)]' : 'border-[#e6edf4] bg-white hover:border-[#cdddeb] hover:bg-[#fafcfe]'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <strong className={`truncate text-xs font-black ${active ? 'text-[#1668c4]' : 'text-[#1a2d42]'}`}>{parts.subject || fallbackSubject}</strong>
                          <time className="shrink-0 text-[9px] text-[#8da0b2]">{formatLocaleDateTime(message.createdAt, locale)}</time>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-6 text-[#687b8f]">{parts.body}</p>
                        <div className="mt-3 flex items-center gap-2 text-[9px] font-bold text-[#71859a]">
                          <span className={`h-2 w-2 rounded-full ${message.senderIsAgency ? 'bg-[#4f82e8]' : 'bg-[#35a67a]'}`} />
                          {message.senderIsAgency ? t.youLabel : locale === 'fa' ? 'واحد بازرگانی blujet' : 'blujet commercial team'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selected && (() => {
                const parts = messageParts(selected);
                return (
                  <article className="flex min-w-0 flex-col p-5 sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e6edf4] pb-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eaf3ff] text-[#1668c4]">
                          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H7l-3 3V5Z" /><path d="M8 9h8M8 12h5" /></svg>
                        </span>
                        <div className="min-w-0">
                          <h3 className="m-0 truncate text-sm font-black text-[#102a43]">{parts.subject || fallbackSubject}</h3>
                          <p className="mt-1 text-[10px] text-[#71859a]">{pageCopy.conversation}</p>
                        </div>
                      </div>
                      <time className="rounded-full bg-[#f3f7fb] px-3 py-1.5 text-[9px] text-[#71859a]">{formatLocaleDateTime(selected.createdAt, locale)}</time>
                    </div>

                    <div className="flex min-h-[230px] flex-1 flex-col py-6">
                      <div className={`max-w-[88%] rounded-2xl border px-4 py-3 ${selected.senderIsAgency ? 'self-end border-[#b9d3f3] bg-[#eaf3ff]' : 'self-start border-[#d8e2ec] bg-[#f1f5f9]'}`}>
                        <div className="mb-2 text-[10px] font-black text-[#2563b9]">{selected.senderIsAgency ? t.youLabel : locale === 'fa' ? 'واحد بازرگانی blujet' : 'blujet commercial team'}</div>
                        <p className="m-0 whitespace-pre-line text-xs leading-7 text-[#29445e]">{parts.body}</p>
                        {selected.attachments?.length ? <AttachmentList attachments={selected.attachments} /> : null}
                      </div>
                    </div>

                    <div className="border-t border-[#e6edf4] pt-4">
                      <label className="sr-only" htmlFor="agency-commercial-reply">{replyPlaceholder}</label>
                      <textarea
                        id="agency-commercial-reply"
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder={replyPlaceholder}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-[#cedbe8] bg-[#fbfdff] p-3 text-xs leading-6 text-[#102a43] outline-none placeholder:text-[#8797a8] focus:border-[#4f82e8]"
                      />
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                        <AttachmentPicker value={replyAttachments} onChange={(files) => setReplyAttachments(files.slice(-1))} disabled={sending} />
                        <button type="button" disabled={!replyBody.trim() || sending} onClick={() => void onReply(parts.subject || fallbackSubject)} className="h-11 rounded-xl bg-[#1668c4] px-6 text-xs font-black text-white shadow-[0_8px_18px_rgba(22,104,196,.2)] disabled:opacity-50">{t.sendBtn}</button>
                      </div>
                    </div>
                  </article>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {composeOpen && <Modal title={t.newMessage} onClose={() => setComposeOpen(false)} variant="light" maxWidthClass="max-w-xl"><form onSubmit={onSend} className="space-y-4" data-testid="agency-compose-message">
        <label className="block text-xs font-bold text-muted">{t.requesterName}<input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-[#fafbfd] px-3 text-sm outline-none focus:border-accent" /></label>
        <label className="block text-xs font-bold text-muted">{t.requesterPhone}<input dir="ltr" inputMode="tel" value={requesterPhone} onChange={(e) => setRequesterPhone(e.target.value)} placeholder={t.phonePlaceholder} className="mt-2 h-12 w-full rounded-xl border border-border bg-[#fafbfd] px-3 text-sm outline-none focus:border-accent" /></label>
        <label className="block text-xs font-bold text-muted">{t.subject}<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPlaceholder} className="mt-2 h-12 w-full rounded-xl border border-border bg-[#fafbfd] px-3 text-sm outline-none focus:border-accent" /></label>
        <label className="block text-xs font-bold text-muted">{t.placeholder}<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.placeholder} rows={5} className="mt-2 w-full rounded-xl border border-border bg-[#fafbfd] p-3 text-sm outline-none focus:border-accent" /></label>
        <AttachmentPicker
          value={ticketAttachments}
          onChange={setTicketAttachments}
          disabled={sending}
        />
        {validationError && <p role="alert" className="text-xs text-danger">{validationError}</p>}
        <div className="flex gap-2"><button type="submit" disabled={sending} className="h-12 flex-1 rounded-xl bg-accent px-5 text-sm font-bold text-white disabled:opacity-60">{t.sendBtn}</button><button type="button" onClick={() => { setComposeOpen(false); setValidationError(null); }} className="h-12 rounded-xl bg-[#f1f3f7] px-5 text-sm font-bold text-muted">{t.cancel}</button></div>
      </form></Modal>}
    </div>
  );
}
