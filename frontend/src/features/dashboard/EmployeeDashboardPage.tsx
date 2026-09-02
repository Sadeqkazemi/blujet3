import { useEffect, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchCartable, fetchMyReferrals } from '../../api/cartable';
import { fetchEmployeeContext } from '../../api/panels';
import EmployeeUnitPill from '../../components/EmployeeUnitPill';
import { faDigits } from '../../lib/fa-format';
import type { EmployeeContext } from '../../types/panels';
import type { PanelShellContext } from '../../types/panel-shell';

function KpiIcon({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-[11px]"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

/**
 * پنل کارمند dashboard — KPI cards + permission chips (screenshot).
 */
export default function EmployeeDashboardPage() {
  const { nav } = useOutletContext<PanelShellContext>();
  const grantedSections = (nav ?? []).filter(
    (item) => item.key !== 'dashboard' && item.key !== 'referrals',
  );

  const [context, setContext] = useState<EmployeeContext | null>(null);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [openReferrals, setOpenReferrals] = useState<number | null>(null);

  const hasCartable = nav?.some((item) => item.key === 'cartable') ?? false;

  useEffect(() => {
    fetchEmployeeContext()
      .then(setContext)
      .catch(() => setContext(null));
  }, []);

  useEffect(() => {
    const tasks: Promise<void>[] = [];
    if (hasCartable) {
      tasks.push(
        fetchCartable()
          .then((r) => setOpenTasks(r.totalOpen))
          .catch(() => setOpenTasks(null)),
      );
    } else {
      setOpenTasks(null);
    }
    tasks.push(
      fetchMyReferrals()
        .then((r) => setOpenReferrals(r.counts.awaitingMyReport))
        .catch(() => setOpenReferrals(null)),
    );
    void Promise.all(tasks);
  }, [hasCartable]);

  const unitLabel = context?.deptLabelFa ?? '—';

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20.5px] font-black text-white">داشبورد کارمند</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            نمای کلی کارها و ارجاعات واحد {unitLabel !== '—' ? unitLabel : ''}
          </p>
        </div>
        <EmployeeUnitPill />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-[13px] sm:grid-cols-3">
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="mb-3 flex items-center justify-between">
            <KpiIcon bg="rgba(245,158,11,.16)" color="#f59e0b">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </KpiIcon>
          </div>
          <div className="font-num text-[22.5px] font-black text-white">
            {openTasks === null ? '—' : faDigits(openTasks)}
          </div>
          <div className="mt-1 text-[11.5px] text-[#6b7b94]">کارهای باز کارتابل</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="mb-3 flex items-center justify-between">
            <KpiIcon bg="rgba(168,85,247,.16)" color="#a855f7">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M16 3h5v5" />
                <path d="M8 3H3v5" />
                <path d="M12 22V8" />
                <path d="M21 8l-9 6L3 8" />
              </svg>
            </KpiIcon>
          </div>
          <div className="font-num text-[22.5px] font-black text-white">
            {openReferrals === null ? '—' : faDigits(openReferrals)}
          </div>
          <div className="mt-1 text-[11.5px] text-[#6b7b94]">ارجاعات در انتظار</div>
        </div>
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px]">
          <div className="mb-3 flex items-center justify-between">
            <KpiIcon bg="rgba(59,130,246,.16)" color="#3b82f6">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 21h18" />
                <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
                <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
              </svg>
            </KpiIcon>
          </div>
          <div className="text-[18px] font-black text-white">{unitLabel}</div>
          <div className="mt-1 text-[11.5px] text-[#6b7b94]">واحد سازمانی</div>
        </div>
      </div>

      {context && context.permissionLabelsFa.length > 0 && (
        <section className="mb-5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <h2 className="m-0 text-[14.5px] font-extrabold text-white">دسترسی‌های شما در این واحد</h2>
          </div>
          <p className="mt-1 text-[11px] text-[#6b7b94]">
            این دسترسی‌ها توسط مدیر IT مطابق واحد سازمانی شما تعیین شده است.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {context.permissionLabelsFa.map((label) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.08)] px-3 py-1.5 text-[11px] text-[#34d399]"
              >
                <span aria-hidden>✓</span>
                {label}
              </span>
            ))}
          </div>
        </section>
      )}

      {nav === null && <p className="text-xs text-[#6b7b94]">در حال بارگذاری…</p>}
      {nav !== null && grantedSections.length === 0 && (
        <p
          className="rounded-[14px] border border-dashed border-[#28344c] px-4 py-5 text-center text-xs text-[#6b7b94]"
          data-testid="employee-no-access"
        >
          هنوز هیچ دسترسی برای شما توسط مدیر IT فعال نشده است.
        </p>
      )}
    </div>
  );
}
