import type { ReactNode } from 'react';
import { panelCard, panelSubtitle, panelTitle } from './panel-theme';

interface PanelCardProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  padding?: boolean;
}

export default function PanelCard({
  children,
  className = '',
  title,
  subtitle,
  actions,
  padding = true,
}: PanelCardProps) {
  return (
    <section className={`${panelCard} ${padding ? 'p-5' : ''} ${className}`.trim()}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${padding ? 'mb-4' : ''}`}>
          <div>
            {title && <h2 className={panelTitle}>{title}</h2>}
            {subtitle && <p className={panelSubtitle}>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
