import { useEffect, useState, type FormEvent } from 'react';
import {
  changeOwnPassword,
  fetchAdmins,
  resetAdminPassword,
  blockAdmin,
  unblockAdmin,
} from '../../api/admins';
import { ApiRequestError } from '../../api/envelope';
import Modal from '../../components/Modal';
import { useAuth } from '../../hooks/useAuth';
import type { AdminRow } from '../../types/admins';

const ROLE_AVATAR: Record<string, { initial: string; color: string }> = {
  FINANCE_MANAGER: { initial: 'مم', color: '#34d399' },
  COMMERCIAL_MANAGER: { initial: 'مب', color: '#a855f7' },
  SITE_ADMIN: { initial: 'اس', color: '#60a5fa' },
  IT_MANAGER: { initial: 'مف', color: '#f59e0b' },
  SENIOR_MANAGER: { initial: 'ما', color: '#60a5fa' },
  EMPLOYEE: { initial: 'کا', color: '#9fb0c7' },
};

/** CEO/Senior «امنیت و رمز عبور» — own password + managed managers' resets.
 * IT_MANAGER has its own Phase 8 page (رمزها و امنیت); see SecurityRouter. */
export default function OwnSecurityPage() {
  const { user } = useAuth();
  const dark =
    user?.role === 'CEO' || user?.role === 'BOARD_CHAIR' || user?.role === 'SENIOR_MANAGER';
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);
  const [managed, setManaged] = useState<AdminRow[]>([]);
  const [tempPassword, setTempPassword] = useState<{ name: string; value: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reload() {
    fetchAdmins()
      .then((rows) =>
        setManaged(
          rows.filter((r) => {
            if (!r.managedByCaller) return false;
            // Design: CEO manages finance/commercial/site/IT — not مدیر ارشد.
            if (user?.role === 'CEO' && r.role === 'SENIOR_MANAGER') return false;
            return true;
          }),
        ),
      )
      .catch(() => setManaged([]));
  }

  useEffect(reload, [user?.role]);

  async function onSubmitOwn(e: FormEvent) {
    e.preventDefault();
    setPwOk(null);
    if (pwNew.length < 6) {
      setPwError('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('تکرار رمز عبور جدید مطابقت ندارد.');
      return;
    }
    setPwError(null);
    try {
      await changeOwnPassword(pwCur, pwNew);
      setPwOk('رمز عبور با موفقیت تغییر کرد ✓');
      setPwCur('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err instanceof ApiRequestError ? err.message : 'خطا در تغییر رمز عبور.');
    }
  }

  async function onReset(row: AdminRow) {
    try {
      const result = await resetAdminPassword(row.id, {});
      setTempPassword({ name: row.roleLabelFa || row.fullName, value: result.tempPassword });
    } catch {
      setNotice('خطا در بازنشانی رمز.');
    }
  }

  async function onToggleSuspend(row: AdminRow) {
    try {
      if (row.isActive) await blockAdmin(row.id);
      else await unblockAdmin(row.id);
      reload();
    } catch {
      setNotice('خطا در تغییر وضعیت.');
    }
  }

  const shell = dark ? 'px-[21px] pb-[34px] pt-[18px]' : 'p-8';
  const inputClass = dark
    ? 'ltr h-11 w-full rounded-[11px] border border-[#28344c] bg-[#0f1726] px-[13px] text-[13px] text-[#e7ecf3] outline-none focus:border-[#3b82f6]'
    : 'ltr w-full rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-accent';
  const labelClass = dark ? 'mb-[7px] block text-[11px] text-[#9fb0c7]' : 'mb-1.5 block text-[11px] text-muted';

  return (
    <div className={shell}>
      <div className="mb-5">
        <h1 className={`font-black ${dark ? 'text-[20.5px] text-white' : 'mb-1 text-xl text-ink'}`}>
          امنیت و رمز عبور
        </h1>
        <p className={dark ? 'mt-1 text-[11.5px] text-[#6b7b94]' : 'mb-6 text-sm text-muted'}>
          {dark
            ? 'تغییر رمز عبور و مدیریت امنیت حساب مدیریت اجرایی'
            : 'مدیریت رمز حساب خود و رمز مدیران زیرمجموعه'}
        </p>
      </div>

      {notice && (
        <p
          className={`mb-4 rounded-lg p-3 text-xs ${
            dark ? 'bg-[rgba(248,113,113,.12)] text-[#f87171]' : 'bg-danger/10 text-danger'
          }`}
        >
          {notice}
        </p>
      )}

      <div className={`grid grid-cols-1 gap-[15px] lg:grid-cols-[1.1fr_1fr] ${dark ? '' : 'gap-4'}`}>
        <div
          className={
            dark
              ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[17px]'
              : 'rounded-xl border border-border bg-white p-5'
          }
        >
          <div className={`font-bold ${dark ? 'text-[14.5px] text-white' : 'mb-1 text-sm text-ink'}`}>
            تغییر رمز عبور من
          </div>
          <p className={dark ? 'mb-[17px] mt-1 text-[11.5px] text-[#6b7b94]' : 'mb-4 text-[11.5px] text-muted'}>
            رمز عبور حساب مدیریتی خود را به‌روزرسانی کنید.
          </p>
          <form onSubmit={onSubmitOwn} className={`flex flex-col ${dark ? 'gap-[13px]' : 'gap-3'}`} noValidate>
            <div>
              <label htmlFor="pw-cur" className={labelClass}>
                رمز عبور فعلی
              </label>
              <input
                id="pw-cur"
                type="password"
                value={pwCur}
                onChange={(e) => setPwCur(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pw-new" className={labelClass}>
                رمز عبور جدید
              </label>
              <input
                id="pw-new"
                type="password"
                placeholder="حداقل ۶ کاراکتر"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pw-confirm" className={labelClass}>
                تکرار رمز عبور جدید
              </label>
              <input
                id="pw-confirm"
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                className={inputClass}
              />
            </div>
            {pwError && (
              <p
                role="alert"
                className={
                  dark
                    ? 'rounded-[9px] border border-[rgba(248,113,113,.28)] bg-[rgba(248,113,113,.1)] px-3 py-2.5 text-[11px] text-[#f87171]'
                    : 'rounded-lg bg-danger/10 p-2.5 text-[11px] text-danger'
                }
              >
                {pwError}
              </p>
            )}
            {pwOk && (
              <p
                className={
                  dark
                    ? 'rounded-[9px] border border-[rgba(16,185,129,.28)] bg-[rgba(16,185,129,.1)] px-3 py-2.5 text-[11px] text-[#34d399]'
                    : 'rounded-lg bg-[#10b98118] p-2.5 text-[11px] font-bold text-[#059669]'
                }
              >
                {pwOk}
              </p>
            )}
            <button
              type="submit"
              className={
                dark
                  ? 'inline-flex h-[46px] items-center justify-center gap-1.5 rounded-[11px] bg-[#3b82f6] text-[13px] font-extrabold text-white transition hover:brightness-110'
                  : 'rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:brightness-110'
              }
            >
              {dark && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
              ثبت رمز عبور جدید
            </button>
          </form>
        </div>

        {managed.length > 0 && (
          <div
            className={
              dark
                ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[17px]'
                : 'rounded-xl border border-border bg-white p-5'
            }
          >
            <div className={`font-bold ${dark ? 'text-[14.5px] text-white' : 'mb-1 text-sm text-ink'}`}>
              مدیریت رمز سایر مدیران
            </div>
            <p className={dark ? 'mb-4 mt-1 text-[11.5px] text-[#6b7b94]' : 'mb-4 text-[11.5px] text-muted'}>
              بازنشانی رمز عبور مدیران زیرمجموعه و تولید رمز موقت.
            </p>
            <div className={`flex flex-col ${dark ? 'gap-2.5' : 'gap-2.5'}`}>
              {managed.map((m) => {
                const avatar = ROLE_AVATAR[m.role] ?? {
                  initial: (m.roleLabelFa || m.fullName).slice(0, 1),
                  color: '#9fb0c7',
                };
                const displayName = dark ? m.roleLabelFa || m.fullName : m.fullName;
                return (
                  <div
                    key={m.id}
                    className={
                      dark
                        ? 'flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#22304a] bg-[#0f1726] px-[13px] py-[11px]'
                        : 'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-body/50 px-3.5 py-3'
                    }
                  >
                    <div className="flex items-center gap-[11px]">
                      {dark && (
                        <span
                          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[#1d2a40] text-[11.5px] font-extrabold"
                          style={{ color: avatar.color }}
                        >
                          {avatar.initial}
                        </span>
                      )}
                      <div>
                        <div
                          className={`flex items-center gap-2 font-extrabold ${
                            dark ? 'text-[12.5px] text-[#e7ecf3]' : 'text-xs text-ink'
                          }`}
                        >
                          {displayName}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                              m.isActive
                                ? dark
                                  ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                                  : 'bg-[#10b98124] text-[#059669]'
                                : dark
                                  ? 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                                  : 'bg-danger/15 text-danger'
                            }`}
                          >
                            {m.isActive ? 'فعال' : dark ? 'معلق' : 'مسدود'}
                          </span>
                        </div>
                        <div
                          className={`ltr font-num text-[10px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}
                        >
                          {m.username}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void onReset(m)}
                        className={
                          dark
                            ? 'whitespace-nowrap rounded-[9px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] px-3 py-2 text-[11px] font-bold text-[#3b82f6]'
                            : 'rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent/20'
                        }
                      >
                        تغییر رمز
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleSuspend(m)}
                        className={
                          dark
                            ? `whitespace-nowrap rounded-[9px] border border-[#2a3a55] bg-[#141d2e] px-3 py-2 text-[11px] font-bold ${
                                m.isActive ? 'text-[#f87171]' : 'text-[#34d399]'
                              }`
                            : 'rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted transition hover:text-ink'
                        }
                      >
                        {m.isActive ? 'تعلیق' : dark ? 'فعال‌سازی' : 'رفع تعلیق'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {tempPassword && (
        <Modal title="بازنشانی رمز عبور" onClose={() => setTempPassword(null)} variant={dark ? 'dark' : 'light'}>
          <p className={`mb-2 text-xs ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>{tempPassword.name}</p>
          <p className={`mb-3 text-[11px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
            رمز موقت تولیدشده — فقط همین یک بار نمایش داده می‌شود:
          </p>
          <div
            className={`ltr font-num mb-4 rounded-lg p-3 text-center text-base font-black ${
              dark
                ? 'border border-[#28344c] bg-[#0f1726] text-[#34d399]'
                : 'bg-body text-[#059669]'
            }`}
          >
            {tempPassword.value}
          </div>
          <p className={`mb-4 text-[11px] leading-6 ${dark ? 'text-[#9fb0c7]' : 'text-muted'}`}>
            این رمز موقت برای مدیر ارسال می‌شود و در اولین ورود باید تغییر کند.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className={`flex-1 rounded-[11px] py-2.5 text-[12.5px] font-extrabold text-white ${
                dark ? 'bg-[#3b82f6]' : 'bg-accent'
              }`}
            >
              تأیید و ارسال
            </button>
            {dark && (
              <button
                type="button"
                onClick={() => setTempPassword(null)}
                className="rounded-[11px] border border-[#28344c] px-4 py-2.5 text-[12.5px] font-semibold text-[#9fb0c7]"
              >
                انصراف
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
