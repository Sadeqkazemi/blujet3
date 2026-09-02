import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApiKeys } from '../../api/agency-portal';
import { useLocale } from '../../hooks/useLocale';
import {
  API_DOC_GROUPS,
  CHANGELOG_ROWS,
  DOC_COPY,
  DOC_SECTIONS,
  ERROR_ROWS,
  type DocSectionKey,
} from './agency-api-docs-content';

const BASE_URL = 'https://api.blujet.ir/v2';

export default function AgencyApiDocsPage() {
  const { locale } = useLocale();
  const t = DOC_COPY[locale];
  const [section, setSection] = useState<DocSectionKey>('intro');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Token: true, Flight: true, Accounting: true });
  const [openEps, setOpenEps] = useState<Record<string, boolean>>({});
  const [hasActiveKey, setHasActiveKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApiKeys()
      .then((keys) => setHasActiveKey(keys.some((k) => k.status === 'ACTIVE')))
      .catch(() => setHasActiveKey(false))
      .finally(() => setLoading(false));
  }, []);

  const sectionTitle = DOC_SECTIONS.find((s) => s.key === section)?.label[locale] ?? '';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-end gap-4">
        <Link
          to="/agency/webservice"
          className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-bold text-accent transition hover:bg-accent/20"
        >
          {locale === 'en' ? '← Web Service tab' : locale === 'ar' ? '← تبويب خدمة الويب' : '← تب وب‌سرویس'}
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted">{t.loading}</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <nav className="flex flex-row flex-wrap gap-1 lg:w-52 lg:flex-col">
            {DOC_SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                data-testid={`doc-section-${s.key}`}
                onClick={() => setSection(s.key)}
                className={`rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
                  section === s.key ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-body hover:text-ink'
                }`}
              >
                {s.label[locale]}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 rounded-xl border border-border bg-white p-5">
            <h2 className="mb-4 text-sm font-bold text-ink">{sectionTitle}</h2>

            {section === 'intro' && (
              <div className="space-y-4 text-sm leading-7 text-muted">
                <p>{t.title}</p>
                <div>
                  <div className="mb-1 text-xs font-bold text-ink">{t.baseUrlLabel}</div>
                  <code dir="ltr" className="font-num block rounded-lg bg-body px-3 py-2 text-xs text-accent">
                    {BASE_URL}
                  </code>
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold text-ink">{t.formatLabel}</div>
                  <p>{t.formatVal}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold text-ink">{t.rateLabel}</div>
                  <p>{t.rateVal}</p>
                </div>
              </div>
            )}

            {section === 'auth' && (
              <div className="space-y-4 text-sm leading-7 text-muted">
                <p>{t.authP1}</p>
                <code dir="ltr" className="font-num block rounded-lg bg-[#0d2640] px-4 py-3 text-xs text-[#e7ecf3]">
                  Authorization: Bearer YOUR_API_KEY
                </code>
                <p>{t.authP2}</p>
              </div>
            )}

            {section === 'endpoints' && (
              <div className="space-y-4">
                <p className="text-xs text-muted">{t.endpointsHint}</p>
                <p
                  className={`rounded-lg p-3 text-xs font-bold ${
                    hasActiveKey ? 'bg-[#10b98118] text-[#059669]' : 'bg-[#f59e0b18] text-[#b45309]'
                  }`}
                >
                  {hasActiveKey ? t.activePlanHint : t.lockedHint}
                </p>
                {API_DOC_GROUPS.map((group) => (
                  <div key={group.key} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setOpenGroups((g) => ({ ...g, [group.key]: !g[group.key] }))}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-ink"
                    >
                      {group.title[locale]}
                      <span className="text-muted">{openGroups[group.key] ? '▾' : '▸'}</span>
                    </button>
                    {openGroups[group.key] && (
                      <div className="border-t border-border">
                        {group.eps.map((ep) => {
                          const locked = ep.locked && !hasActiveKey;
                          const open = !!openEps[ep.id];
                          return (
                            <div key={ep.id} data-testid={`doc-ep-${ep.id}`} className="border-b border-border/60 last:border-0">
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => setOpenEps((e) => ({ ...e, [ep.id]: !e[ep.id] }))}
                                className={`flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
                              >
                                <span className="rounded bg-accent/10 px-2 py-0.5 font-num text-[10px] font-bold text-accent">
                                  {ep.method}
                                </span>
                                <code dir="ltr" className="font-num text-[11px] text-ink">
                                  {ep.path}
                                </code>
                                {locked && (
                                  <span className="text-[10px] font-bold text-muted">🔒</span>
                                )}
                              </button>
                              {open && !locked && (
                                <div className="space-y-3 bg-body/40 px-4 pb-4">
                                  <p className="text-xs leading-6 text-muted">{ep.desc[locale]}</p>
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold text-muted">{t.reqLabel}</div>
                                    <pre dir="ltr" className="overflow-x-auto rounded-lg bg-[#0d2640] p-3 font-mono text-[10px] leading-5 text-[#e7ecf3]">
                                      {ep.req}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold text-muted">{t.resLabel}</div>
                                    <pre dir="ltr" className="overflow-x-auto rounded-lg bg-[#0d2640] p-3 font-mono text-[10px] leading-5 text-[#e7ecf3]">
                                      {ep.res}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {section === 'errors' && (
              <div className="space-y-3">
                <p className="mb-4 text-xs text-muted">{t.errorsHint}</p>
                {ERROR_ROWS.map((row) => (
                  <div key={row.code} className="flex gap-4 rounded-lg border border-border px-4 py-3">
                    <code dir="ltr" className="font-num text-sm font-black text-accent">
                      {row.code}
                    </code>
                    <div>
                      <div className="text-xs font-bold text-ink">{row.title[locale]}</div>
                      <div className="text-[11px] text-muted">{row.desc[locale]}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {section === 'changelog' && (
              <div className="space-y-3">
                {CHANGELOG_ROWS.map((row) => (
                  <div key={row.v} className="rounded-lg border border-border px-4 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-num text-xs font-black text-accent">{row.v}</span>
                      <span className="text-[10px] text-muted">{row.date[locale]}</span>
                    </div>
                    <p className="text-xs leading-6 text-muted">{row.note[locale]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
