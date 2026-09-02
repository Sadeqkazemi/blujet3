import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClubMembers,
  fetchSubmittedCardRequests,
  referCardRequest,
} from '../../api/club';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import type {
  ClubMember,
  ClubMembersResult,
  ClubSubmittedCardRequest,
  ClubTier,
} from '../../types/club';

const TIER_LABELS: Record<ClubTier, string> = {
  SILVER: 'نقره‌ای',
  GOLD: 'طلایی',
  PLATINUM: 'پلاتین',
};

const TIER_META: Record<ClubTier, { color: string; bg: string; avatar: string }> = {
  SILVER: { color: '#cbd5e1', bg: 'rgba(148,163,184,.16)', avatar: '#64748b' },
  GOLD: { color: '#fcd34d', bg: 'rgba(202,165,58,.18)', avatar: '#b08818' },
  PLATINUM: { color: '#93c5fd', bg: 'rgba(59,130,246,.18)', avatar: '#2563eb' },
};

const REQ_STATUS: Record<
  ClubSubmittedCardRequest['status'],
  { label: string; color: string; bg: string }
> = {
  SUBMITTED: { label: 'در انتظار بررسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  REFERRED: { label: 'ارجاع‌شده', color: '#a78bfa', bg: 'rgba(124,58,237,.16)' },
  APPROVED: { label: 'کارت صادر شد', color: '#34d399', bg: 'rgba(16,185,129,.15)' },
  REJECTED: { label: 'رد شده', color: '#f87171', bg: 'rgba(248,113,113,.15)' },
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

function cardLabel(m: ClubMember): { text: string; color: string } {
  if (m.cardStatus === 'ISSUED') {
    return { text: `صادر شده · ${m.cardNo ?? ''}`, color: '#34d399' };
  }
  if (m.cardStatus === 'REVIEW') {
    return { text: 'در حال بررسی', color: '#f59e0b' };
  }
  return { text: 'صادر نشده', color: '#9fb0c7' };
}

function downloadVipExcel(rows: ClubMember[]) {
  const head = ['نام و نام خانوادگی', 'کد ملی', 'ایمیل', 'سطح', 'امتیاز', 'شماره کارت', 'صادرکننده'];
  const body = rows.map((m) => [
    m.fullName,
    m.nationalId ?? '',
    m.email,
    TIER_LABELS[m.level],
    String(m.points),
    m.cardNo ?? '',
    m.issuedByLabelFa ?? '',
  ]);
  const esc = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = `<tr>${head
    .map(
      (h) =>
        `<th style="border:1px solid #b0b0b0;padding:6px 10px;background:#e9eef5;color:#1a2740;font-weight:bold">${esc(h)}</th>`,
    )
    .join('')}</tr>`;
  const tb = body
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="border:1px solid #cfd6e0;padding:6px 10px;color:#16202e">${esc(c)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table dir="rtl" style="border-collapse:collapse;font-family:Tahoma,sans-serif;font-size:13px">${th}${tb}</table></body></html>`;
  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'VIP-card-issue-list.xls';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * SITE_ADMIN «باشگاه مشتریان» — dark layout matching design screenshots:
 * 3 KPIs, card-request queue, member profiles, VIP issue list + Excel.
 */
export default function SiteAdminClubPage() {
  const [result, setResult] = useState<ClubMembersResult | null>(null);
  const [requests, setRequests] = useState<ClubSubmittedCardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailReq, setDetailReq] = useState<ClubSubmittedCardRequest | null>(null);
  const [detailMember, setDetailMember] = useState<ClubMember | null>(null);
  const [referTarget, setReferTarget] = useState<'SENIOR' | 'CHAIR'>('SENIOR');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [membersData, reqs] = await Promise.all([
        fetchClubMembers({}),
        fetchSubmittedCardRequests(),
      ]);
      setResult(membersData);
      setRequests(reqs);
    } catch {
      setError('خطا در دریافت اطلاعات باشگاه.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefer() {
    if (!detailReq || detailReq.status !== 'SUBMITTED') return;
    try {
      await referCardRequest(detailReq.id, referTarget);
      setNotice(`درخواست «${detailReq.member.fullName}» ارجاع شد ✓`);
      setDetailReq(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ارجاع درخواست.');
    }
  }

  const members = result?.members ?? [];
  const kpis = result?.kpis;
  const pendingCount =
    (kpis?.submittedRequests ?? 0) + (kpis?.pendingRequests ?? 0);
  const vipReady = useMemo(
    () => members.filter((m) => m.cardStatus === 'ISSUED'),
    [members],
  );

  const reqsPager = usePagination(requests);
  const membersPager = usePagination(members);
  const vipPager = usePagination(vipReady);

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="m-0 text-[20.5px] font-black text-white">باشگاه مشتریان</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          پروفایل اعضا، صدور کارت و ارجاع درخواست‌ها
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      {kpis && (
        <div className="mb-[15px] grid grid-cols-3 gap-[11px]">
          <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-2 text-[11.5px] text-[#6b7b94]">اعضای باشگاه</div>
            <div className="font-num text-[23.5px] font-black text-white">
              {faDigits(kpis.totalMembers)}
            </div>
          </div>
          <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-2 text-[11.5px] text-[#6b7b94]">درخواست‌های در انتظار</div>
            <div className="font-num text-[23.5px] font-black text-[#fbbf24]">
              {faDigits(pendingCount)}
            </div>
          </div>
          <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-2 text-[11.5px] text-[#6b7b94]">کارت‌های صادرشده</div>
            <div className="font-num text-[23.5px] font-black text-[#34d399]">
              {faDigits(kpis.issuedCards)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
      ) : (
        <div className="flex flex-col gap-[15px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="m-0 mb-1 text-[13.5px] font-extrabold text-white">
              درخواست‌های صدور کارت
            </h2>
            <p className="mb-4 text-[11.5px] text-[#6b7b94]">
              روی هر درخواست کلیک کنید تا اطلاعات، ارجاع به مدیران و وضعیت فعلی نمایش داده شود.
            </p>
            {requests.length === 0 ? (
              <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">
                درخواستی در انتظار نیست.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {reqsPager.pageItems.map((r) => {
                    const st = REQ_STATUS[r.status];
                    const tier = TIER_META[r.level];
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setReferTarget('SENIOR');
                            setDetailReq(r);
                          }}
                          className="flex w-full flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#1f2a3d] px-[13px] py-[11px] text-right transition hover:bg-[#1a2435]"
                        >
                          <span className="flex min-w-0 items-center gap-[11px]">
                            <span
                              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[12.5px] font-extrabold text-white"
                              style={{ background: tier.avatar }}
                            >
                              {initials(r.member.fullName)}
                            </span>
                            <span className="min-w-0 leading-snug">
                              <span className="block text-[13px] font-extrabold text-white">
                                {r.member.fullName}
                              </span>
                              <span className="block text-[11px] text-[#6b7b94]">
                                کارت {TIER_LABELS[r.level]} · {faPoints(r.points)} امتیاز ·{' '}
                                {formatJalaliDate(r.createdAt)}
                              </span>
                            </span>
                          </span>
                          <span className="flex items-center gap-2.5">
                            <span
                              className="rounded-2xl px-[11px] py-[5px] text-[10.5px] font-bold"
                              style={{ color: st.color, background: st.bg }}
                            >
                              {st.label}
                            </span>
                            <span className="text-[14.5px] text-[#6b7b94]">‹</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  page={reqsPager.page}
                  totalPages={reqsPager.totalPages}
                  onChange={reqsPager.setPage}
                  variant="dark"
                />
              </>
            )}
          </section>

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="m-0 mb-1 text-[13.5px] font-extrabold text-white">پروفایل اعضا</h2>
            <p className="mb-4 text-[11.5px] text-[#6b7b94]">
              روی هر عضو کلیک کنید تا جزئیات پروفایل نمایش داده شود.
            </p>
            {members.length === 0 ? (
              <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">عضوی ثبت نشده است.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-[7px]">
                  {membersPager.pageItems.map((m) => {
                    const tier = TIER_META[m.level];
                    const card = cardLabel(m);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setDetailMember(m)}
                          className="flex w-full flex-wrap items-center gap-[11px] rounded-[11px] border border-[#1f2a3d] px-[13px] py-2.5 text-right transition hover:bg-[#1a2435]"
                        >
                          <span
                            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[12.5px] font-extrabold text-white"
                            style={{ background: tier.avatar }}
                          >
                            {initials(m.fullName)}
                          </span>
                          <span className="min-w-0 leading-snug">
                            <span className="block text-[13px] font-extrabold text-white">
                              {m.fullName}
                            </span>
                            <span className="ltr block text-[10.5px] text-[#6b7b94]">{m.email}</span>
                          </span>
                          <span className="ms-auto text-[11px] text-[#9fb0c7]">
                            {faPoints(m.points)} امتیاز
                          </span>
                          <span
                            className="flex-none rounded-[14px] px-[9px] py-1 text-[10px] font-extrabold"
                            style={{ color: tier.color, background: tier.bg }}
                          >
                            {TIER_LABELS[m.level]}
                          </span>
                          <span
                            className="flex-none text-[11px] font-bold"
                            style={{ color: card.color }}
                          >
                            {card.text}
                          </span>
                          <span className="flex-none text-[14.5px] text-[#6b7b94]">‹</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  page={membersPager.page}
                  totalPages={membersPager.totalPages}
                  onChange={membersPager.setPage}
                  variant="dark"
                />
              </>
            )}
          </section>

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2.5">
              <h2 className="m-0 text-[13.5px] font-extrabold text-white">
                فهرست مشتریان VIP — آماده صدور کارت{' '}
                <span className="ms-1 rounded-[14px] bg-[rgba(16,185,129,.15)] px-[9px] py-[3px] text-[11px] font-bold text-[#34d399]">
                  {faDigits(vipReady.length)}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => downloadVipExcel(vipReady)}
                disabled={vipReady.length === 0}
                className="inline-flex flex-none items-center gap-[7px] rounded-[9px] bg-gradient-to-br from-[#34d399] to-[#10b981] px-[14px] py-2 text-[11.5px] font-extrabold text-[#0d1117] transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                دانلود اکسل
              </button>
            </div>
            <p className="mb-4 text-[11.5px] text-[#6b7b94]">
              اعضایی که درخواست کارتشان تأیید شده و باید کارت فیزیکی برایشان صادر شود. خروجی اکسل برای
              صدور کارت قابل دانلود است.
            </p>
            {vipReady.length === 0 ? (
              <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">
                هنوز کارتی برای صدور تأیید نشده است.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-[7px]">
                  {vipPager.pageItems.map((m) => {
                    const tier = TIER_META[m.level];
                    return (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-[11px] rounded-[11px] border border-[#1f2a3d] px-[13px] py-2.5"
                      >
                        <span
                          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[12.5px] font-extrabold text-white"
                          style={{ background: tier.avatar }}
                        >
                          {initials(m.fullName)}
                        </span>
                        <span className="min-w-0 leading-snug">
                          <span className="block text-[13px] font-extrabold text-white">
                            {m.fullName}
                          </span>
                          <span className="ltr font-num block text-[10.5px] text-[#6b7b94]">
                            {m.nationalId ? faDigits(m.nationalId) : '—'}
                          </span>
                        </span>
                        <span className="ms-auto flex-none text-[11px] text-[#9fb0c7]">
                          {faPoints(m.points)} امتیاز
                        </span>
                        <span
                          className="flex-none rounded-[14px] px-[9px] py-1 text-[10px] font-extrabold"
                          style={{ color: tier.color, background: tier.bg }}
                        >
                          {TIER_LABELS[m.level]}
                        </span>
                        <span className="ltr flex-none text-[11px] font-extrabold text-[#34d399]">
                          💳 {m.cardNo ?? '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  page={vipPager.page}
                  totalPages={vipPager.totalPages}
                  onChange={vipPager.setPage}
                  variant="dark"
                />
              </>
            )}
          </section>
        </div>
      )}

      {detailReq && (
        <Modal
          variant="dark"
          title={`درخواست صدور کارت ${TIER_LABELS[detailReq.level]}`}
          onClose={() => setDetailReq(null)}
        >
          <div className="mb-3 flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold text-white"
              style={{ background: TIER_META[detailReq.level].avatar }}
            >
              {initials(detailReq.member.fullName)}
            </span>
            <div>
              <div className="text-sm font-extrabold text-white">{detailReq.member.fullName}</div>
              <div className="text-[11px] text-[#6b7b94]">{detailReq.member.email}</div>
            </div>
            <span
              className="ms-auto rounded-2xl px-3 py-1 text-[10.5px] font-bold"
              style={{
                color: REQ_STATUS[detailReq.status].color,
                background: REQ_STATUS[detailReq.status].bg,
              }}
            >
              {REQ_STATUS[detailReq.status].label}
            </span>
          </div>

          <dl className="mb-4 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">شماره ملی</dt>
              <dd className="ltr font-num font-bold text-[#cdd9ec]">
                {faDigits(detailReq.member.nationalId)}
              </dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">امتیاز</dt>
              <dd className="font-bold text-[#cdd9ec]">{faPoints(detailReq.points)}</dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">تاریخ عضویت</dt>
              <dd className="font-bold text-[#cdd9ec]">
                {formatJalaliDate(detailReq.member.joinDate)}
              </dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">تاریخ درخواست</dt>
              <dd className="font-bold text-[#cdd9ec]">{formatJalaliDate(detailReq.createdAt)}</dd>
            </div>
          </dl>

          {detailReq.history.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">روند درخواست</h3>
              <ul className="space-y-2">
                {detailReq.history.map((h, i) => (
                  <li key={`${h.step}-${i}`} className="text-[11.5px] text-[#9fb0c7]">
                    <span className="font-bold text-[#e7ecf3]">{h.labelFa}</span>
                    <span className="ms-2 text-[#6b7b94]">{h.at}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailReq.status === 'SUBMITTED' ? (
            <div className="border-t border-[#1f2a3d] pt-3">
              <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">ارجاع به مدیران</h3>
              <div className="mb-3 flex gap-2">
                {(
                  [
                    { id: 'SENIOR' as const, label: 'مدیر ارشد' },
                    { id: 'CHAIR' as const, label: 'رئیس هیئت مدیره' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReferTarget(opt.id)}
                    className={`flex-1 rounded-[11px] border-[1.5px] px-3 py-2.5 text-[12px] font-bold transition ${
                      referTarget === opt.id
                        ? 'border-[#3b82f6] bg-[rgba(59,130,246,.16)] text-white'
                        : 'border-[#28344c] bg-[#0f1726] text-[#9fb0c7]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void onRefer()}
                className="w-full rounded-[10px] bg-[#3b82f6] py-2.5 text-[12.5px] font-extrabold text-white transition hover:bg-[#2563eb]"
              >
                {referTarget === 'CHAIR'
                  ? 'ارجاع به رئیس هیئت مدیره'
                  : 'ارجاع به مدیر ارشد'}
              </button>
            </div>
          ) : detailReq.status === 'REFERRED' ? (
            <p className="border-t border-[#1f2a3d] pt-3 text-[11.5px] font-semibold text-[#a78bfa]">
              ↪ این درخواست به{' '}
              {detailReq.assignedTo === 'CHAIR' ? 'رئیس هیئت مدیره' : 'مدیر ارشد'} ارجاع شده و در
              انتظار تأیید است.
            </p>
          ) : null}
        </Modal>
      )}

      {detailMember && (
        <Modal
          variant="dark"
          title="پروفایل عضو باشگاه"
          onClose={() => setDetailMember(null)}
        >
          <div className="mb-3 flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-[14.5px] font-extrabold text-white"
              style={{ background: TIER_META[detailMember.level].avatar }}
            >
              {initials(detailMember.fullName)}
            </span>
            <div>
              <div className="text-[14.5px] font-extrabold text-white">{detailMember.fullName}</div>
              <div className="ltr text-[11px] text-[#6b7b94]">{detailMember.email}</div>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span
              className="rounded-[14px] px-[11px] py-[5px] text-[10px] font-extrabold"
              style={{
                color: TIER_META[detailMember.level].color,
                background: TIER_META[detailMember.level].bg,
              }}
            >
              سطح {TIER_LABELS[detailMember.level]}
            </span>
            <span className="text-[11.5px] font-bold" style={{ color: cardLabel(detailMember).color }}>
              کارت: {cardLabel(detailMember).text}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">شماره ملی</dt>
              <dd className="ltr font-num font-bold text-[#cdd9ec]">
                {detailMember.nationalId ? faDigits(detailMember.nationalId) : '—'}
              </dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">تاریخ عضویت</dt>
              <dd className="font-bold text-[#cdd9ec]">{formatJalaliDate(detailMember.joinDate)}</dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">امتیاز</dt>
              <dd className="text-[13.5px] font-extrabold text-white">
                {faPoints(detailMember.points)}
              </dd>
            </div>
            <div className="rounded-[9px] bg-[#0f1726] px-[11px] py-[9px]">
              <dt className="mb-1 text-[10px] text-[#6b7b94]">شماره کارت</dt>
              <dd className="ltr font-num font-bold text-[#cdd9ec]">{detailMember.cardNo ?? '—'}</dd>
            </div>
          </dl>
          {detailMember.issuedByLabelFa && (
            <p className="mt-3 text-[10.5px] text-[#6b7b94]">
              صادرشده توسط: {detailMember.issuedByLabelFa}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
