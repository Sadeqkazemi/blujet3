import type { PanelTheme } from '../hooks/usePanelTheme';

type Props = {
  theme: PanelTheme;
  onToggle: () => void;
  lightLabel?: string;
  darkLabel?: string;
  compact?: boolean;
};

export default function PanelThemeToggle({
  theme,
  onToggle,
  lightLabel = 'حالت روشن',
  darkLabel = 'حالت تیره',
  compact = false,
}: Props) {
  const nextLabel = theme === 'light' ? darkLabel : lightLabel;
  return (
    <button
      type="button"
      data-testid="panel-theme-toggle"
      aria-label={nextLabel}
      title={nextLabel}
      onClick={onToggle}
      className={`panel-theme-toggle ${compact ? 'panel-theme-toggle--compact' : ''}`}
    >
      {theme === 'light' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
        </svg>
      )}
      {!compact && <span>{nextLabel}</span>}
    </button>
  );
}
