import { useEffect, useState } from 'react';
import {
  blockAdmin,
  createAdmin,
  fetchAdmins,
  resetAdminPassword,
  unblockAdmin,
} from '../../api/admins';
import { ApiRequestError } from '../../api/envelope';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { formatJalaliDateTime } from '../../lib/jalali';
import { useStepUp } from '../../hooks/useStepUp';
import type { AdminCreatableRole, AdminRow } from '../../types/admins';

const CREATABLE_ROLES: { value: AdminCreatableRole; label: string }[] = [
  { value: 'SENIOR_MANAGER', label: 'مدیر ارشد' },
  { value: 'FINANCE_MANAGER', label: 'مدیر مالی' },
  { value: 'COMMERCIAL_MANAGER', label: 'مدیر بازرگانی' },
  { value: 'IT_MANAGER', label: 'مدیر IT' },
  { value: 'SITE_ADMIN', label: 'ادمین سایت' },
];

const ROLE_PILL: Record<string, { color: string; bg: string }> = {
  SENIOR_MANAGER: { color: '#f97316', bg: 'rgba(249,115,22,.16)' },
  FINANCE_MANAGER: { color: '#3b82f6', bg: 'rgba(59,130,246,.16)' },
  COMMERCIAL_MANAGER: { color: '#22d3ee', bg: 'rgba(34,211,238,.16)' },
  IT_MANAGER: { color: '#a78bfa', bg: 'rgba(124,58,237,.16)' },
  SITE_ADMIN: { color: '#60a5fa', bg: 'rgba(96,165,250,.16)' },
  CEO: { color: '#fbbf24', bg: 'rgba(251,191,36,.16)' },
  BOARD_CHAIR: { color: '#c084fc', bg: 'rgba(192,132,252,.16)' },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

function rolePill(role: string) {
  return ROLE_PILL[role] ?? { color: '#9fb0c7', bg: 'rgba(159,176,199,.16)' };
}

function statusTone(row: AdminRow): { label: string; color: string } {
  if (!row.isActive) return { label: 'مسدود', color: '#f87171' };
  if (row.online) return { label: 'آنلاین', color: '#34d399' };
  return { label: 'آفلاین', color: '#6b7b94' };
}

const inputClass =
  'w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3.5 py-2.5 text-sm text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]';

export default function AdminsPage() {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: '',
    email: '',
    username: '',
    role: 'IT_MANAGER' as AdminCreatableRole,
    password: '',
    delivery: 'sms' as 'sms' | 'email',
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');
  const stepUp = useStepUp('ADMIN_ROLE_CHANGE');
  const rowsPager = usePagination(rows ?? []);

  function reload() {
    fetchAdmins()
      .then((data) => {
        setRows(data);
        setSelected((prev) => (prev ? (data.find((r) => r.id === prev.id) ?? null) : null));
      })
      .catch(() => setError('خطا در دریافت فهرست مدیران.'));
  }

  useEffect(reload, []);

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setAddForm((f) => ({ ...f, password: out }));
  }

  async function onSubmitAdd() {
    const { fullName, email, username, password } = addForm;
    if (!fullName.trim() || !email.trim() || !username.trim() || password.length < 6) {
      setAddError('همهٔ فیلدها الزامی است و رمز باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    setAddError(null);
    try {
      const fields = await stepUp.confirm();
      await createAdmin({ ...addForm, ...fields });
      setAddOpen(false);
      setNotice(
        `مدیر جدید افزوده شد و رمز عبور از طریق ${addForm.delivery === 'sms' ? 'پیامک' : 'ایمیل سازمانی'} ارسال شد ✓`,
      );
      reload();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setAddError(err instanceof ApiRequestError ? err.message : 'خطا در ایجاد حساب.');
    }
  }

  async function onToggleBlock(row: AdminRow) {
    try {
      if (row.isActive) await blockAdmin(row.id);
      else await unblockAdmin(row.id);
      setNotice(row.isActive ? `ورود «${row.fullName}» مسدود شد.` : `ورود «${row.fullName}» فعال شد.`);
      reload();
    } catch {
      setError('خطا در تغییر وضعیت ورود.');
    }
  }

  async function onResetPassword(row: AdminRow, explicit?: string) {
    try {
      const result = await resetAdminPassword(row.id, explicit ? { password: explicit } : {});
      setTempPassword(result.tempPassword);
      setNewPass('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'خطا در بازنشانی رمز.');
    }
  }

  if (error) {
    return <p className="px-[21px] py-[18px] text-sm text-[#f87171]">{error}</p>;
  }
  if (!rows) {
    return <p className="px-[21px] py-[18px] text-sm text-[#6b7b94]">در حال بارگذاری…</p>;
  }

  if (selected) {
    const pill = rolePill(selected.role);
    return (
      <div className="px-[21px] pb-[34px] pt-[18px]">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#9fb0c7] hover:text-white"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
          بازگشت به فهرست ادمین‌ها
        </button>

        <div className="mb-[15px] flex flex-wrap items-center gap-[15px] rounded-2xl border border-[#2a3550] bg-gradient-to-l from-[#1d2a44] to-[#172339] p-4">
          <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#9333ea] text-base font-black text-white">
            {initials(selected.fullName)}
          </span>
          <div className="leading-relaxed">
            <div className="text-lg font-black text-white">{selected.fullName}</div>
            <div className="ltr font-num text-[11.5px] text-[#9fb0c7]">{selected.email}</div>
          </div>
          <span
            className="mr-auto rounded-[18px] px-[11px] py-1.5 text-[11.5px] font-bold"
            style={{ color: pill.color, background: pill.bg }}
          >
            {selected.roleLabelFa}
          </span>
        </div>

        <div className="max-w-xl rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-1 text-[13.5px] font-extrabold text-white">امنیت و دسترسی ورود</div>
          <p className="mb-4 text-[11.5px] text-[#6b7b94]">
            رمز عبور این مدیر را تغییر دهید یا ورود او به پنل را مسدود/فعال کنید.
          </p>

          <div className="mb-[18px] flex items-center justify-between gap-2.5 rounded-[11px] bg-[#0f1726] px-[13px] py-[11px]">
            <div className="text-xs font-bold text-[#e7ecf3]">وضعیت ورود به پنل</div>
            <span
              className={`rounded-2xl px-[11px] py-1.5 text-[11px] font-extrabold ${
                selected.isActive
                  ? 'bg-[rgba(52,211,153,.14)] text-[#34d399]'
                  : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
              }`}
            >
              {selected.isActive ? 'فعال' : 'مسدود'}
            </span>
          </div>

          <label className="mb-2 block text-[11.5px] font-bold text-[#e7ecf3]">تغییر رمز عبور</label>
          <div className="mb-[11px] flex gap-2">
            <input
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              dir="ltr"
              placeholder="رمز جدید (حداقل ۶ کاراکتر)"
              className={`${inputClass} font-num flex-1 text-left`}
            />
            <button
              type="button"
              disabled={newPass.length < 6}
              onClick={() => void onResetPassword(selected, newPass)}
              className="rounded-[11px] bg-[#3b82f6] px-[18px] text-xs font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              تغییر و ارسال
            </button>
          </div>
          <button
            type="button"
            onClick={() => void onResetPassword(selected)}
            className="mb-5 w-full rounded-[11px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] py-2.5 text-xs font-extrabold text-[#60a5fa] transition hover:bg-[rgba(59,130,246,.2)]"
          >
            تولید رمز موقت
          </button>

          {selected.managedByCaller && (
            <button
              type="button"
              onClick={() => void onToggleBlock(selected)}
              className={`flex h-[46px] w-full items-center justify-center rounded-[11px] text-[12.5px] font-extrabold text-white transition hover:brightness-110 ${
                selected.isActive ? 'bg-[#f87171]' : 'bg-[#16a34a]'
              }`}
            >
              {selected.isActive ? 'مسدودسازی ورود به پنل' : 'فعال‌سازی ورود به پنل'}
            </button>
          )}
        </div>

        {tempPassword && (
          <Modal title="بازنشانی رمز عبور" onClose={() => setTempPassword(null)} variant="dark">
            <p className="mb-3 text-xs text-[#6b7b94]">رمز موقت تولیدشده — فقط همین یک بار نمایش داده می‌شود:</p>
            <div className="ltr font-num mb-4 rounded-[11px] bg-[#0f1623] p-3 text-center text-base font-black text-[#34d399]">
              {tempPassword}
            </div>
            <p className="mb-4 text-[11px] leading-6 text-[#6b7b94]">
              این رمز برای مدیر ارسال می‌شود و در اولین ورود باید تغییر کند.
            </p>
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className="w-full rounded-[11px] bg-[#3b82f6] py-2.5 text-sm font-bold text-white"
            >
              تأیید و ارسال
            </button>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6">
        <h1 className="text-[20.5px] font-black text-white">مدیران</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">کاربران مدیریتی، افزودن و تعیین سطوح دسترسی</p>
      </div>

      {notice && (
        <p className="mb-4 rounded-[11px] border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.1)] p-3 text-xs font-bold text-[#34d399]">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="flex items-center justify-between border-b border-[#1f2a3d] px-[15px] py-3">
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">مدیران</h2>
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-[11px] py-[7px] text-[11.5px] font-bold text-white transition hover:brightness-110"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            افزودن مدیر / ادمین
          </button>
        </div>

        <div className="px-2 py-[5px]">
          <div className="grid grid-cols-[2fr_1.6fr_1.2fr_1fr_0.5fr] border-b border-[#1f2a3d] px-[11px] py-2.5 text-[11px] font-bold text-[#6b7b94]">
            <span>نام</span>
            <span>نقش</span>
            <span>آخرین ورود</span>
            <span>وضعیت</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <div className="px-[11px] py-[22px] text-center text-[11.5px] text-[#6b7b94]">
              هنوز اطلاعاتی وارد نشده است.
            </div>
          ) : (
            rowsPager.pageItems.map((r) => {
              const pill = rolePill(r.role);
              const status = statusTone(r);
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="grid w-full grid-cols-[2fr_1.6fr_1.2fr_1fr_0.5fr] items-center px-[11px] py-3 text-right text-xs transition hover:bg-[#18223a]"
                >
                  <div className="flex items-center gap-[9px]">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#9333ea] text-[11px] font-extrabold text-white">
                      {initials(r.fullName)}
                    </span>
                    <div className="min-w-0 leading-snug">
                      <div className="truncate font-semibold text-[#e7ecf3]">{r.fullName}</div>
                      <div className="ltr font-num truncate text-[10.5px] text-[#6b7b94]">{r.email}</div>
                    </div>
                  </div>
                  <span>
                    <span
                      className="inline-block rounded-[18px] px-2.5 py-1 text-[11px] font-bold"
                      style={{ color: pill.color, background: pill.bg }}
                    >
                      {r.roleLabelFa}
                    </span>
                  </span>
                  <span className="font-num text-[#9fb0c7]">
                    {r.lastLoginAt ? formatJalaliDateTime(r.lastLoginAt) : '—'}
                  </span>
                  <span className="inline-flex items-center gap-[5px] text-[11.5px]" style={{ color: status.color }}>
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: status.color }} />
                    {status.label}
                  </span>
                  <span className="flex justify-start text-[#6b7b94]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <Pagination
          page={rowsPager.page}
          totalPages={rowsPager.totalPages}
          onChange={rowsPager.setPage}
          variant="dark"
        />
      </div>

      {addOpen && (
        <Modal
          title="افزودن مدیر / ادمین"
          onClose={() => setAddOpen(false)}
          variant="dark"
          maxWidthClass="max-w-[580px]"
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="na-name" className="mb-1.5 block text-[11.5px] font-bold text-[#e7ecf3]">
                  نام و نام خانوادگی
                </label>
                <input
                  id="na-name"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="مثلاً نیما رضوی"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="na-email" className="mb-1.5 block text-[11.5px] font-bold text-[#e7ecf3]">
                  ایمیل سازمانی
                </label>
                <input
                  id="na-email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name@blujet.ir"
                  className={`${inputClass} ltr text-left`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="na-username" className="mb-1.5 block text-[11.5px] font-bold text-[#e7ecf3]">
                نام کاربری
              </label>
              <input
                id="na-username"
                value={addForm.username}
                onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                className={`${inputClass} ltr text-left`}
              />
            </div>
            <div>
              <label htmlFor="na-role" className="mb-1.5 block text-[11.5px] font-bold text-[#e7ecf3]">
                نقش / سطح دسترسی
              </label>
              <select
                id="na-role"
                value={addForm.role}
                onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as AdminCreatableRole }))}
                className={`${inputClass} bg-[#0f1623]`}
              >
                {CREATABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="na-pass" className="mb-1.5 block text-[11.5px] font-bold text-[#e7ecf3]">
                رمز عبور ورود (حداقل ۶ کاراکتر)
              </label>
              <div className="flex gap-2">
                <input
                  id="na-pass"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  className={`${inputClass} font-num flex-1 text-left`}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="rounded-[11px] border border-[#28344c] px-3 text-[11px] font-bold text-[#9fb0c7] transition hover:border-[#3b82f6] hover:text-[#60a5fa]"
                >
                  تولید خودکار
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6b7b94]">
              <span>روش ارسال رمز عبور به مدیر:</span>
              {(['sms', 'email'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAddForm((f) => ({ ...f, delivery: d }))}
                  className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-[7px] text-[11.5px] font-bold transition ${
                    addForm.delivery === d
                      ? 'border-[#3b82f6] bg-[rgba(59,130,246,.12)] text-[#e7ecf3]'
                      : 'border-[#28344c] text-[#9fb0c7]'
                  }`}
                >
                  <span
                    className={`flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 ${
                      addForm.delivery === d ? 'border-[#3b82f6]' : 'border-[#28344c]'
                    }`}
                  >
                    {addForm.delivery === d && (
                      <span className="h-[7px] w-[7px] rounded-full bg-[#3b82f6]" />
                    )}
                  </span>
                  {d === 'sms' ? 'پیامک' : 'ایمیل سازمانی'}
                </button>
              ))}
            </div>
            {addError && (
              <p role="alert" className="text-xs text-[#f87171]">
                {addError}
              </p>
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => void onSubmitAdd()}
                className="flex-1 rounded-[11px] bg-[#3b82f6] py-2.5 text-sm font-extrabold text-white transition hover:brightness-110"
              >
                افزودن و تعیین دسترسی
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-[11px] border border-[#28344c] px-[18px] text-[12.5px] font-semibold text-[#9fb0c7]"
              >
                انصراف
              </button>
            </div>
          </div>
        </Modal>
      )}
      {stepUp.modal}
    </div>
  );
}
