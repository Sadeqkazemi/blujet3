/** Shared Tailwind class strings for management panel dark theme. */

export const panelCard = 'panel-surface-card rounded-[14px] border border-panel-border bg-panel-card';
export const panelCardPadded = `${panelCard} p-5`;
export const panelElevated = 'rounded-xl border border-panel-border-2 bg-panel-elevated';
export const panelElevatedPadded = `${panelElevated} p-3`;

export const panelTitle = 'text-sm font-bold text-panel-ink';
export const panelSubtitle = 'mt-0.5 text-[11px] text-panel-muted';
export const panelMuted = 'text-panel-muted';
export const panelMuted2 = 'text-panel-muted-2';
export const panelText = 'text-panel-text';
export const panelLink = 'text-panel-link font-bold';
export const panelValue = 'font-num text-[22.5px] font-black text-panel-ink';
export const panelValueSm = 'font-num text-lg font-black text-panel-ink';
export const panelValueMd = 'font-num text-base font-black text-panel-ink';

export const panelBtnPrimary =
  'rounded-lg bg-panel-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-panel-accent/90';
export const panelBtnGhost =
  'rounded-lg border border-panel-border-2 px-3 py-2 text-xs font-bold text-panel-muted-2 transition hover:text-panel-text';
export const panelInput =
  'rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs text-panel-text outline-none transition focus:border-panel-accent';

export const panelAlertError =
  'rounded-[14px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] p-3 text-sm text-[#f87171]';
export const panelAlertSuccess =
  'rounded-[14px] border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.08)] p-3 text-sm text-[#34d399]';
export const panelAlertWarning =
  'rounded-[14px] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.08)] p-3 text-sm text-[#fbbf24]';

export const panelSegmented =
  'flex gap-1 rounded-lg border border-panel-border-2 bg-panel-elevated p-1';
export const panelSegmentBtn = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-[11px] transition ${
    active ? 'bg-panel-accent font-bold text-white' : 'text-panel-muted hover:text-panel-text'
  }`;

export const panelListItem = `${panelCard} p-4 transition hover:border-panel-accent/40`;
export const panelListDivider = 'divide-panel-border';
