import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
      </svg>
    ),
    text: 'ورود همیشه با رمز عبور و کد یک‌بارمصرف پیامکی',
    color: 'bg-blue-500/20 text-[#60a5fa]',
  },
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
    text: 'اولین ورود: تعیین رمز عبور و ثبت شماره موبایل',
    color: 'bg-emerald-500/20 text-[#34d399]',
  },
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    text: 'ثبت گزارش خودکار فعالیت‌ها برای مدیران',
    color: 'bg-violet-400/20 text-[#a78bfa]',
  },
];

/** Shared light two-column shell for the staff login + 2FA steps — matches
 * design-reference-v2/ورود مدیران و کارمندان.dc.html (light theme, visual
 * panel on the aside, white form panel). */
export function StaffLoginLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="staff-login-layout"
      dir="ltr"
      className="grid min-h-screen grid-cols-1 bg-[#eef2f8] font-sans text-[#0f172a] md:grid-cols-[470px_1fr]"
    >
      <div
        data-testid="staff-login-form-panel"
        dir="rtl"
        className="flex items-center justify-center bg-white p-9"
      >
        <div className="w-full max-w-[380px]">{children}</div>
      </div>

      <div data-testid="staff-login-visual-panel" dir="rtl" className="relative hidden overflow-hidden bg-[#0b1526] md:block">
        <img src="/signin-aircraft.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(175deg,rgba(11,21,38,.35),rgba(11,21,38,.82)_55%,#0b1526_100%)]" />
        <div className="relative flex h-full flex-col justify-between px-12 py-11">
          <Link
            to="/"
            data-testid="staff-login-home-logo"
            className="flex items-center gap-2.5 no-underline transition hover:opacity-90"
            aria-label="بازگشت به صفحه اصلی blujet"
          >
            <div className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[19px] text-white shadow-lg">
              ✈
            </div>
            <div>
              <div className="text-[19px] leading-none font-black text-white">blujet</div>
              <div className="mt-0.5 text-[10.5px] text-[#93a5c2]">سامانهٔ مدیریت داخلی</div>
            </div>
          </Link>

          <div className="max-w-[460px]">
            <h1 className="mb-4 text-[32px] leading-relaxed font-black text-white">
              به سامانهٔ مدیریت داخلی blujet خوش آمدید
            </h1>
            <p className="text-[13.5px] leading-loose text-[#c3cfe3]">
              این درگاه مخصوص مدیران و کارمندان سازمان است — همهٔ فعالیت‌ها، مدیریت پروازها، آژانس‌ها و امور مالی از
              همین‌جا در دسترس شماست.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {FEATURES.map((f) => (
              <div key={f.text} className="flex items-center gap-2.5 text-[12.5px] text-[#dde5f2]">
                <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${f.color}`}>
                  {f.icon}
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
