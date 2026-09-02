import { useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { postInboxMessage } from '../../api/agency-portal';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import AttachmentPicker from '../../components/AttachmentPicker';
import type { ReferralAttachment } from '../../types/cartable';

const COPY: Record<StoredLocale, {
  title: string;
  recipient: string;
  chooseRecipient: string;
  recipients: { value: string; label: string }[];
  subject: string;
  subjectPlaceholder: string;
  body: string;
  bodyPlaceholder: string;
  cancel: string;
  send: string;
  sending: string;
  validation: string;
  failed: string;
}> = {
  fa: {
    title: 'پیام جدید به مدیریت', recipient: 'گیرنده', chooseRecipient: 'انتخاب گیرنده',
    recipients: [
      { value: 'COMMERCIAL_MANAGER', label: 'مدیر بازرگانی' },
      { value: 'FINANCE_MANAGER', label: 'مدیر مالی' },
      { value: 'SITE_ADMIN', label: 'ادمین سایت' },
      { value: 'CEO', label: 'مدیرعامل' },
    ],
    subject: 'موضوع', subjectPlaceholder: 'موضوع پیام', body: 'متن پیام',
    bodyPlaceholder: 'متن پیام خود را بنویسید…', cancel: 'انصراف', send: 'ارسال پیام',
    sending: 'در حال ارسال…', validation: 'گیرنده، موضوع و متن پیام را کامل کنید.',
    failed: 'ارسال پیام با خطا روبه‌رو شد.',
  },
  en: {
    title: 'New message to management', recipient: 'Recipient', chooseRecipient: 'Choose recipient',
    recipients: [
      { value: 'COMMERCIAL_MANAGER', label: 'Commercial Manager' },
      { value: 'FINANCE_MANAGER', label: 'Finance Manager' },
      { value: 'SITE_ADMIN', label: 'Site Admin' },
      { value: 'CEO', label: 'CEO' },
    ],
    subject: 'Subject', subjectPlaceholder: 'Message subject', body: 'Message',
    bodyPlaceholder: 'Write your message…', cancel: 'Cancel', send: 'Send message',
    sending: 'Sending…', validation: 'Complete recipient, subject, and message.',
    failed: 'Unable to send the message.',
  },
  ar: {
    title: 'رسالة جديدة إلى الإدارة', recipient: 'المستلم', chooseRecipient: 'اختر المستلم',
    recipients: [
      { value: 'COMMERCIAL_MANAGER', label: 'المدير التجاري' },
      { value: 'FINANCE_MANAGER', label: 'المدير المالي' },
      { value: 'SITE_ADMIN', label: 'مدير الموقع' },
      { value: 'CEO', label: 'المدير التنفيذي' },
    ],
    subject: 'الموضوع', subjectPlaceholder: 'موضوع الرسالة', body: 'نص الرسالة',
    bodyPlaceholder: 'اكتب رسالتك…', cancel: 'إلغاء', send: 'إرسال الرسالة',
    sending: 'جارٍ الإرسال…', validation: 'أكمل المستلم والموضوع ونص الرسالة.',
    failed: 'تعذر إرسال الرسالة.',
  },
};

export default function AgencyComposeMessageModal({ onClose, onSent }: { onClose: () => void; onSent?: () => void }) {
  const { locale } = useLocale();
  const t = COPY[locale];
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<ReferralAttachment[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const recipientLabel = t.recipients.find((row) => row.value === recipient)?.label;
    if (!recipientLabel || !subject.trim() || !body.trim()) {
      setError(t.validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postInboxMessage(
        `گیرنده: ${recipientLabel}\nموضوع: ${subject.trim()}\n\n${body.trim()}`,
        attachments.map((file) => file.id),
      );
      onSent?.();
      onClose();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t.title} onClose={onClose} variant="light" maxWidthClass="max-w-xl">
      <form onSubmit={submit} data-testid="agency-compose-modal" className="space-y-4">
        <label className="block text-xs font-bold text-[#35465a]">
          {t.recipient}
          <select value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#e1e6ee] bg-[#f8f9fc] px-4 text-sm outline-none focus:border-[#1668c4]">
            <option value="">{t.chooseRecipient}</option>
            {t.recipients.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-[#35465a]">
          {t.subject}
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={t.subjectPlaceholder} className="mt-2 h-12 w-full rounded-xl border border-[#e1e6ee] bg-[#f8f9fc] px-4 text-sm outline-none focus:border-[#1668c4]" />
        </label>
        <label className="block text-xs font-bold text-[#35465a]">
          {t.body}
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t.bodyPlaceholder} rows={5} className="mt-2 w-full resize-y rounded-xl border border-[#e1e6ee] bg-[#f8f9fc] p-4 text-sm leading-7 outline-none focus:border-[#1668c4]" />
        </label>
        <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} />
        {error && <p role="alert" className="text-xs font-bold text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="h-12 flex-1 rounded-xl bg-[#1668c4] text-sm font-black text-white disabled:opacity-60">{busy ? t.sending : t.send}</button>
          <button type="button" onClick={onClose} className="h-12 rounded-xl bg-[#f1f3f7] px-5 text-sm font-bold text-[#687587]">{t.cancel}</button>
        </div>
      </form>
    </Modal>
  );
}
