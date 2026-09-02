import type { ReactNode } from 'react';
import { panelCard, panelMuted, panelValueSm } from './panel-theme';

interface PanelStatCardProps {
  label: string;
  value: string;
  trend?: { text: string; up?: boolean };
  icon?: ReactNode;
  iconClass?: string;
  onClick?: () => void;
  footer?: ReactNode;
  valueClass?: string;
}

export default function PanelStatCard({
  label,
  value,
  trend,
  icon,
  iconClass = 'bg-[rgba(59,130,246,.16)] text-panel-accent',
  onClick,
  footer,
  valueClass = panelValueSm,
}: PanelStatCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${panelCard} p-4 text-right ${onClick ? 'transition hover:border-panel-accent/40' : ''}`}
    >
      {(icon || trend) && (
        <div className="mb-3 flex items-center justify-between">
          {icon && (
            <span className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${iconClass}`}>
              {icon}
            </span>
          )}
          {trend && (
            <span
              className={`font-num rounded-full px-2 py-0.5 text-[10px] font-bold ${
                trend.up !== false
                  ? 'bg-[rgba(52,211,153,.16)] text-[#34d399]'
                  : 'bg-[rgba(248,113,113,.16)] text-[#f87171]'
              }`}
            >
              {trend.text}
            </span>
          )}
        </div>
      )}
      <div className={valueClass}>{value}</div>
      <div className={`mt-1 text-[11px] ${panelMuted}`}>{label}</div>
      {footer}
    </Tag>
  );
}
