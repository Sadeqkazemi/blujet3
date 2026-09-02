import type { AgencyNavIconKey } from './agency-nav-config';

const PATHS: Record<AgencyNavIconKey, string> = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  ticket: '<path d="M5 11V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/><path d="M5 11h11a2 2 0 0 1 2 2v3H5z"/><path d="M5 16v3M18 16v3"/><path d="M15 7h5M17.5 4.5v5"/>',
  seat: '<path d="M5 11V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/><path d="M5 11h11a2 2 0 0 1 2 2v3H5z"/><path d="M5 16v3M18 16v3"/>',
  credit: '<path d="M21 11V7.5A1.5 1.5 0 0 0 19.5 6H5a2 2 0 0 1 0-4h13"/><path d="M3 4v14a2 2 0 0 0 2 2h14.5a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M21 11h-4a2 2 0 0 0 0 4h4Z"/>',
  report: '<path d="M3 3v18h18"/><path d="M7 14l3.5-3.5 3 3L20 7"/>',
  notices: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/><path d="M8.5 4.5 7 3M15.5 4.5 17 3"/>',
  inbox: '<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M5.5 13L7 5.5h10L18.5 13v5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  webservice: '<path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/><path d="M13.5 6l-3 12"/>',
  apidocs: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3"/>',
};

export default function AgencyNavIcon({ name, size = 20 }: { name: AgencyNavIconKey; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

export function AgencyMiniIcon({ paths, size = 20 }: { paths: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
