import { useEffect, useMemo, useState } from 'react';
import Pagination from '../../components/Pagination';
import { fetchNotifications, markNotificationRead } from '../../api/notifications';
import { formatLocaleDateTime, localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { NotificationRow } from '../../types/notifications';

type NoticeKind = 'NOTICE' | 'AMENDMENT';
type NoticeFilter = 'ALL' | NoticeKind;
const PAGE_SIZE = 10;

type NoticeItem = {
  id: string;
  kind: NoticeKind;
  title: string;
  summary: string;
  body: string;
  badge: string;
  createdAt: string | null;
  unread: boolean;
  notification: NotificationRow;
};

const COPY: Record<StoredLocale, {
  title: string;
  subtitle: string;
  loading: string;
  all: string;
  notices: string;
  amendments: string;
  unread: string;
  empty: string;
  partialError: string;
  fullError: string;
  retry: string;
  close: string;
  adminBadge: string;
  amendmentBadge: string;
  previous: string;
  next: string;
}> = {
  fa: {
    title: 'اطلاعیه و اصلاحیه',
    subtitle: 'اطلاعیه‌ها و اصلاحیه‌هایی که ادمین سایت برای آژانس شما ارسال کرده است',
    loading: 'در حال دریافت اطلاعیه‌ها…',
    all: 'همه', notices: 'اطلاعیه‌ها', amendments: 'اصلاحیه‌ها',
    unread: 'خوانده‌نشده', empty: 'اطلاعیه‌ای در این بخش وجود ندارد.',
    partialError: 'بخشی از اطلاعات در دسترس نیست؛ موارد دریافت‌شده نمایش داده شده‌اند.',
    fullError: 'دریافت اطلاعیه‌ها انجام نشد. دوباره تلاش کنید.', retry: 'تلاش مجدد', close: 'بستن',
    adminBadge: 'اطلاعیه ادمین', amendmentBadge: 'اصلاحیه ادمین',
    previous: 'قبلی', next: 'بعدی',
  },
  en: {
    title: 'Notices & Amendments',
    subtitle: 'Notices and amendments sent by the site admin to your agency',
    loading: 'Loading notices…',
    all: 'All', notices: 'Notices', amendments: 'Amendments',
    unread: 'Unread', empty: 'There are no notices in this section.',
    partialError: 'Some sources are unavailable; the received items are still shown.',
    fullError: 'Notices could not be loaded. Please try again.', retry: 'Try again', close: 'Close',
    adminBadge: 'Admin notice', amendmentBadge: 'Admin amendment',
    previous: 'Previous', next: 'Next',
  },
  ar: {
    title: 'الإشعارات والتعديلات',
    subtitle: 'الإشعارات والتعديلات التي أرسلتها إدارة الموقع إلى وكالتك',
    loading: 'جارٍ تحميل الإشعارات…',
    all: 'الكل', notices: 'الإشعارات', amendments: 'التعديلات',
    unread: 'غير مقروء', empty: 'لا توجد إشعارات في هذا القسم.',
    partialError: 'بعض المصادر غير متاحة؛ تم عرض العناصر المستلمة.',
    fullError: 'تعذر تحميل الإشعارات. حاول مرة أخرى.', retry: 'إعادة المحاولة', close: 'إغلاق',
    adminBadge: 'إشعار الإدارة', amendmentBadge: 'تعديل الإدارة',
    previous: 'السابق', next: 'التالي',
  },
};

const KIND_STYLE: Record<NoticeKind, { dot: string; iconBg: string; icon: string }> = {
  NOTICE: { dot: 'bg-[#e2ad39]', iconBg: 'bg-[#fff6dc] text-[#a26a00]', icon: '!' },
  AMENDMENT: { dot: 'bg-[#2e70d1]', iconBg: 'bg-[#eaf2ff] text-[#2767c4]', icon: '✎' },
};

export default function AgencyNoticesPage() {
  const { locale } = useLocale();
  const t = COPY[locale];
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [filter, setFilter] = useState<NoticeFilter>('ALL');
  const [selected, setSelected] = useState<NoticeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailedSources(0);

    Promise.allSettled([
      fetchNotifications({ limit: 100, offset: 0 }),
    ]).then(([notificationsResult]) => {
      if (!active) return;
      const next: NoticeItem[] = [];
      let failures = 0;

      if (notificationsResult.status === 'fulfilled') {
        notificationsResult.value
          .filter((row) => row.entityType?.toUpperCase() === 'AGENCY_BULLETIN')
          .forEach((row) => {
            const isAmendment = row.action === 'AGENCY_AMENDMENT_PUBLISHED';
            next.push({
              id: `notification-${row.id}`,
              kind: isAmendment ? 'AMENDMENT' : 'NOTICE',
              title: row.title,
              summary: row.body,
              body: row.body,
              badge: isAmendment ? t.amendmentBadge : t.adminBadge,
              createdAt: row.createdAt,
              unread: row.readAt == null,
              notification: row,
            });
          });
      } else failures += 1;

      next.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setItems(next);
      setPage(1);
      setFailedSources(failures);
      setLoading(false);
    });

    return () => { active = false; };
  }, [locale, reloadKey, t.adminBadge, t.amendmentBadge, t]);

  const counts = useMemo(() => ({
    ALL: items.length,
    NOTICE: items.filter((item) => item.kind === 'NOTICE').length,
    AMENDMENT: items.filter((item) => item.kind === 'AMENDMENT').length,
  }), [items]);

  const visible = useMemo(
    () => (filter === 'ALL' ? items : items.filter((item) => item.kind === filter)),
    [filter, items],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, visible],
  );

  useEffect(() => setPage(1), [filter]);

  async function openNotice(item: NoticeItem) {
    setSelected(item);
    if (!item.notification || !item.unread) return;
    try {
      const updated = await markNotificationRead(item.notification.id);
      setItems((current) => current.map((row) => row.id === item.id
        ? { ...row, unread: false, notification: updated }
        : row));
      setSelected((current) => current?.id === item.id ? { ...current, unread: false, notification: updated } : current);
    } catch {
      // Reading the message must remain possible even if the read receipt fails.
    }
  }

  const filters: { key: NoticeFilter; label: string }[] = [
    { key: 'ALL', label: t.all },
    { key: 'NOTICE', label: t.notices },
    { key: 'AMENDMENT', label: t.amendments },
  ];

  return (
    <div className="space-y-4 pb-8" dir={locale === 'en' ? 'ltr' : 'rtl'}>
      <section className="overflow-hidden rounded-[22px] border border-[#e2e9f2] bg-white shadow-[0_12px_34px_rgba(13,38,64,0.06)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf4] px-5 py-5 sm:px-7">
          <div>
            <h1 className="m-0 text-xl font-black text-[#0d2640]">{t.title}</h1>
            <p className="mb-0 mt-1 text-xs leading-6 text-[#718198]">{t.subtitle}</p>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf2ff] text-xl text-[#2767c4]" aria-hidden>🔔</span>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-[#edf1f6] px-4 py-4 sm:px-7" role="tablist" aria-label={t.title}>
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={filter === entry.key}
              onClick={() => setFilter(entry.key)}
              className={`flex min-w-max items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                filter === entry.key ? 'bg-[#326bc3] text-white shadow-sm' : 'bg-[#f4f7fb] text-[#52657d] hover:bg-[#eaf1fa]'
              }`}
            >
              {entry.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${filter === entry.key ? 'bg-white/20' : 'bg-white'}`}>
                {localeDigits(counts[entry.key], locale)}
              </span>
            </button>
          ))}
        </div>

        {failedSources > 0 && !loading && (
          <div role="alert" className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-xs sm:mx-7 ${
            failedSources === 1 ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{failedSources === 1 ? t.fullError : t.partialError}</span>
              <button type="button" className="font-black underline" onClick={() => setReloadKey((value) => value + 1)}>{t.retry}</button>
            </div>
          </div>
        )}

        <div className="min-h-[320px] px-4 py-4 sm:px-7 sm:py-6">
          {loading ? (
            <div className="grid min-h-[250px] place-items-center text-sm text-[#718198]">{t.loading}</div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-[250px] place-items-center rounded-2xl border border-dashed border-[#d9e2ee] bg-[#fafcff] text-sm text-[#718198]">{t.empty}</div>
          ) : (
            <>
              <div data-testid="agency-notices-list" className="divide-y divide-[#edf1f6] rounded-2xl border border-[#e3eaf2]">
                {pageItems.map((item) => {
                  const style = KIND_STYLE[item.kind];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openNotice(item)}
                      className="group flex w-full items-center gap-3 bg-white px-4 py-4 text-start first:rounded-t-2xl last:rounded-b-2xl hover:bg-[#f8fbff] sm:px-5"
                    >
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-black ${style.iconBg}`} aria-hidden>{style.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-black text-[#112b47]">{item.title}</span>
                          <span className="rounded-full bg-[#f1f5fa] px-2.5 py-1 text-[9px] font-extrabold text-[#597087]">{item.badge}</span>
                          {item.unread && <span className="rounded-full bg-[#fff0f0] px-2 py-1 text-[9px] font-black text-[#d64a4a]">{t.unread}</span>}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-[#718198]">{item.summary}</span>
                      </span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                      <span className="shrink-0 text-[#8394a8] transition group-hover:translate-x-[-2px]" aria-hidden>‹</span>
                    </button>
                  );
                })}
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
                variant="light"
                previousLabel={t.previous}
                nextLabel={t.next}
                formatPage={(value) => localeDigits(value, locale)}
              />
            </>
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#07182c]/55 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="agency-notice-title" className="w-full max-w-2xl overflow-hidden rounded-[22px] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[#e7edf4] px-5 py-5 sm:px-6">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-[10px] font-black text-[#326bc3]">{selected.badge}</span>
                  {selected.createdAt && <time className="text-[10px] text-[#8292a6]">{formatLocaleDateTime(selected.createdAt, locale)}</time>}
                </div>
                <h2 id="agency-notice-title" className="m-0 text-lg font-black text-[#0d2640]">{selected.title}</h2>
              </div>
              <button type="button" aria-label={t.close} onClick={() => setSelected(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f6fa] text-lg text-[#586b82]">×</button>
            </header>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-6 sm:px-6">
              <p className="m-0 whitespace-pre-line text-sm leading-8 text-[#324960]">{selected.body}</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
