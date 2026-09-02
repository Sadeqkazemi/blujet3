import { useCallback, useEffect, useState } from 'react';
import { fetchActiveSessions, fetchSecurityPolicy, logoutAllSessions, updateSecurityPolicy } from '../../api/it-manager';
import { faDigits } from '../../lib/fa-format';
import { useStepUp } from '../../hooks/useStepUp';
import { useOptionalAuth } from '../../hooks/useAuth';
import type { ActiveSession, SecurityPolicy } from '../../types/it-manager';

const TOGGLES: { key: keyof SecurityPolicy; title: string; desc: string }[] = [
  { key: 'requireUppercase', title: 'الزام حروف بزرگ', desc: 'رمز عبور باید حداقل یک حرف بزرگ داشته باشد' },
  { key: 'requireNumber', title: 'الزام عدد', desc: 'رمز عبور باید حداقل یک رقم داشته باشد' },
  { key: 'requireSymbol', title: 'الزام کاراکتر ویژه', desc: 'رمز عبور باید حداقل یک نماد ویژه داشته باشد' },
  { key: 'blockReuse', title: 'ممانعت از تکرار رمز قبلی', desc: 'رمز جدید نباید با رمزهای پیشین یکسان باشد' },
  { key: 'staffTwoFactorMandatory', title: 'احراز دومرحله‌ای مدیران', desc: 'اجباری برای همه حساب‌های مدیریتی' },
];

function Toggle({
  on,
  label,
  onToggle,
  disabled = false,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={`relative h-[25px] w-11 flex-none rounded-full transition ${
        on ? 'bg-[#3b82f6]' : 'bg-[#28344c]'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow transition-all ${
          on ? 'start-[22px]' : 'start-[3px]'
        }`}
      />
    </button>
  );
}

export default function SecurityPage() {
  const user = useOptionalAuth()?.user;
  const readOnly = user?.role === 'EMPLOYEE';
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const stepUp = useStepUp('SESSION_REVOKE');

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        fetchSecurityPolicy(),
        readOnly ? Promise.resolve([]) : fetchActiveSessions(),
      ]);
      setPolicy(p);
      setSessions(s);
    } catch {
      setError('خطا در دریافت اطلاعات امنیتی.');
    }
  }, [readOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggle(key: keyof SecurityPolicy) {
    if (!policy) return;
    try {
      const updated = await updateSecurityPolicy({ [key]: !policy[key] });
      setPolicy(updated);
    } catch {
      setError('خطا در ذخیره تغییرات.');
    }
  }

  async function onLogoutAll() {
    try {
      const fields = await stepUp.confirm();
      const { revokedCount } = await logoutAllSessions(fields);
      setNotice(`${faDigits(revokedCount)} نشست خاتمه یافت ✓`);
      setConfirmLogoutAll(false);
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError('خطا در خروج از نشست‌ها.');
    }
  }

  if (!policy) return <p className="px-[21px] pt-[18px] text-sm text-[#6b7b94]">در حال بارگذاری…</p>;

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="text-[20.5px] font-black text-white">رمزها و امنیت</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">سیاست‌های رمز عبور و کنترل دسترسی</p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(16,185,129,.12)] p-3 text-sm text-[#34d399]">{notice}</p>
      )}

      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[17px]">
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">سیاست رمز عبور</h2>
          <p className="mb-4 mt-1 text-[11px] text-[#6b7b94]">قوانین اعمال‌شده روی رمز همه حساب‌های سامانه</p>
          <div className="flex flex-col">
            {TOGGLES.map((t) => (
              <div
                key={t.key}
                className="flex items-center gap-3 border-b border-[#1f2a3d] py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#e7ecf3]">{t.title}</div>
                  <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">{t.desc}</div>
                </div>
                <Toggle on={Boolean(policy[t.key])} label={t.title} disabled={readOnly} onToggle={() => void onToggle(t.key)} />
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-[15px]">
          {!readOnly && <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[17px]">
            <h2 className="mb-3 text-[14.5px] font-extrabold text-white">پارامترهای رمز</h2>
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-[#cdd6e3]">حداقل طول رمز</span>
                <span className="font-num font-bold text-white">{faDigits(policy.minLength)} کاراکتر</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#cdd6e3]">انقضای رمز</span>
                <span className="font-num font-bold text-white">هر {faDigits(policy.expiryDays)} روز</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#cdd6e3]">تلاش ناموفق مجاز</span>
                <span className="font-num font-bold text-white">{faDigits(policy.maxAttempts)} بار</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[#1f2a3d] pt-3">
                <span className="text-[#cdd6e3]">احراز هویت دومرحله‌ای</span>
                <span className="rounded-[14px] bg-[rgba(59,130,246,.14)] px-2.5 py-1 text-[10.5px] font-bold text-[#60a5fa]">
                  اجباری برای مدیران
                </span>
              </div>
            </div>
          </section>}

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[17px]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[14.5px] font-extrabold text-white">نشست‌های فعال</h2>
              <button
                type="button"
                onClick={() => setConfirmLogoutAll(true)}
                className="text-[11px] font-bold text-[#f87171]"
              >
                خروج همه
              </button>
            </div>
            <p className="mb-3 text-[11px] text-[#6b7b94]">
              {faDigits(sessions.length)} کاربر هم‌اکنون وارد سامانه هستند
            </p>
            {sessions.length === 0 ? (
              <p className="py-3 text-center text-[11.5px] text-[#6b7b94]">نشست فعالی ثبت نشده است.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {sessions.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[#22304a] bg-[#0f1726] px-3 py-2.5 text-[11px]"
                  >
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#18223a] text-[#60a5fa]">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 font-bold text-[#e7ecf3]">
                      {s.who} <span className="font-normal text-[#6b7b94]">· {s.role}</span>
                    </span>
                    <span className="font-num ltr text-[#6b7b94]">{s.ip ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {confirmLogoutAll && !readOnly && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14]/72 p-4 backdrop-blur-[3px]"
          role="presentation"
          onClick={() => setConfirmLogoutAll(false)}
        >
          <div
            role="dialog"
            aria-label="خروج اجباری همه نشست‌ها"
            className="w-full max-w-sm rounded-2xl border border-[#2a3550] bg-[#141d2e] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-black text-white">خروج اجباری همه نشست‌ها</h3>
            <p className="mb-4 text-xs text-[#6b7b94]">
              همه کاربران سامانه از نشست فعلی خارج می‌شوند. این عملیات بلافاصله اعمال می‌شود.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLogoutAll(false)}
                className="rounded-[11px] border border-[#28344c] px-4 py-2 text-xs font-bold text-[#9fb0c7]"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void onLogoutAll()}
                className="rounded-[11px] bg-[#f87171] px-4 py-2 text-xs font-bold text-white"
              >
                خروج همه
              </button>
            </div>
          </div>
        </div>
      )}
      {stepUp.modal}
    </div>
  );
}
