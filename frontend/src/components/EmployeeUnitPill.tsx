import { useEffect, useState } from 'react';
import { fetchEmployeeContext } from '../api/panels';

/** Green «واحد …» pill from employee design screenshots — shared across tabs. */
export default function EmployeeUnitPill() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployeeContext()
      .then((ctx) => {
        if (ctx.deptLabelFa && ctx.deptLabelFa !== '—') setLabel(ctx.deptLabelFa);
      })
      .catch(() => setLabel(null));
  }, []);

  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.12)] px-3 py-1.5 text-[11.5px] font-bold text-[#34d399]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
      واحد {label}
    </span>
  );
}
