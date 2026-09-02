import { Link } from 'react-router-dom';
import { faMoney, faPercent } from '../lib/fa-format';
import type { RevenueMixResult } from '../types/reporting';

const MIX_COLORS = { SYSTEM: '#1668c4', CHARTER: '#a855f7', AGENCY: '#059669' };

/** «گزارش مالی» — the design's channel split-bar + total/per-channel boxes,
 * shown on every executive dashboard (CEO/Board Chair/Senior/Commercial)
 * that has finance-tab access. Full filters/history live on /panel/finance;
 * this card is a read-only current-year summary with a link there. */
export default function FinancialSummaryCard({ mix }: { mix: RevenueMixResult }) {
  const total = mix.totalIrr || 1;
  const sysPct = mix.channels.find((c) => c.channel === 'SYSTEM')?.pct ?? 0;
  const chPct = mix.channels.find((c) => c.channel === 'CHARTER')?.pct ?? 0;
  const agPct = mix.channels.find((c) => c.channel === 'AGENCY')?.pct ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-panel-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-panel-ink">گزارش مالی</h2>
          <p className="mt-0.5 text-[11px] text-panel-muted">
            خلاصه فروش سال جاری — جزئیات و فیلترها در صفحه مالی
          </p>
        </div>
        <Link
          to="/panel/finance"
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent"
        >
          مشاهده جزئیات ←
        </Link>
      </div>

      <div className="mb-2 flex h-4 overflow-hidden rounded-lg bg-white/5">
        <div style={{ width: `${sysPct}%`, background: MIX_COLORS.SYSTEM }} />
        <div style={{ width: `${chPct}%`, background: MIX_COLORS.CHARTER }} />
        <div style={{ width: `${agPct}%`, background: MIX_COLORS.AGENCY }} />
      </div>
      <div className="mb-4 flex flex-wrap gap-3 text-[10px] text-panel-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: MIX_COLORS.SYSTEM }} />
          سیستمی {faPercent(sysPct)}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: MIX_COLORS.CHARTER }} />
          چارتر {faPercent(chPct)}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: MIX_COLORS.AGENCY }} />
          آژانس {faPercent(agPct)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-[10.5px] text-panel-muted">جمع فروش سال</div>
          <div className="font-num mt-1 text-base font-black text-panel-ink">{faMoney(total)}</div>
        </div>
        {mix.channels.map((c) => (
          <div key={c.channel} className="rounded-xl bg-white/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-panel-muted">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: MIX_COLORS[c.channel as keyof typeof MIX_COLORS] }}
              />
              فروش {c.labelFa.replace('فروش ', '')}
            </div>
            <div
              className="font-num text-sm font-extrabold"
              style={{ color: MIX_COLORS[c.channel as keyof typeof MIX_COLORS] }}
            >
              {faMoney(c.amountIrr)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
