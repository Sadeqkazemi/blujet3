import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { SandboxTenantAccount } from '../api/auth';

export default function SuperAdminSandboxAccess() {
  const { user, listSandboxTenantAccounts, startSandboxImpersonation } =
    useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SandboxTenantAccount[]>([]);
  const [selected, setSelected] = useState<Record<'USER' | 'AGENCY', string>>({
    USER: '',
    AGENCY: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.isSuperAdmin || !listSandboxTenantAccounts) return;
    listSandboxTenantAccounts()
      .then((rows) => {
        setAccounts(rows);
        setSelected({
          USER: rows.find((row) => row.role === 'USER')?.id ?? '',
          AGENCY: rows.find((row) => row.role === 'AGENCY')?.id ?? '',
        });
      })
      .catch(() =>
        setError('دسترسی Sandbox فعال نیست یا حساب آزمایشی یافت نشد.'),
      );
  }, [user?.isSuperAdmin, listSandboxTenantAccounts]);

  const grouped = useMemo(
    () => ({
      USER: accounts.filter((row) => row.role === 'USER'),
      AGENCY: accounts.filter((row) => row.role === 'AGENCY'),
    }),
    [accounts],
  );

  if (!user?.isSuperAdmin) return null;

  async function enter(role: 'USER' | 'AGENCY') {
    const targetUserId = selected[role];
    if (!targetUserId || !startSandboxImpersonation) return;
    setBusy(true);
    setError(null);
    try {
      await startSandboxImpersonation(targetUserId);
      navigate(role === 'AGENCY' ? '/agency' : '/account');
    } catch {
      setError('شروع نشست آزمایشی انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mx-[5px] mb-3 rounded-[11px] border border-amber-400/40 bg-amber-400/10 p-2.5"
      data-testid="sandbox-tenant-access"
    >
      <div className="mb-2 text-[10px] font-extrabold text-amber-300">
        دسترسی آزمایشی Sandbox
      </div>
      <p className="mb-2 text-[9px] leading-4 text-amber-100/80">
        عملیات این نشست روی داده‌های تست اعمال می‌شود.
      </p>
      {(['USER', 'AGENCY'] as const).map((role) => (
        <div className="mb-2 last:mb-0" key={role}>
          <select
            aria-label={
              role === 'USER' ? 'انتخاب کاربر آزمایشی' : 'انتخاب آژانس آزمایشی'
            }
            value={selected[role]}
            onChange={(event) =>
              setSelected((current) => ({
                ...current,
                [role]: event.target.value,
              }))
            }
            className="mb-1 h-8 w-full rounded-lg border border-[#33435e] bg-[#111b30] px-2 text-[10px] text-white"
          >
            {grouped[role].length === 0 && (
              <option value="">حسابی موجود نیست</option>
            )}
            {grouped[role].map((account) => (
              <option value={account.id} key={account.id}>
                {account.fullName}
                {account.username ? ` (${account.username})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selected[role]}
            onClick={() => void enter(role)}
            className="h-8 w-full rounded-lg bg-amber-400 text-[10.5px] font-extrabold text-slate-950 disabled:opacity-50"
          >
            {role === 'USER'
              ? 'ورود آزمایشی به پنل کاربر'
              : 'ورود آزمایشی به پنل آژانس'}
          </button>
        </div>
      ))}
      {error && <p className="mt-1 text-[9.5px] text-red-300">{error}</p>}
    </section>
  );
}
