export function PinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

export function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function UserIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function PlaneIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1668c4">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}

export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

export function DomesticFlightIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

export function IntlFlightIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm7.86 6h-3.02c-.28-1.32-.68-2.6-1.2-3.78A8.03 8.03 0 0 1 19.86 8zM12 4.06c.83 1.11 1.5 2.53 1.91 3.94h-3.82c.41-1.41 1.08-2.83 1.91-3.94zM4.26 14A7.9 7.9 0 0 1 4 12c0-.69.08-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.9 2h3.02c.28 1.32.68 2.6 1.2 3.78A7.99 7.99 0 0 1 5.16 16zm3.02-8H5.16a7.99 7.99 0 0 1 4.22-3.78C8.86 5.4 8.46 6.68 8.18 8zM12 19.94c-.83-1.11-1.5-2.53-1.91-3.94h3.82c-.41 1.41-1.08 2.83-1.91 3.94zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.78c.52-1.18.92-2.46 1.2-3.78h3.02a8.03 8.03 0 0 1-4.22 3.78zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.18.64.26 1.31.26 2s-.08 1.36-.26 2h-3.38z" />
    </svg>
  );
}

export function SeatQuickLinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#8a96a6">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h7A1.5 1.5 0 0 1 17 3.5V13H7z" />
      <path d="M6 13h12a2 2 0 0 1 2 2v3a1 1 0 1 1-2 0v-.5H6v.5a1 1 0 1 1-2 0v-3a2 2 0 0 1 2-2z" />
      <path d="M8 20.5a1 1 0 1 1 2 0v.5a1 1 0 1 1-2 0zM14 20.5a1 1 0 1 1 2 0v.5a1 1 0 1 1-2 0z" />
    </svg>
  );
}

export function BaggageQuickLinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#8a96a6">
      <path d="M10 2.5h4a1.5 1.5 0 0 1 1.5 1.5v1H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5V4A1.5 1.5 0 0 1 10 2.5zm.5 2.5h3V4.5h-3zM5 9v8h14V9z" />
      <path d="M11 10.5a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0z" />
    </svg>
  );
}

export function RefundQuickLinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8a96a6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 13.3-6" />
      <path d="M17.3 3v3.5h-3.5" />
      <path d="M20 12a8 8 0 0 1-13.3 6" />
      <path d="M6.7 21v-3.5h3.5" />
    </svg>
  );
}

export function StatusQuickLinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#8a96a6">
      <path d="M13 2.6a1 1 0 0 0-2 0v5.1L4.4 11a1.3 1.3 0 0 0-.7 1.2v1a.6.6 0 0 0 .8.6L11 12v4.6l-2.1 1.5a.6.6 0 0 0-.25.5v1a.5.5 0 0 0 .65.48L12 19l2.7 1.1a.5.5 0 0 0 .65-.48v-1a.6.6 0 0 0-.25-.5L13 16.6V12l6.5 1.8a.6.6 0 0 0 .8-.6v-1a1.3 1.3 0 0 0-.7-1.2L13 7.7z" />
    </svg>
  );
}

export const QUICK_LINK_ICONS = [SeatQuickLinkIcon, BaggageQuickLinkIcon, RefundQuickLinkIcon, StatusQuickLinkIcon];
