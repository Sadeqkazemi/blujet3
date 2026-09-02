import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  approveCardRequest,
  createClubMember,
  fetchCardRequests,
  fetchClubMembers,
  fetchSubmittedCardRequests,
  issueClubCard,
  deactivateClubMember,
  referCardRequest,
  rejectCardRequest,
  updateClubMemberLevel,
} from '../../api/club';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate, parseJalaliDateToIso } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import { usePagination } from '../../hooks/usePagination';
import type { ClubCardRequest, ClubMembersResult, ClubSubmittedCardRequest, ClubTier } from '../../types/club';

const TIER_LABELS: Record<ClubTier, string> = {
  SILVER: 'نقره‌ای',
  GOLD: 'طلایی',
  PLATINUM: 'پلاتین',
};

const TIER_META: Record<
  ClubTier,
  { label: string; color: string; bg: string; avatar: string }
> = {
  SILVER: {
    label: 'نقره‌ای',
    color: '#cbd5e1',
    bg: 'rgba(148,163,184,.16)',
    avatar: '#64748b',
  },
  GOLD: {
    label: 'طلایی',
    color: '#fcd34d',
    bg: 'rgba(202,165,58,.18)',
    avatar: '#b08818',
  },
  PLATINUM: {
    label: 'پلاتین',
    color: '#93c5fd',
    bg: 'rgba(59,130,246,.18)',
    avatar: '#2563eb',
  },
};

const TIER_BADGES_LIGHT: Record<ClubTier, string> = {
  SILVER: 'bg-[#94a3b829] text-[#475569]',
  GOLD: 'bg-[#caa53a2e] text-[#92600e]',
  PLATINUM: 'bg-[#3b82f62e] text-[#1d4ed8]',
};

const REQUEST_STATUS: Record<
  ClubCardRequest['status'],
  { label: string; className: string; color: string; bg: string }
> = {
  SUBMITTED: {
    label: 'در انتظار ادمین',
    className: 'bg-[#fbbf242e] text-[#b45309]',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,.14)',
  },
  REFERRED: {
    label: 'در انتظار تأیید شما',
    className: 'bg-[#a78bfa2e] text-[#6d28d9]',
    color: '#a78bfa',
    bg: 'rgba(124,58,237,.16)',
  },
  APPROVED: {
    label: 'کارت صادر شد',
    className: 'bg-[#10b98124] text-[#059669]',
    color: '#34d399',
    bg: 'rgba(16,185,129,.15)',
  },
  REJECTED: {
    label: 'رد شده',
    className: 'bg-danger/15 text-danger',
    color: '#f87171',
    bg: 'rgba(248,113,113,.15)',
  },
};

function faPoints(points: number): string {
  return faDigits(points.toLocaleString('en-US').replace(/,/g, '٬'));
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function ClubPage() {
  const { user } = useAuth();
  const isSenior = user?.role === 'SENIOR_MANAGER';
  const isSiteAdmin = user?.role === 'SITE_ADMIN';
  const dark =
    user?.role === 'CEO' || user?.role === 'BOARD_CHAIR' || user?.role === 'SENIOR_MANAGER';
  const isExecutiveRich = user?.role === 'CEO' || user?.role === 'BOARD_CHAIR';

  const [result, setResult] = useState<ClubMembersResult | null>(null);
  const [requests, setRequests] = useState<ClubCardRequest[]>([]);
  const [submittedRequests, setSubmittedRequests] = useState<ClubSubmittedCardRequest[]>([]);
  const [levelFilter, setLevelFilter] = useState<ClubTier | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [detailRequest, setDetailRequest] = useState<ClubCardRequest | ClubSubmittedCardRequest | null>(
    null,
  );
  const [referTarget, setReferTarget] = useState<'SENIOR' | 'CHAIR'>('SENIOR');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    birth: '',
    nationalId: '',
    level: 'SILVER' as ClubTier,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const membersData = await fetchClubMembers({ level: levelFilter ?? undefined, q: q || undefined });
      setResult(membersData);
      if (isSiteAdmin) {
        setSubmittedRequests(await fetchSubmittedCardRequests());
        setRequests([]);
      } else {
        setRequests(await fetchCardRequests());
        setSubmittedRequests([]);
      }
    } catch {
      setError('خطا در دریافت اطلاعات باشگاه.');
    } finally {
      setLoading(false);
    }
  }, [levelFilter, q, isSiteAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function onRefer(req: ClubSubmittedCardRequest) {
    try {
      await referCardRequest(req.id, referTarget);
      setNotice(`درخواست «${req.member.fullName}» ارجاع شد ✓`);
      setDetailRequest(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ارجاع درخواست.');
    }
  }

  async function onDecide(req: ClubCardRequest, decision: 'approve' | 'reject') {
    try {
      if (decision === 'approve') {
        await approveCardRequest(req.id);
        setNotice(`کارت ${TIER_LABELS[req.level]} برای «${req.member.fullName}» صادر شد ✓`);
      } else {
        await rejectCardRequest(req.id);
        setNotice('درخواست رد شد');
      }
      setDetailRequest(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت تصمیم.');
    }
  }

  async function onIssueCard(memberId: string, fullName: string) {
    try {
      await issueClubCard(memberId);
      setNotice(`کارت عضویت برای «${fullName}» صادر شد ✓`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در صدور کارت.');
    }
  }

  async function onChangeLevel(memberId: string, level: ClubTier) {
    try {
      await updateClubMemberLevel(memberId, level);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تغییر سطح.');
    }
  }

  async function onAddMember() {
    if (!form.fullName.trim() || !form.email.trim() || !form.nationalId.trim()) {
      setAddError('نام، ایمیل و شماره ملی الزامی است.');
      return;
    }
    let birthDate: string | undefined;
    if (form.birth.trim()) {
      const iso = parseJalaliDateToIso(form.birth);
      if (!iso) {
        setAddError('تاریخ تولد را به شکل ۱۳۷۲/۰۵/۱۴ وارد کنید.');
        return;
      }
      birthDate = iso;
    }
    try {
      await createClubMember({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        nationalId: form.nationalId.trim(),
        level: form.level,
        birthDate,
      });
      setNotice(`«${form.fullName.trim()}» به باشگاه افزوده شد ✓`);
      setAddOpen(false);
      setForm({ fullName: '', email: '', birth: '', nationalId: '', level: 'SILVER' });
      setAddError(null);
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'خطا در افزودن عضو.');
    }
  }

  async function onDeactivateMember() {
    if (!deactivateTarget) return;
    setDeactivateBusy(true);
    setDeactivateError(null);
    try {
      await deactivateClubMember(deactivateTarget.id);
      setNotice(`عضویت VIP «${deactivateTarget.fullName}» غیرفعال شد ✓`);
      setDeactivateTarget(null);
      await load();
    } catch (e) {
      setDeactivateError(e instanceof Error ? e.message : 'خطا در غیرفعال‌سازی عضویت VIP.');
    } finally {
      setDeactivateBusy(false);
    }
  }

  const kpis = result?.kpis;
  const members = result?.members ?? [];
  const visibleRequests = isSiteAdmin
    ? submittedRequests
    : isSenior
      ? requests.filter((r) => r.status === 'REFERRED')
      : requests;

  const membersPager = usePagination(members);
  const visibleRequestsPager = usePagination(visibleRequests);

  const shellClass = dark ? 'px-[21px] pb-[34px] pt-[18px]' : 'p-8';
  const title =
    isSiteAdmin ? 'باشگاه مشتریان' : 'مشتریان VIP';
  const subtitle = isSiteAdmin
    ? 'پروفایل اعضا، صدور کارت و ارجاع درخواست‌ها'
    : isSenior
      ? 'درخواست‌های ارجاع‌شده و اعضای باشگاه'
      : 'تأیید درخواست‌های ارجاع‌شده و صدور کارت عضویت';

  return (
    <div className={shellClass}>
      <div className={dark ? 'mb-5' : 'mb-6 flex flex-wrap items-center justify-between gap-3'}>
        <div>
          <h1 className={dark ? 'text-[20.5px] font-black text-white' : 'text-xl font-black text-ink'}>
            {title}
          </h1>
          <p className={dark ? 'mt-1 text-[11.5px] text-[#6b7b94]' : 'mt-1 text-sm text-muted'}>
            {subtitle}
          </p>
        </div>
        {/* Light layout (non-executive): top CTA opens modal */}
        {!dark && !isSenior && !isSiteAdmin && (
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            تعریف مشتری VIP جدید
          </button>
        )}
      </div>

      {error && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark ? 'bg-[rgba(248,113,113,.12)] text-[#f87171]' : 'bg-danger/10 text-danger'
          }`}
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark ? 'bg-[rgba(52,211,153,.12)] text-[#34d399]' : 'bg-[#10b98115] text-[#059669]'
          }`}
        >
          {notice}
        </p>
      )}

      {/* ── KPI row (CEO / Chair / Site Admin) ── */}
      {!isSenior && kpis && (
        <div
          className={
            dark
              ? 'mb-[15px] grid grid-cols-2 gap-[13px] xl:grid-cols-4'
              : 'mb-6 grid grid-cols-2 gap-4 md:grid-cols-4'
          }
        >
          {dark ? (
            <>
              <KpiCard
                icon={<IconUsers />}
                iconBg="rgba(59,130,246,.16)"
                label="کل اعضای باشگاه"
                value={faDigits(kpis.totalMembers)}
                valueClass="text-white"
                gradient
              />
              <KpiCard
                icon={<IconCard />}
                iconBg="rgba(16,185,129,.14)"
                label="کارت‌های صادرشده"
                value={faDigits(kpis.issuedCards)}
                valueClass="text-[#34d399]"
              />
              <KpiCard
                icon={<IconClock />}
                iconBg="rgba(124,58,237,.16)"
                label="درخواست در انتظار"
                value={faDigits(kpis.pendingRequests)}
                valueClass="text-[#a78bfa]"
              />
              <div className="flex flex-col justify-center gap-2 rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-4 py-3.5">
                <div className="text-[11px] text-[#8fa1bb]">توزیع سطوح عضویت</div>
                {(['PLATINUM', 'GOLD', 'SILVER'] as ClubTier[]).map((t) => (
                  <div key={t} className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-1.5" style={{ color: TIER_META[t].color }}>
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: TIER_META[t].avatar }}
                      />
                      {TIER_LABELS[t]}
                    </span>
                    <span className="font-num font-extrabold text-white">
                      {faDigits(kpis.tierCounts[t])}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="text-[11px] text-muted">کل اعضای باشگاه</div>
                <div className="font-num mt-1 text-lg font-black text-ink">{faDigits(kpis.totalMembers)}</div>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="text-[11px] text-muted">کارت‌های صادرشده</div>
                <div className="font-num mt-1 text-lg font-black text-[#059669]">
                  {faDigits(kpis.issuedCards)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="text-[11px] text-muted">
                  {isSiteAdmin ? 'درخواست‌های در انتظار ارجاع' : 'درخواست در انتظار'}
                </div>
                <div className="font-num mt-1 text-lg font-black text-[#6d28d9]">
                  {faDigits(isSiteAdmin ? kpis.submittedRequests : kpis.pendingRequests)}
                </div>
              </div>
              {isSiteAdmin ? (
                <div className="rounded-xl border border-border bg-white p-4">
                  <div className="text-[11px] text-muted">ارجاع‌شده به مدیران</div>
                  <div className="font-num mt-1 text-lg font-black text-[#a855f7]">
                    {faDigits(kpis.pendingRequests)}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-white p-4">
                  <div className="text-[11px] text-muted">توزیع سطوح عضویت</div>
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    {(['PLATINUM', 'GOLD', 'SILVER'] as ClubTier[]).map((t) => (
                      <div key={t} className="flex items-center justify-between">
                        <span>{TIER_LABELS[t]}</span>
                        <span className="font-num font-bold">{faDigits(kpis.tierCounts[t])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Pending card requests ── */}
      {(isSiteAdmin || isSenior || visibleRequests.length > 0) && (
        <section
          className={
            dark
              ? 'mb-[15px] rounded-2xl border border-[#2c2350] bg-[#141d2e] p-[15px]'
              : 'mb-6 rounded-xl border border-border bg-white p-5'
          }
        >
          <div className={dark ? 'mb-[13px] flex items-center gap-2.5' : ''}>
            {dark && <span className="h-2 w-2 rounded-full bg-[#a78bfa]" />}
            <h2
              className={
                dark
                  ? 'm-0 text-sm font-extrabold text-white'
                  : 'mb-1 text-sm font-bold text-ink'
              }
            >
              {isSiteAdmin
                ? 'درخواست‌های صدور کارت (در انتظار ارجاع)'
                : isSenior
                  ? 'درخواست‌های صدور کارت (ارجاع‌شده)'
                  : 'درخواست‌های صدور کارت در انتظار تأیید شما'}
            </h2>
          </div>
          {isSenior && (
            <p className={`mb-3 text-[11px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
              درخواست‌هایی که ادمین سایت برای تأیید به شما ارجاع داده است؛ با تأیید شما کارت عضویت صادر
              می‌شود.
            </p>
          )}
          {isSiteAdmin && (
            <p className="mb-3 text-[11px] text-muted">
              درخواست‌های ثبت‌شده توسط اعضا — پس از بررسی، به مدیر ارشد یا رئیس هیئت مدیره ارجاع دهید.
            </p>
          )}
          {visibleRequests.length === 0 ? (
            <p className={`py-3 text-center text-xs ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
              {isSiteAdmin
                ? 'درخواستی در انتظار ارجاع نیست.'
                : isSenior
                  ? 'درخواست ارجاع‌شده‌ای وجود ندارد.'
                  : 'درخواستی در انتظار تأیید نیست.'}
            </p>
          ) : dark && isExecutiveRich ? (
            <div className="flex flex-col gap-[9px]">
              {visibleRequestsPager.pageItems.map((r) => {
                const st = REQUEST_STATUS[r.status];
                const tier = TIER_META[r.level];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDetailRequest(r)}
                    aria-label="بررسی درخواست"
                    className="flex w-full items-center gap-3 rounded-xl border border-[#24344c] bg-[#101a2c] px-[13px] py-[11px] text-start transition hover:border-[#3b82f6]/40"
                  >
                    <span
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-[12.5px] font-extrabold text-white"
                      style={{ background: tier.avatar }}
                    >
                      {initials(r.member.fullName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-[13px] font-extrabold text-white">
                        {r.member.fullName}
                      </div>
                      <div className="font-num text-[11px] text-[#8291a8]">
                        کارت {TIER_LABELS[r.level]} · {faPoints(r.points)} امتیاز ·{' '}
                        {formatJalaliDate(r.createdAt)}
                      </div>
                    </div>
                    <span
                      className="flex-none rounded-2xl px-[11px] py-[5px] text-[10.5px] font-bold"
                      style={{ color: st.color, background: st.bg }}
                    >
                      {st.label}
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#5a6678"
                      strokeWidth="2"
                      className="flex-none"
                      aria-hidden
                    >
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className={dark ? 'flex flex-col gap-2' : 'divide-y divide-border'}>
              {visibleRequestsPager.pageItems.map((r) => {
                const st = REQUEST_STATUS[r.status];
                const seniorCanAct = !isSenior || r.assignedTo === 'SENIOR';
                const tier = TIER_META[r.level];
                return (
                  <li
                    key={r.id}
                    className={
                      dark
                        ? 'flex flex-wrap items-center gap-3 rounded-xl border border-[#24344c] bg-[#101a2c] px-3 py-3'
                        : 'flex flex-wrap items-center gap-3 py-3'
                    }
                  >
                    <span
                      className={
                        dark
                          ? 'flex h-10 w-10 items-center justify-center rounded-[11px] text-sm font-black text-white'
                          : 'flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-sm font-black text-accent'
                      }
                      style={dark ? { background: tier.avatar } : undefined}
                    >
                      {dark ? initials(r.member.fullName) : r.member.fullName.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>
                        {r.member.fullName}
                      </div>
                      <div
                        className={`font-num mt-0.5 text-[11px] ${dark ? 'text-[#8291a8]' : 'text-muted'}`}
                      >
                        کارت {TIER_LABELS[r.level]} · {faPoints(r.points)} امتیاز ·{' '}
                        {formatJalaliDate(r.createdAt)}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                        dark ? '' : st.className
                      }`}
                      style={dark ? { color: st.color, background: st.bg } : undefined}
                    >
                      {st.label}
                    </span>
                    {isSiteAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReferTarget('SENIOR');
                          setDetailRequest(r);
                        }}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
                      >
                        بررسی و ارجاع
                      </button>
                    ) : isSenior ? (
                      seniorCanAct && r.status === 'REFERRED' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void onDecide(r, 'reject')}
                            className={
                              dark
                                ? 'rounded-lg border border-[rgba(248,113,113,.5)] px-3 py-2 text-xs font-bold text-[#f87171]'
                                : 'rounded-lg bg-danger/10 px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger/20'
                            }
                          >
                            انصراف
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDecide(r, 'approve')}
                            className="rounded-lg bg-[#16a34a] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#15803d]"
                          >
                            تأیید و صدور کارت
                          </button>
                        </div>
                      ) : (
                        <span className={`text-[11px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                          ارجاع‌شده به رئیس هیئت مدیره — در انتظار تأیید
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDetailRequest(r)}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
                      >
                        بررسی درخواست
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            page={visibleRequestsPager.page}
            totalPages={visibleRequestsPager.totalPages}
            onChange={visibleRequestsPager.setPage}
            variant={dark ? 'dark' : 'light'}
          />
        </section>
      )}

      {/* ── Members directory ── */}
      <section
        className={
          dark
            ? 'mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] p-[15px]'
            : 'rounded-xl border border-border bg-white p-5'
        }
      >
        <div className="mb-[13px] flex flex-wrap items-center justify-between gap-2.5">
          <h2 className={`m-0 text-sm font-extrabold ${dark ? 'text-white' : 'text-ink'}`}>
            {isSenior ? 'مشتریان VIP' : 'اعضای باشگاه'}
            {!dark && (
              <span className="font-num mr-2 text-[11px] font-normal text-muted">
                نمایش {faDigits(members.length)} عضو
              </span>
            )}
          </h2>
          {!isSenior && (
            <div className="flex flex-wrap gap-1.5">
              {([null, 'PLATINUM', 'GOLD', 'SILVER'] as (ClubTier | null)[]).map((t) => {
                const on = levelFilter === t;
                return (
                  <button
                    key={t ?? 'all'}
                    type="button"
                    onClick={() => setLevelFilter(t)}
                    className={
                      dark
                        ? `rounded-[9px] px-[13px] py-[7px] text-[11px] transition ${
                            on
                              ? 'bg-[#3b82f6] font-extrabold text-white'
                              : 'bg-[#18223a] font-medium text-[#9fb0c7]'
                          }`
                        : `rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                            on ? 'bg-accent text-white' : 'bg-surface text-text-2 hover:bg-surface-2'
                          }`
                    }
                  >
                    {t ? TIER_LABELS[t] : 'همه سطوح'}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!isSenior && (
          <div className="relative mb-3.5">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#6b7b94]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در نام، ایمیل، شماره ملی یا کارت…"
              className={
                dark
                  ? 'h-[42px] w-full rounded-[10px] border border-[#28344c] bg-[#0f1626] px-9 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]'
                  : 'mb-1 h-[42px] w-full rounded-xl border border-border bg-white px-9 text-xs outline-none transition focus:border-accent'
              }
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="پاک کردن جستجو"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[15px] leading-none text-[#6b7b94] hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        )}

        {dark && !isSenior && (
          <div className="mb-[11px] text-[11.5px] text-[#6b7b94]">
            نمایش <span className="font-extrabold text-[#cdd9ec]">{faDigits(members.length)}</span> عضو
          </div>
        )}

        {loading ? (
          <p className={`py-6 text-center text-sm ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
            در حال بارگذاری…
          </p>
        ) : members.length === 0 ? (
          <p className={`py-[26px] text-center text-xs ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
            {dark ? 'اطلاعاتی یافت نشد' : 'عضوی یافت نشد.'}
          </p>
        ) : dark && isExecutiveRich ? (
          <div className="flex flex-col gap-[9px]">
            {membersPager.pageItems.map((m) => {
              const tier = TIER_META[m.level];
              const issued = m.cardStatus === 'ISSUED';
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3.5 rounded-xl border border-[#1f2a3d] bg-[#101a2c] px-3.5 py-[11px]"
                >
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-[12.5px] font-extrabold text-white"
                    style={{ background: tier.avatar }}
                  >
                    {initials(m.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-extrabold text-white">{m.fullName}</span>
                      <span
                        className="flex-none rounded-xl px-[9px] py-[3px] text-[9.5px] font-extrabold"
                        style={{ color: tier.color, background: tier.bg }}
                      >
                        {tier.label}
                      </span>
                    </div>
                    <div className="truncate text-[10.5px] text-[#8291a8]" dir="ltr">
                      {m.email}
                    </div>
                  </div>
                  <div className="w-[78px] flex-none text-center">
                    <div className="mb-0.5 text-[9.5px] text-[#6b7b94]">امتیاز</div>
                    <div className="font-num text-[12.5px] font-extrabold text-[#e7ecf3]">
                      {faPoints(m.points)}
                    </div>
                  </div>
                  <div className="w-[112px] flex-none text-center">
                    <div className="mb-0.5 text-[9.5px] text-[#6b7b94]">عضویت از</div>
                    <div className="font-num text-[11.5px] font-bold text-[#e7ecf3]">
                      {formatJalaliDate(m.joinDate)}
                    </div>
                  </div>
                  <span
                    className="flex-none rounded-[14px] px-[11px] py-[5px] text-[10.5px] font-bold"
                    style={{
                      color: issued ? '#34d399' : '#8291a8',
                      background: issued ? 'rgba(16,185,129,.14)' : 'rgba(130,145,168,.12)',
                    }}
                  >
                    {issued ? (
                      <>
                        کارت فعال · <span dir="ltr">{m.cardNo}</span>
                      </>
                    ) : (
                      'بدون کارت'
                    )}
                  </span>
                  {!issued && (
                    <button
                      type="button"
                      onClick={() => void onIssueCard(m.id, m.fullName)}
                      className="flex-none rounded-[9px] bg-[#3b82f6] px-[15px] py-2 text-[11px] font-extrabold text-white transition hover:bg-[#2563eb]"
                    >
                      صدور کارت
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`غیرفعال‌سازی عضویت VIP ${m.fullName}`}
                    onClick={() => setDeactivateTarget({ id: m.id, fullName: m.fullName })}
                    className="flex-none rounded-[9px] border border-[#ef444466] px-3 py-2 text-[10px] font-bold text-[#f87171]"
                  >
                    غیرفعال‌سازی
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className={dark ? 'flex flex-col gap-2' : 'divide-y divide-border'}>
            {membersPager.pageItems.map((m) => (
              <li
                key={m.id}
                className={dark ? 'rounded-xl border border-[#1f2a3d] bg-[#101a2c] px-3 py-3' : 'py-3'}
              >
                <div
                  className={`flex flex-wrap items-center gap-3 ${isSenior ? 'cursor-pointer' : ''}`}
                  onClick={() => isSenior && setExpandedMember(expandedMember === m.id ? null : m.id)}
                >
                  <span
                    className={
                      dark
                        ? 'flex h-10 w-10 items-center justify-center rounded-[11px] text-sm font-black text-white'
                        : 'flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-sm font-black text-accent'
                    }
                    style={dark ? { background: TIER_META[m.level].avatar } : undefined}
                  >
                    {dark ? initials(m.fullName) : m.fullName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>
                        {m.fullName}
                      </span>
                      {dark ? (
                        <span
                          className="rounded-xl px-2.5 py-0.5 text-[10px] font-bold"
                          style={{
                            color: TIER_META[m.level].color,
                            background: TIER_META[m.level].bg,
                          }}
                        >
                          {TIER_LABELS[m.level]}
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${TIER_BADGES_LIGHT[m.level]}`}
                        >
                          {TIER_LABELS[m.level]}
                        </span>
                      )}
                    </div>
                    <div className={`mt-0.5 text-[11px] ${dark ? 'text-[#8291a8]' : 'text-muted'}`}>
                      <span className="ltr">{m.email}</span> · امتیاز{' '}
                      <span className="font-num font-bold">{faPoints(m.points)}</span>
                    </div>
                  </div>
                  {m.cardStatus === 'ISSUED' ? (
                    <span
                      className={
                        dark
                          ? 'rounded-full px-3 py-1 text-[10px] font-bold text-[#34d399]'
                          : 'rounded-full bg-[#10b98124] px-3 py-1 text-[10px] font-bold text-[#059669]'
                      }
                      style={dark ? { background: 'rgba(16,185,129,.14)' } : undefined}
                    >
                      کارت فعال · <span className="ltr font-num">{m.cardNo}</span>
                    </span>
                  ) : (
                    <>
                      <span
                        className={
                          dark
                            ? 'rounded-full px-3 py-1 text-[10px] font-bold text-[#8291a8]'
                            : 'rounded-full bg-surface px-3 py-1 text-[10px] font-bold text-muted'
                        }
                        style={dark ? { background: 'rgba(130,145,168,.12)' } : undefined}
                      >
                        بدون کارت
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onIssueCard(m.id, m.fullName);
                        }}
                        className={
                          dark
                            ? 'rounded-[9px] bg-[#3b82f6] px-3 py-1.5 text-xs font-bold text-white'
                            : 'rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent/90'
                        }
                      >
                        صدور کارت
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`غیرفعال‌سازی عضویت VIP ${m.fullName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeactivateTarget({ id: m.id, fullName: m.fullName });
                    }}
                    className="rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] font-bold text-red-400"
                  >
                    غیرفعال‌سازی
                  </button>
                </div>

                {isSenior && expandedMember === m.id && (
                  <div
                    className={`mt-3 rounded-lg p-3 text-xs ${
                      dark ? 'bg-[#0f1726]' : 'bg-surface'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div>
                        <div className={`text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                          تاریخ عضویت
                        </div>
                        <div className={`font-num font-bold ${dark ? 'text-[#e7ecf3]' : ''}`}>
                          {formatJalaliDate(m.joinDate)}
                        </div>
                      </div>
                      <div>
                        <div className={`text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                          امتیاز
                        </div>
                        <div className={`font-num font-bold ${dark ? 'text-[#e7ecf3]' : ''}`}>
                          {faPoints(m.points)}
                        </div>
                      </div>
                      {m.birthDate && (
                        <div>
                          <div className={`text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                            تاریخ تولد
                          </div>
                          <div className={`font-num font-bold ${dark ? 'text-[#e7ecf3]' : ''}`}>
                            {formatJalaliDate(m.birthDate)}
                          </div>
                        </div>
                      )}
                      {m.issuedByLabelFa && (
                        <div>
                          <div className={`text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                            صادرشده توسط
                          </div>
                          <div className={`font-bold ${dark ? 'text-[#e7ecf3]' : ''}`}>
                            {m.issuedByLabelFa}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                        سطح عضویت:
                      </span>
                      {(['SILVER', 'GOLD', 'PLATINUM'] as ClubTier[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => void onChangeLevel(m.id, t)}
                          className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                            m.level === t
                              ? 'bg-[#3b82f6] text-white'
                              : dark
                                ? 'bg-[#18223a] text-[#9fb0c7]'
                                : 'bg-white text-text-2 hover:bg-surface-2'
                          }`}
                        >
                          {TIER_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={membersPager.page}
          totalPages={membersPager.totalPages}
          onChange={membersPager.setPage}
          variant={dark ? 'dark' : 'light'}
        />
      </section>

      {/* ── Add VIP accordion (executive dark) ── */}
      {dark && (
        <section className="rounded-2xl border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <button
            type="button"
            aria-expanded={addOpen}
            aria-label="تعریف مشتری VIP جدید"
            onClick={() => {
              setAddError(null);
              setAddOpen((v) => !v);
            }}
            className="flex w-full items-center justify-between gap-2.5 text-start"
          >
            <div>
              <div className="text-[13.5px] font-extrabold text-white">تعریف مشتری VIP جدید</div>
              <div className="mt-1 text-[11.5px] text-[#6b7b94]">
                اطلاعات مشتری را دستی وارد کنید تا به‌عنوان عضو باشگاه ثبت شود.
              </div>
            </div>
            <span
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border border-[#28344c] bg-[#0f1726] text-[#9fb0c7] transition-transform"
              style={{ transform: addOpen ? 'rotate(180deg)' : 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {addOpen && (
            <div id="vip-add-form" className="mt-4" role="region" aria-label="فرم تعریف مشتری VIP جدید">
              <VipAddFormFields form={form} setForm={setForm} dark />
              <div className="mt-3.5 flex flex-wrap items-center gap-[11px]">
                <span className="text-[11px] text-[#9fb0c7]">سطح کاربر</span>
                <div className="inline-flex gap-0.5 rounded-[10px] border border-[#28344c] bg-[#0f1726] p-[3px]">
                  {(['SILVER', 'GOLD', 'PLATINUM'] as ClubTier[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, level: t })}
                      className={`rounded-[7px] px-[15px] py-[7px] text-[11.5px] transition ${
                        form.level === t
                          ? 'bg-[#3b82f6] font-extrabold text-white'
                          : 'font-semibold text-[#9fb0c7]'
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void onAddMember()}
                  className={`ms-auto rounded-[10px] px-5 py-[9px] text-xs font-extrabold transition ${
                    form.fullName.trim() && form.email.trim()
                      ? 'bg-[#16a34a] text-white hover:bg-[#15803d]'
                      : 'bg-[#1f2a3d] text-[#5a6678]'
                  }`}
                >
                  افزودن به باشگاه
                </button>
              </div>
              {addError && (
                <p role="alert" className="mt-2 text-xs text-[#f87171]">
                  {addError}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <ConfirmActionDialog
        open={deactivateTarget !== null}
        title="غیرفعال‌سازی عضویت VIP"
        message={deactivateTarget ? `عضویت VIP «${deactivateTarget.fullName}» غیرفعال شود؟ مزایای باشگاه متوقف می‌شود اما حساب کاربری و تمام سوابق سفر، مالی و امتیاز مشتری محفوظ می‌ماند.` : ''}
        confirmLabel="غیرفعال‌سازی"
        cancelLabel="انصراف"
        busy={deactivateBusy}
        busyLabel="در حال غیرفعال‌سازی…"
        error={deactivateError}
        variant={dark ? 'dark' : 'light'}
        testId="club-member-deactivate-confirm"
        onCancel={() => {
          if (!deactivateBusy) {
            setDeactivateTarget(null);
            setDeactivateError(null);
          }
        }}
        onConfirm={onDeactivateMember}
      />

      {/* Detail modal */}
      {detailRequest && (
        <Modal
          title={isSiteAdmin ? 'ارجاع درخواست صدور کارت' : 'بررسی درخواست صدور کارت'}
          onClose={() => setDetailRequest(null)}
          variant={dark ? 'dark' : 'light'}
          maxWidthClass="max-w-lg"
        >
          {dark && isExecutiveRich ? (
            <ExecutiveRequestDetail
              req={detailRequest}
              onApprove={() => void onDecide(detailRequest, 'approve')}
              onReject={() => void onDecide(detailRequest, 'reject')}
            />
          ) : (
            <>
              <div className="mb-3">
                <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>
                  {detailRequest.member.fullName}
                </div>
                <div className={`font-num mt-1 text-xs ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
                  کارت {TIER_LABELS[detailRequest.level]} · {faPoints(detailRequest.points)} امتیاز
                </div>
                {isSiteAdmin && 'nationalId' in detailRequest.member && (
                  <div
                    className={`font-num mt-2 grid grid-cols-2 gap-2 text-[11px] ${
                      dark ? 'text-[#6b7b94]' : 'text-muted'
                    }`}
                  >
                    <div>کد ملی: {faDigits(detailRequest.member.nationalId)}</div>
                    <div>ایمیل: {detailRequest.member.email}</div>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <h3 className={`mb-2 text-xs font-bold ${dark ? 'text-white' : 'text-ink'}`}>
                  روند درخواست
                </h3>
                <ul className="space-y-2">
                  {detailRequest.history.map((h, idx) => (
                    <li
                      key={idx}
                      className={`border-r-2 border-[#059669]/50 pr-3 text-[11px]`}
                    >
                      <div className={`font-bold ${dark ? 'text-[#dbe7fb]' : 'text-ink'}`}>
                        {h.labelFa}
                      </div>
                      <div className={`font-num ${dark ? 'text-[#6b7b94]' : 'text-muted-2'}`}>
                        {faDigits(h.at)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {isSiteAdmin && detailRequest.status === 'SUBMITTED' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-ink">ارجاع به مدیران</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReferTarget('SENIOR')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold ${
                        referTarget === 'SENIOR'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-text-2'
                      }`}
                    >
                      مدیر ارشد
                    </button>
                    <button
                      type="button"
                      onClick={() => setReferTarget('CHAIR')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold ${
                        referTarget === 'CHAIR'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-text-2'
                      }`}
                    >
                      رئیس هیئت مدیره
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRefer(detailRequest as ClubSubmittedCardRequest)}
                    className="w-full rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
                  >
                    ثبت ارجاع
                  </button>
                </div>
              )}
              {!isSiteAdmin && detailRequest.status === 'REFERRED' && (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void onDecide(detailRequest, 'reject')}
                    className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white transition hover:bg-danger/90"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDecide(detailRequest, 'approve')}
                    className="rounded-lg bg-[#059669] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#047857]"
                  >
                    تأیید و صدور کارت
                  </button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Light-layout modal for add VIP (non-dark roles only) */}
      {addOpen && !isExecutiveRich && (
        <Modal title="تعریف مشتری VIP جدید" onClose={() => setAddOpen(false)}>
          <VipAddFormFields form={form} setForm={setForm} dark={false} />
          <div className="mb-1 mt-3 text-xs font-bold text-ink">سطح عضویت</div>
          <div className="flex gap-1.5">
            {(['SILVER', 'GOLD', 'PLATINUM'] as ClubTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, level: t })}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  form.level === t ? 'bg-accent text-white' : 'bg-panel-canvas text-panel-muted hover:bg-panel-surface-2/50'
                }`}
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>
          {addError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {addError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-lg bg-surface px-4 py-2 text-xs font-bold text-text-2"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => void onAddMember()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
            >
              افزودن به باشگاه
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  valueClass,
  gradient,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueClass: string;
  gradient?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-[18px] py-4 ${
        gradient
          ? 'border-[#26324a] bg-gradient-to-br from-[#1a2740] to-[#141d2e]'
          : 'border-[#1f2a3d] bg-[#141d2e]'
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
          style={{ background: iconBg }}
        >
          {icon}
        </span>
        <span className="text-[11.5px] text-[#8fa1bb]">{label}</span>
      </div>
      <div className={`font-num text-[28px] font-black leading-none ${valueClass}`}>{value}</div>
    </div>
  );
}

function VipAddFormFields({
  form,
  setForm,
  dark,
}: {
  form: { fullName: string; email: string; birth: string; nationalId: string; level: ClubTier };
  setForm: (f: typeof form) => void;
  dark: boolean;
}) {
  const field = dark
    ? 'h-[42px] w-full rounded-[9px] border border-[#28344c] bg-[#0f1726] px-[11px] text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]'
    : 'w-full rounded-lg border border-border p-3 text-xs outline-none transition focus:border-accent';
  const labelCls = dark ? 'mb-1.5 block text-[11px] text-[#9fb0c7]' : 'mb-1 block text-xs font-bold text-ink';

  if (dark) {
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="vip-name">
            نام و نام خانوادگی
          </label>
          <input
            id="vip-name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            placeholder="نام و نام خانوادگی"
            className={field}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="vip-email">
            ایمیل
          </label>
          <input
            id="vip-email"
            dir="ltr"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@example.com"
            className={`${field} text-end`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="vip-birth">
            تاریخ تولد
          </label>
          <input
            id="vip-birth"
            value={form.birth}
            onChange={(e) => setForm({ ...form, birth: e.target.value })}
            placeholder="۱۳۷۰/۰۱/۰۱"
            className={`font-num ${field}`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="vip-nid">
            شماره ملی
          </label>
          <input
            id="vip-nid"
            dir="ltr"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            placeholder="۰۰۱۲۳۴۵۶۷۸"
            className={`font-num text-end ${field}`}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <label className={labelCls} htmlFor="vip-name">
        نام و نام خانوادگی
      </label>
      <input
        id="vip-name"
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        className={field}
      />
      <label className={`${labelCls} mt-3`} htmlFor="vip-email">
        ایمیل
      </label>
      <input
        id="vip-email"
        dir="ltr"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className={field}
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="vip-birth">
            تاریخ تولد
          </label>
          <input
            id="vip-birth"
            value={form.birth}
            onChange={(e) => setForm({ ...form, birth: e.target.value })}
            placeholder="۱۳۷۲/۰۵/۱۴"
            className={`font-num ${field}`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="vip-nid">
            شماره ملی
          </label>
          <input
            id="vip-nid"
            dir="ltr"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            className={`font-num ${field}`}
          />
        </div>
      </div>
    </>
  );
}

function ExecutiveRequestDetail({
  req,
  onApprove,
  onReject,
}: {
  req: ClubCardRequest | ClubSubmittedCardRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const tier = TIER_META[req.level];
  const st = REQUEST_STATUS[req.status];
  const canApprove = req.status === 'REFERRED';
  const birth =
    'birthDate' in req.member && req.member.birthDate
      ? formatJalaliDate(req.member.birthDate as string)
      : '—';
  const nationalId =
    'nationalId' in req.member && typeof req.member.nationalId === 'string'
      ? faDigits(req.member.nationalId)
      : '—';

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[13.5px] font-extrabold text-white"
          style={{ background: tier.avatar }}
        >
          {initials(req.member.fullName)}
        </span>
        <div className="leading-normal">
          <div className="text-[14.5px] font-extrabold text-white">{req.member.fullName}</div>
          <div className="text-[11px] text-[#6b7b94]">درخواست صدور کارت {tier.label}</div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11.5px] text-[#9fb0c7]">وضعیت فعلی درخواست</span>
        <span
          className="rounded-2xl px-[11px] py-[5px] text-[11px] font-bold"
          style={{ color: st.color, background: st.bg }}
        >
          {st.label}
        </span>
      </div>

      <div className="mb-3 text-[11.5px] font-extrabold text-white">اطلاعات عضو</div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <InfoTile label="ایمیل" value={req.member.email} ltr />
        <InfoTile label="شماره ملی" value={nationalId} ltr />
        <InfoTile label="تاریخ تولد" value={birth} />
        <InfoTile label="امتیاز" value={faPoints(req.points)} />
      </div>

      <div className="mb-3 text-[11.5px] font-extrabold text-white">روند درخواست</div>
      <div className="mb-2 flex flex-col">
        {req.history.map((h, idx) => (
          <div key={idx} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#1f8a5b] text-[10px] font-extrabold text-white">
                ✓
              </span>
              {idx < req.history.length - 1 && (
                <span className="min-h-[14px] w-0.5 flex-1 bg-[#24344c]" />
              )}
            </div>
            <div className="pb-[11px]">
              <div className="text-[11.5px] font-bold text-[#dbe7fb]">{h.labelFa}</div>
              <div className="font-num mt-0.5 text-[10px] text-[#6b7b94]">{faDigits(h.at)}</div>
            </div>
          </div>
        ))}
      </div>

      {canApprove && (
        <div className="mt-2 flex gap-2 border-t border-[#1f2a3d] pt-[13px]">
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 rounded-[10px] bg-[#16a34a] py-2.5 text-center text-[12.5px] font-extrabold text-white transition hover:bg-[#15803d]"
          >
            تأیید و صدور کارت
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex-1 rounded-[10px] border-[1.5px] border-[rgba(248,113,113,.5)] py-2.5 text-center text-[12.5px] font-extrabold text-[#f87171]"
          >
            انصراف
          </button>
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
      <div className="mb-0.5 text-[10px] text-[#6b7b94]">{label}</div>
      <div className="text-[11.5px] font-bold text-[#cdd9ec]" dir={ltr ? 'ltr' : undefined}>
        {value}
      </div>
    </div>
  );
}
