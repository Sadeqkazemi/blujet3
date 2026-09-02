import { useEffect, useState } from 'react';
import { fetchMyActivity } from '../../api/reporting';
import EmployeeUnitPill from '../../components/EmployeeUnitPill';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { EmployeeActivityItem } from '../../types/reporting';

const CATEGORY_META: Record<string, { label: string; className: string }> = {
  AGENCY: { label: 'پیگیری آژانس', className: 'bg-[rgba(59,130,246,.16)] text-[#60a5fa]' },
  RESERVATION: { label: 'فروش', className: 'bg-[rgba(37,99,235,.18)] text-[#93c5fd]' },
  STRATEGY: { label: 'ارجاع', className: 'bg-[rgba(168,85,247,.16)] text-[#c084fc]' },
  ACCOUNT: { label: 'حساب', className: 'bg-[rgba(148,163,184,.16)] text-[#cbd5e1]' },
  ACCESS: { label: 'دسترسی', className: 'bg-[rgba(148,163,184,.16)] text-[#cbd5e1]' },
  SYSTEM: { label: 'سیستم', className: 'bg-[rgba(148,163,184,.16)] text-[#cbd5e1]' },
};

function categoryMeta(category: string) {
  return (
    CATEGORY_META[category] ?? {
      label: category,
      className: 'bg-[rgba(148,163,184,.16)] text-[#cbd5e1]',
    }
  );
}

/** EMPLOYEE «گزارش‌های من» — activity feed matching design screenshots. */
export default function EmployeeReportsPage() {
  const [items, setItems] = useState<EmployeeActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyActivity()
      .then((data) => setItems(data.items))
      .catch(() => setError('خطا در دریافت گزارش فعالیت‌ها.'));
  }, []);

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20.5px] font-black text-white">گزارش‌های من</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">گزارش فعالیت‌های ثبت‌شده شما</p>
        </div>
        <EmployeeUnitPill />
      </div>

      {error && <p className="mb-4 text-sm text-[#f87171]">{error}</p>}

      <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
        <h2 className="mb-4 m-0 text-[14.5px] font-extrabold text-white">گزارش فعالیت‌های من</h2>
        {items === null ? (
          <p className="py-8 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6b7b94]">هنوز فعالیتی ثبت نشده است.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const cat = categoryMeta(item.category);
              return (
                <li
                  key={item.id}
                  className="rounded-[12px] border border-[#28344c] bg-[#18223a] px-4 py-3.5"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${cat.className}`}
                    >
                      {cat.label}
                    </span>
                    <span className="font-num text-[10.5px] text-[#6b7b94]">
                      {formatJalaliDateTime(item.at)}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-extrabold text-[#e7ecf3]">{item.title}</div>
                  {item.detail && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-[#9fb0c7]">{item.detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
