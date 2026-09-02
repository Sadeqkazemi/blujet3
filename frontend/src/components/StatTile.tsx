interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'accent' | 'good' | 'warning' | 'critical';
}

const TONE_CLASSES: Record<NonNullable<StatTileProps['tone']>, string> = {
  accent: 'bg-accent/10 text-accent',
  good: 'bg-[#05966915] text-[#059669]',
  warning: 'bg-[#f59e0b15] text-[#b45309]',
  critical: 'bg-danger/10 text-danger',
};

// The 4 KPI concepts StatTile is used for (both callers pass the same
// label/tone pairs) each get a real icon by tone, matching the design's
// colored icon badges instead of the placeholder "٪" glyph.
const TONE_ICONS: Record<NonNullable<StatTileProps['tone']>, React.ReactNode> = {
  good: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  ),
  accent: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  critical: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  ),
};

export default function StatTile({ label, value, sublabel, tone = 'accent' }: StatTileProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel-surface p-4">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
        {TONE_ICONS[tone]}
      </div>
      <div className="font-num text-xl font-black text-panel-ink">{value}</div>
      <div className="mt-1 text-xs text-panel-muted">{label}</div>
      {sublabel && <div className="mt-1 text-[11px] text-panel-muted-2">{sublabel}</div>}
    </div>
  );
}
