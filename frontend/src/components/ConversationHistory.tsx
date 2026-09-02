import AttachmentList from './AttachmentList';
import { formatJalaliDateTime } from '../lib/jalali';
import type { ReferralAttachment } from '../types/cartable';

export interface ConversationHistoryItem {
  id: string;
  title?: string;
  body: string;
  actor?: string | null;
  createdAt: string;
  attachments?: ReferralAttachment[];
  side?: 'sender' | 'recipient';
}

export default function ConversationHistory({
  title,
  items,
  dark = true,
  emptyText = 'هنوز پیامی ثبت نشده است.',
}: {
  title: string;
  items: ConversationHistoryItem[];
  dark?: boolean;
  emptyText?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`overflow-hidden rounded-2xl border ${
        dark ? 'border-[#24304a] bg-[#0b111d]' : 'border-border bg-white'
      }`}
    >
      <header className={`border-b px-4 py-3 ${dark ? 'border-[#1d2738]' : 'border-border'}`}>
        <h3 className={`m-0 text-xs font-black ${dark ? 'text-white' : 'text-ink'}`}>{title}</h3>
      </header>
      <div className="flex max-h-[360px] min-h-[110px] flex-col gap-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className={`my-auto text-center text-xs ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
            {emptyText}
          </p>
        ) : (
          items.map((item) => {
            const recipient = item.side === 'recipient';
            return (
              <article
                key={item.id}
                className={`max-w-[90%] rounded-2xl border px-4 py-3 ${
                  dark
                    ? recipient
                      ? 'self-start border-[#364052] bg-[#29313f]'
                      : 'self-end border-[#274b84] bg-[#142743]'
                    : recipient
                      ? 'self-start border-border bg-surface'
                      : 'self-end border-[#cfe0f6] bg-[#eef5ff]'
                }`}
              >
                {item.title && (
                  <div className={`text-[10px] font-black ${dark ? 'text-[#75a8ff]' : 'text-primary'}`}>
                    {item.title}
                  </div>
                )}
                <p className={`m-0 mt-1 whitespace-pre-wrap text-xs leading-7 ${dark ? 'text-[#d7dfeb]' : 'text-ink'}`}>
                  {item.body}
                </p>
                {item.attachments?.length ? (
                  <div className="mt-2">
                    <AttachmentList attachments={item.attachments} />
                  </div>
                ) : null}
                <div className={`mt-2 text-[9px] ${dark ? 'text-[#738196]' : 'text-muted'}`}>
                  {item.actor ? `${item.actor} · ` : ''}{formatJalaliDateTime(item.createdAt)}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
