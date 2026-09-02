import { useEffect, useState } from 'react';
import {
  blockAdmin,
  createAdmin,
  fetchAdmins,
  resetAdminPassword,
  unblockAdmin,
  updateAdminPermissions,
} from '../../api/admins';
import { ApiRequestError } from '../../api/envelope';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import { useStepUp } from '../../hooks/useStepUp';
import { useAuth } from '../../hooks/useAuth';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import type { AdminCreatableRole, AdminRow } from '../../types/admins';
import { panelInitials } from '../panel/panel-nav-icons';
import PanelAlert from '../panel/PanelAlert';
import PanelModal from '../panel/PanelModal';
import {
  panelBtnGhost,
  panelBtnPrimary,
  panelCard,
  panelInput,
  panelMuted,
  panelMuted2,
  panelText,
  panelTitle,
} from '../panel/panel-theme';
import {
  deriveUsernameFromEmail,
  enabledPermissionKeys,
  PERM_DEFS,
  permissionStateFromKeys,
  rolePermissionPreset,
  type PermKey,
  type PermState,
} from './admin-permissions';

const CREATABLE_ROLES: { value: AdminCreatableRole; label: string }[] = [
  { value: 'SENIOR_MANAGER', label: 'مدیر ارشد' },
  { value: 'FINANCE_MANAGER', label: 'مدیر مالی' },
  { value: 'COMMERCIAL_MANAGER', label: 'مدیر بازرگانی' },
  { value: 'IT_MANAGER', label: 'مدیر IT' },
  { value: 'SITE_ADMIN', label: 'ادمین سایت' },
];

const ROLE_BADGE: Record<string, { color: string; bg: string }> = {
  SENIOR_MANAGER: { color: '#f97316', bg: 'rgba(249,115,22,.16)' },
  FINANCE_MANAGER: { color: '#3b82f6', bg: 'rgba(59,130,246,.16)' },
  COMMERCIAL_MANAGER: { color: '#22d3ee', bg: 'rgba(34,211,238,.16)' },
  IT_MANAGER: { color: '#60a5fa', bg: 'rgba(96,165,250,.16)' },
  SITE_ADMIN: { color: '#a855f7', bg: 'rgba(168,85,247,.16)' },
};

function formatRelativeFa(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return 'همین الان';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${faDigits(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${faDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${faDigits(days)} روز پیش`;
  return formatJalaliDateTime(iso);
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%';
  let out = '';
  const unbiasedLimit = Math.floor(256 / chars.length) * chars.length;
  while (out.length < 10) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    for (const value of randomBytes) {
      if (value >= unbiasedLimit) continue;
      out += chars[value % chars.length];
      if (out.length === 10) break;
    }
  }
  return out;
}

function RoleBadge({ label, role }: { label: string; role: string }) {
  const style = ROLE_BADGE[role] ?? {
    color: '#9fb0c7',
    bg: 'rgba(159,176,199,.16)',
  };
  return (
    <span
      className="inline-block rounded-[18px] px-2.5 py-1 text-[11px] font-bold"
      style={{ color: style.color, background: style.bg }}
    >
      {label}
    </span>
  );
}

function StatusDot({ row }: { row: AdminRow }) {
  if (!row.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#f87171]">
        <span className="h-[7px] w-[7px] rounded-full bg-[#f87171]" />
        مسدود
      </span>
    );
  }
  if (row.online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#34d399]">
        <span className="h-[7px] w-[7px] rounded-full bg-[#34d399]" />
        آنلاین
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#6b7b94]">
      <span className="h-[7px] w-[7px] rounded-full bg-[#6b7b94]" />
      آفلاین
    </span>
  );
}

function PermToggle({
  on,
  onChange,
  large,
  label,
}: {
  on: boolean;
  onChange: () => void;
  large?: boolean;
  label: string;
}) {
  const h = large ? 'h-[26px] w-[46px]' : 'h-[25px] w-11';
  const knob = large ? 'h-5 w-5 top-[3px]' : 'h-5 w-5 top-[2.5px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative shrink-0 rounded-[13px] transition ${h} ${on ? 'bg-panel-accent' : 'bg-[#28344c]'}`}
    >
      <span
        className={`absolute rounded-full transition-all ${knob} ${on ? 'right-[2.5px] bg-white' : 'left-[2.5px] bg-[#6b7b94]'}`}
      />
    </button>
  );
}

function DeliveryCards({
  value,
  onChange,
  label,
  compact,
}: {
  value: 'sms' | 'email';
  onChange: (v: 'sms' | 'email') => void;
  label?: string;
  compact?: boolean;
}) {
  const options: { id: 'sms' | 'email'; label: string }[] = [
    { id: 'sms', label: 'پیامک' },
    { id: 'email', label: 'ایمیل سازمانی' },
  ];

  return (
    <div>
      {label ? (
        <div className={`mb-2 text-[11px] ${panelMuted}`}>{label}</div>
      ) : null}
      <div className={`flex gap-2 ${compact ? 'flex-wrap' : ''}`}>
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-[11px] border-[1.5px] px-[11px] transition ${
                compact ? 'py-[7px]' : 'py-2.5'
              } ${
                selected
                  ? 'border-[#3b82f6] bg-[rgba(59,130,246,.12)]'
                  : 'border-[#28344c] bg-[#0f1623]'
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-[#3b82f6]' : 'border-[#28344c]'
                }`}
              >
                {selected ? (
                  <span className="h-[9px] w-[9px] rounded-full bg-[#3b82f6]" />
                ) : null}
              </span>
              <span className={`text-[11.5px] font-bold ${panelText}`}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PermissionsList({
  perms,
  onToggle,
  boxed,
  largeToggles,
}: {
  perms: PermState;
  onToggle: (key: PermKey) => void;
  boxed?: boolean;
  largeToggles?: boolean;
}) {
  const inner = PERM_DEFS.map((pd, idx) => (
    <div
      key={pd.key}
      className={`flex items-center justify-between py-2.5 ${
        idx < PERM_DEFS.length - 1 ? 'border-b border-[#22304a]' : ''
      } ${boxed ? '' : 'border-b border-[#1a2436] px-[3px] py-[11px] last:border-b-0'}`}
    >
      <div className="leading-snug">
        <div
          className={`font-semibold ${panelText} ${boxed ? 'text-xs' : 'text-[12.5px]'}`}
        >
          {pd.label}
        </div>
        <div
          className={`text-[10.5px] ${panelMuted} ${boxed ? '' : 'text-[11px]'}`}
        >
          {pd.desc}
        </div>
      </div>
      <PermToggle
        on={perms[pd.key]}
        onChange={() => onToggle(pd.key)}
        large={largeToggles}
        label={pd.label}
      />
    </div>
  ));

  if (boxed) {
    return (
      <div className="rounded-[13px] border border-[#28344c] bg-[#18223a] px-[11px] py-[5px]">
        {inner}
      </div>
    );
  }
  return <div className="flex flex-col gap-[3px]">{inner}</div>;
}

const RefreshIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

/** Dark management-panel admins tab — design-reference-v2/پنل رئیس هیئت مدیره.dc.html */
export default function PanelAdminsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: '',
    email: '',
    role: 'IT_MANAGER' as AdminCreatableRole,
  });
  const [addPerms, setAddPerms] = useState<PermState>(() =>
    rolePermissionPreset('IT_MANAGER'),
  );
  const [addError, setAddError] = useState(false);
  const [detailPerms, setDetailPerms] = useState<PermState | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdCredential, setCreatedCredential] = useState<{
    fullName: string;
    username: string;
    tempPassword: string;
  } | null>(null);
  const [newPass, setNewPass] = useState('');
  const [cpSuggested, setCpSuggested] = useState('');
  const [resetDelivery, setResetDelivery] = useState<'sms' | 'email'>('sms');
  const stepUp = useStepUp('ADMIN_ROLE_CHANGE');
  const rowsPager = usePagination(rows ?? []);

  function reload() {
    fetchAdmins()
      .then((data) => {
        setRows(data);
        setSelected((prev) =>
          prev ? (data.find((r) => r.id === prev.id) ?? null) : null,
        );
      })
      .catch(() => setError('خطا در دریافت فهرست مدیران.'));
  }

  useEffect(reload, []);

  function openAddModal() {
    setAddError(false);
    setAddForm({
      fullName: '',
      email: '',
      role: 'IT_MANAGER',
    });
    setAddPerms(rolePermissionPreset('IT_MANAGER'));
    setAddOpen(true);
  }

  function pickAddRole(role: AdminCreatableRole) {
    setAddForm((f) => ({ ...f, role }));
    setAddPerms(rolePermissionPreset(role));
  }

  function toggleAddPerm(key: PermKey) {
    setAddPerms((p) => ({ ...p, [key]: !p[key] }));
  }

  function openDetail(row: AdminRow) {
    setSelected(row);
    setDetailPerms(
      row.permissions === null
        ? rolePermissionPreset(row.role as AdminCreatableRole)
        : permissionStateFromKeys(
            row.permissions,
            row.role as AdminCreatableRole,
          ),
    );
    setNewPass('');
    setCpSuggested('');
    setResetDelivery('sms');
  }

  async function onSubmitAdd() {
    const { fullName, email, role } = addForm;
    if (!fullName.trim() || !email.trim()) {
      setAddError(true);
      return;
    }
    setAddError(false);
    const username = deriveUsernameFromEmail(email);
    const password = generatePassword();
    try {
      const fields = await stepUp.confirm();
      const created = await createAdmin({
        fullName,
        email,
        username,
        role,
        password,
        delivery: 'email',
        permissions: enabledPermissionKeys(addPerms, role),
        ...fields,
      });
      setAddOpen(false);
      setCreatedCredential({
        fullName: fullName.trim(),
        username,
        tempPassword: created.tempPassword ?? password,
      });
      setNotice('حساب مدیر جدید ایجاد و دسترسی‌ها از سمت سرور اعمال شد ✓');
      reload();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setAddError(true);
    }
  }

  async function onToggleBlock(row: AdminRow) {
    try {
      if (row.isActive) await blockAdmin(row.id);
      else await unblockAdmin(row.id);
      setNotice(
        row.isActive
          ? `ورود «${row.fullName}» مسدود شد.`
          : `ورود «${row.fullName}» فعال شد.`,
      );
      reload();
    } catch {
      setError('خطا در تغییر وضعیت ورود.');
    }
  }

  async function onSavePermissions(row: AdminRow, perms: PermState) {
    try {
      const fields = await stepUp.confirm();
      await updateAdminPermissions(row.id, {
        permissions: enabledPermissionKeys(perms, row.role as AdminCreatableRole),
        ...fields,
      });
      setNotice('سطح دسترسی با موفقیت ذخیره و از سمت سرور اعمال شد.');
      setSelected(null);
      reload();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'خطا در ذخیره سطح دسترسی.',
      );
    }
  }

  async function onResetPassword(row: AdminRow, explicit?: string) {
    try {
      const result = await resetAdminPassword(row.id, {
        ...(explicit ? { password: explicit } : {}),
        delivery: resetDelivery,
      });
      setTempPassword(result.tempPassword);
      setNewPass('');
      setCpSuggested('');
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'خطا در بازنشانی رمز.',
      );
    }
  }

  if (error) return <PanelAlert>{error}</PanelAlert>;
  if (!rows) return <p className={`text-sm ${panelMuted}`}>در حال بارگذاری…</p>;

  if (selected && detailPerms) {
    const rolePreset = rolePermissionPreset(
      selected.role as AdminCreatableRole,
    );

    return (
      <div className="flex flex-col gap-[15px]">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`inline-flex w-max items-center gap-1.5 text-xs ${panelMuted2} transition hover:text-white`}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          بازگشت به فهرست ادمین‌ها
        </button>

        <div className="flex flex-wrap items-center gap-[15px] rounded-2xl border border-[#2a3550] bg-gradient-to-br from-[#172339] to-[#1d2a44] p-4">
          <span className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#9333ea] text-base font-black text-white">
            {panelInitials(selected.fullName)}
          </span>
          <div className="min-w-0 leading-snug">
            <div className="text-lg font-black text-white">
              {selected.fullName}
            </div>
            <div className={`font-num ltr text-[11.5px] ${panelMuted2}`}>
              {selected.email ?? '—'}
            </div>
          </div>
          <span className="mr-auto">
            <RoleBadge label={selected.roleLabelFa} role={selected.role} />
          </span>
        </div>

        <div className={`${panelCard} p-[15px]`}>
          <h3 className={`mb-1 text-[13.5px] ${panelTitle}`}>سطح دسترسی</h3>
          <p className={`mb-[18px] text-[11.5px] ${panelMuted}`}>
            دسترسی‌های این ادمین را با کلید‌های زیر تعیین کنید.
          </p>
          <PermissionsList
            perms={detailPerms}
            onToggle={(key) =>
              setDetailPerms((p) => ({ ...p!, [key]: !p![key] }))
            }
            largeToggles
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSavePermissions(selected, detailPerms)}
              className={`flex h-[46px] items-center justify-center px-[21px] text-[12.5px] font-extrabold ${panelBtnPrimary}`}
            >
              ذخیره سطح دسترسی
            </button>
            <button
              type="button"
              onClick={() => {
                setDetailPerms({ ...rolePreset });
                setSelected(null);
              }}
              className={`flex h-[46px] items-center justify-center px-[18px] text-[12.5px] font-semibold ${panelBtnGhost}`}
            >
              انصراف
            </button>
          </div>
        </div>

        <div className={`${panelCard} p-[15px]`}>
          <h3 className={`mb-1 text-[13.5px] ${panelTitle}`}>
            امنیت و دسترسی ورود
          </h3>
          <p className={`mb-4 text-[11.5px] ${panelMuted}`}>
            رمز عبور این مدیر را تغییر دهید یا ورود او به پنل را مسدود/فعال
            کنید.
          </p>

          <div className="mb-[18px] flex items-center justify-between gap-2.5 rounded-[11px] bg-[#0f1726] px-[13px] py-[11px]">
            <div className="leading-snug">
              <div className={`text-xs font-bold ${panelText}`}>
                وضعیت ورود به پنل
              </div>
              <div className={`text-[10.5px] ${panelMuted}`}>
                نقش: {selected.roleLabelFa}
              </div>
            </div>
            <span
              className={`rounded-2xl px-[11px] py-1.5 text-[11px] font-extrabold ${
                selected.isActive
                  ? 'bg-[rgba(52,211,153,.16)] text-[#34d399]'
                  : 'bg-[rgba(248,113,113,.16)] text-[#f87171]'
              }`}
            >
              {selected.isActive ? 'فعال' : 'مسدود'}
            </span>
          </div>

          <label className={`mb-2 block text-[11.5px] font-bold ${panelText}`}>
            تغییر رمز عبور
          </label>
          <div className="mb-[11px] flex flex-wrap gap-2">
            <input
              dir="ltr"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="رمز جدید (حداقل ۶ کاراکتر)"
              className={`font-num ltr min-w-[180px] flex-1 px-3 py-2.5 text-left text-[12.5px] ${panelInput}`}
            />
            <button
              type="button"
              onClick={() => setCpSuggested(generatePassword())}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[11.5px] font-bold ${panelBtnGhost}`}
            >
              <RefreshIcon />
              تولید رمز
            </button>
            <button
              type="button"
              disabled={newPass.length < 6}
              onClick={() => void onResetPassword(selected, newPass)}
              className={`px-[18px] py-2.5 text-xs font-extrabold disabled:opacity-50 ${panelBtnPrimary}`}
            >
              تغییر و ارسال
            </button>
          </div>

          {cpSuggested ? (
            <div className="mb-[11px] flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.08)] px-3 py-2">
              <span className={`text-[11px] ${panelMuted}`}>پیشنهاد:</span>
              <span className="font-num ltr text-[12.5px] font-bold text-white">
                {cpSuggested}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewPass(cpSuggested);
                  setCpSuggested('');
                }}
                className="mr-auto text-[11px] font-bold text-[#3b82f6]"
              >
                استفاده از این رمز
              </button>
            </div>
          ) : null}

          <div className="mb-5">
            <DeliveryCards
              value={resetDelivery}
              onChange={setResetDelivery}
              label="ارسال از طریق:"
              compact
            />
          </div>

          {selected.managedByCaller && (
            <button
              type="button"
              onClick={() => void onToggleBlock(selected)}
              className={`flex h-[46px] w-full items-center justify-center rounded-[11px] text-[12.5px] font-extrabold text-white transition hover:brightness-110 ${
                selected.isActive ? 'bg-[#f87171]' : 'bg-[#16a34a]'
              }`}
            >
              {selected.isActive
                ? 'مسدودسازی ورود به پنل'
                : 'فعال‌سازی ورود به پنل'}
            </button>
          )}
        </div>

        {tempPassword && (
          <PanelModal
            title="بازنشانی رمز عبور"
            onClose={() => setTempPassword(null)}
          >
            <p className={`mb-3 text-xs ${panelMuted}`}>
              رمز موقت تولیدشده — فقط همین یک بار نمایش داده می‌شود:
            </p>
            <div className="font-num mb-4 rounded-[11px] bg-[#0f1726] p-3 text-center text-base font-black text-[#34d399]">
              {tempPassword}
            </div>
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className={`w-full py-2.5 ${panelBtnPrimary}`}
            >
              تأیید
            </button>
          </PanelModal>
        )}
      </div>
    );
  }

  return (
    <div>
      {notice && <PanelAlert tone="success">{notice}</PanelAlert>}

      <div className={`${panelCard} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-panel-border px-[15px] py-3">
          <h3 className={`m-0 text-[14.5px] ${panelTitle}`}>مدیران</h3>
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-[9px] bg-panel-accent px-[11px] py-[7px] text-[11.5px] font-bold text-white transition hover:brightness-110"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            افزودن مدیر / ادمین
          </button>
        </div>

        <div className="px-2 py-[5px]">
          <div
            className={`hidden grid-cols-[2fr_1.6fr_1.2fr_1fr_0.5fr] border-b border-panel-border px-[11px] py-2.5 text-[11px] font-bold md:grid ${panelMuted}`}
          >
            <span>نام</span>
            <span>نقش</span>
            <span>آخرین ورود</span>
            <span>وضعیت</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <p className={`py-[22px] text-center text-[11.5px] ${panelMuted}`}>
              هنوز اطلاعاتی وارد نشده است.
            </p>
          ) : (
            rowsPager.pageItems.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openDetail(r)}
                className="grid w-full grid-cols-1 items-center gap-2 border-b border-[#1b2536] px-[11px] py-3 text-right transition last:border-b-0 hover:bg-[#18223a] md:grid-cols-[2fr_1.6fr_1.2fr_1fr_0.5fr] md:gap-0"
              >
                <div className="flex items-center gap-[9px]">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#9333ea] text-[11px] font-extrabold text-white">
                    {panelInitials(r.fullName)}
                  </span>
                  <div className="min-w-0 leading-snug">
                    <div className={`text-xs font-semibold ${panelText}`}>
                      {r.fullName}
                    </div>
                    <div className={`font-num ltr text-[10.5px] ${panelMuted}`}>
                      {r.email ?? '—'}
                    </div>
                  </div>
                </div>
                <div className="md:block">
                  <RoleBadge label={r.roleLabelFa} role={r.role} />
                </div>
                <div className={`font-num text-xs ${panelMuted2}`}>
                  {formatRelativeFa(r.lastLoginAt)}
                </div>
                <div>
                  <StatusDot row={r} />
                </div>
                <span className={`hidden justify-end ${panelMuted} md:flex`}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </span>
              </button>
            ))
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
        <PanelModal
          title="افزودن مدیر / ادمین"
          onClose={() => setAddOpen(false)}
          wide
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onSubmitAdd()}
                className={`flex h-[46px] flex-1 items-center justify-center gap-1.5 text-[12.5px] font-extrabold ${panelBtnPrimary}`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                افزودن و تعیین دسترسی
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className={`flex h-[46px] shrink-0 items-center justify-center px-[18px] text-[12.5px] font-semibold ${panelBtnGhost}`}
              >
                انصراف
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-[13px]">
            <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2">
              <div>
                <label
                  htmlFor="pa-name"
                  className={`mb-2 block text-[11.5px] font-bold ${panelText}`}
                >
                  نام و نام خانوادگی <span className="text-[#f87171]">*</span>
                </label>
                <input
                  id="pa-name"
                  value={addForm.fullName}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  placeholder="مثلاً نیما رضوی"
                  className={`h-[46px] w-full px-[11px] text-xs ${panelInput} ${addError && !addForm.fullName.trim() ? 'border-[#f87171]' : ''}`}
                />
              </div>
              <div>
                <label
                  htmlFor="pa-email"
                  className={`mb-2 block text-[11.5px] font-bold ${panelText}`}
                >
                  ایمیل سازمانی <span className="text-[#f87171]">*</span>
                </label>
                <input
                  id="pa-email"
                  dir="ltr"
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="name@aseman.ir"
                  className={`font-num ltr h-[46px] w-full px-[11px] text-left text-xs ${panelInput} ${addError && !addForm.email.trim() ? 'border-[#f87171]' : ''}`}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="pa-role"
                className={`mb-2 block text-[11.5px] font-bold ${panelText}`}
              >
                نقش / سطح دسترسی
              </label>
              <select
                id="pa-role"
                value={addForm.role}
                onChange={(e) =>
                  pickAddRole(e.target.value as AdminCreatableRole)
                }
                className={`h-[46px] w-full cursor-pointer px-[11px] text-xs ${panelInput}`}
              >
                {CREATABLE_ROLES.filter(
                  (role) => user?.role !== 'SENIOR_MANAGER' || role.value !== 'SENIOR_MANAGER',
                ).map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className={`mt-[7px] text-[11px] ${panelMuted}`}>
                با انتخاب نقش، دسترسی‌های پیش‌فرض آن اعمال می‌شود و می‌توانید
                آن‌ها را تغییر دهید.
              </p>
            </div>

            <PermissionsList perms={addPerms} onToggle={toggleAddPerm} boxed />

            {addError ? (
              <p
                role="alert"
                className="text-[11.5px] font-semibold text-[#f87171]"
              >
                نام و ایمیل سازمانی معتبر الزامی است.
              </p>
            ) : null}
          </div>
        </PanelModal>
      )}

      {createdCredential && (
        <PanelModal
          title="حساب مدیر ایجاد شد"
          onClose={() => setCreatedCredential(null)}
          footer={
            <button
              type="button"
              onClick={() => setCreatedCredential(null)}
              className={`h-[42px] w-full text-xs font-bold ${panelBtnPrimary}`}
            >
              بستن
            </button>
          }
        >
          <div className="space-y-3 text-xs text-[#cdd9ec]">
            <p>
              حساب «{createdCredential.fullName}» ایجاد شد. این رمز اولیه فقط همین یک‌بار نمایش داده
              می‌شود و کاربر در اولین ورود ملزم به تغییر آن است.
            </p>
            <div className="rounded-xl border border-[#28344c] bg-[#0f1623] p-3" dir="ltr">
              <div>Username: <strong>{createdCredential.username}</strong></div>
              <div className="mt-2">Temporary password: <strong>{createdCredential.tempPassword}</strong></div>
            </div>
          </div>
        </PanelModal>
      )}

      {stepUp.modal}
    </div>
  );
}
