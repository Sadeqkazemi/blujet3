import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function SandboxImpersonationBanner() {
  const { user, returnFromSandboxImpersonation } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!user?.isSandboxImpersonation) return null;

  async function returnToOwner() {
    if (!returnFromSandboxImpersonation) return;
    setBusy(true);
    try {
      await returnFromSandboxImpersonation();
      navigate('/panel', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-300 bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-2xl"
      dir="rtl"
    >
      <span>
        نشست آزمایشی: {user.role === 'AGENCY' ? 'پنل آژانس' : 'پنل کاربر'}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void returnToOwner()}
        className="rounded-lg bg-amber-400 px-3 py-1.5 text-slate-950 disabled:opacity-60"
      >
        {busy ? 'در حال بازگشت…' : 'بازگشت به سوپر ادمین'}
      </button>
    </div>
  );
}
