import type { ReactNode } from 'react';

/** Stroke icons sampled from design-reference-v2 management-panel sidebars. */
function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const PANEL_BRAND_PLANE_ICON = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M21 15.5v-1.6l-7.5-4.6V4.2a1.5 1.5 0 0 0-3 0v5.1L3 13.9v1.6l7.5-2.3v4.4l-2 1.4v1.3l3.5-1 3.5 1v-1.3l-2-1.4v-4.4L21 15.5z" />
  </svg>
);

const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <NavIcon>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </NavIcon>
  ),
  agencies: (
    <NavIcon>
      <path d="M3 21h18" />
      <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
      <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
      <path d="M9 8h3M9 12h3M9 16h3" />
    </NavIcon>
  ),
  flights: (
    <NavIcon>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </NavIcon>
  ),
  routes: (
    <NavIcon>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="M8.5 16c3.8-.4 4.2-6.9 7-7.7" />
      <path d="M11 5l2-2 2 2" />
    </NavIcon>
  ),
  aircraft: (
    <NavIcon>
      <path d="M3 12h18" />
      <path d="M6 12l2-6h8l2 6" />
      <path d="M8 12v5M16 12v5" />
      <path d="M10 17h4" />
    </NavIcon>
  ),
  flightops: (
    <NavIcon>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </NavIcon>
  ),
  admins: (
    <NavIcon>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </NavIcon>
  ),
  reports: (
    <NavIcon>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M4 19c0-3 2.7-5.5 6-5.5" />
      <circle cx="16.5" cy="16.5" r="3" />
      <path d="M21 21l-2.3-2.3" />
    </NavIcon>
  ),
  customers: (
    <NavIcon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
    </NavIcon>
  ),
  finance: (
    <NavIcon>
      <path d="M3 3v18h18" />
      <path d="M7 14l3.5-3.5 3 3L20 7" />
      <path d="M16 7h4v4" />
    </NavIcon>
  ),
  exports: (
    <NavIcon>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 18v2h16v-2" />
    </NavIcon>
  ),
  integrations: (
    <NavIcon>
      <rect x="3" y="9" width="7" height="6" rx="2" />
      <rect x="14" y="9" width="7" height="6" rx="2" />
      <path d="M10 12h4" />
    </NavIcon>
  ),
  cartable: (
    <NavIcon>
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M5.5 13L7 5.5h10L18.5 13v5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1z" />
    </NavIcon>
  ),
  referrals: (
    <NavIcon>
      <path d="M14 9l6 6-6 6" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </NavIcon>
  ),
  mgrreports: (
    <NavIcon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 17v-5M12 17v-8M15 17v-3" />
    </NavIcon>
  ),
  vip: (
    <NavIcon>
      <path d="M12 2l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 18.2l1-5.8L3.5 8.2l5.9-.9z" />
    </NavIcon>
  ),
  club: (
    <NavIcon>
      <path d="M12 2l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 18.2l1-5.8L3.5 8.2l5.9-.9z" />
    </NavIcon>
  ),
  survey: (
    <NavIcon>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </NavIcon>
  ),
  panels: (
    <NavIcon>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </NavIcon>
  ),
  security: (
    <NavIcon>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </NavIcon>
  ),
  reservation: (
    <NavIcon>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 10h20M8 4v16" />
    </NavIcon>
  ),
  refund: (
    <NavIcon>
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
    </NavIcon>
  ),
  tickets: (
    <NavIcon>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 1.6 1.6 0 0 0 0 3.2 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 1.6 1.6 0 0 0 0-3.2z" />
      <path d="M13 7v10" />
    </NavIcon>
  ),
  notices: (
    <NavIcon>
      <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M3 7l9 6 9-6" />
      <path d="M17 3v4" />
    </NavIcon>
  ),
  blog: (
    <NavIcon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </NavIcon>
  ),
  media: (
    <NavIcon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="M21 16l-5-5L5 20" />
    </NavIcon>
  ),
  jobapps: (
    <NavIcon>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 12h6M9 16h6" />
    </NavIcon>
  ),
  rules: (
    <NavIcon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </NavIcon>
  ),
  kyc: (
    <NavIcon>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M4 19c0-3 2.7-5.5 6-5.5" />
      <circle cx="16.5" cy="16.5" r="3" />
      <path d="M21 21l-2.3-2.3" />
    </NavIcon>
  ),
  settings: (
    <NavIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </NavIcon>
  ),
  pricing: (
    <NavIcon>
      <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </NavIcon>
  ),
  clubrules: (
    <NavIcon>
      <path d="M12 2l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 18.2l1-5.8L3.5 8.2l5.9-.9z" />
    </NavIcon>
  ),
  logs: (
    <NavIcon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </NavIcon>
  ),
  users: (
    <NavIcon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 19c0-3.2 3.1-5.5 7-5.5" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M22 19c0-2.5-2.2-4.5-5-4.5" />
    </NavIcon>
  ),
  services: (
    <NavIcon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </NavIcon>
  ),
  backup: (
    <NavIcon>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </NavIcon>
  ),
  staff: (
    <NavIcon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 19c0-3.2 3.1-5.5 7-5.5" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M22 19c0-2.5-2.2-4.5-5-4.5" />
    </NavIcon>
  ),
  webservice: (
    <NavIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </NavIcon>
  ),
  webservices: (
    <NavIcon>
      <path d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
      <path d="M14 5l-4 14" />
    </NavIcon>
  ),
  'ancillary-services': (
    <NavIcon>
      <path d="M5 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
      <path d="M17 11V9a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3 3v-6a2 2 0 0 1 2-2h11z" />
    </NavIcon>
  ),
};

export function panelNavIcon(key: string): ReactNode {
  return ICONS[key] ?? ICONS.dashboard;
}
