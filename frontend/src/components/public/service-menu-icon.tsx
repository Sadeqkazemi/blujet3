export type ServiceMenuIconKind =
  | 'seat'
  | 'baggage'
  | 'refund'
  | 'pet'
  | 'wheelchair';

/** Shared icon set so the public and agency service menus stay identical. */
export function ServiceMenuIcon({ kind }: { kind: ServiceMenuIconKind }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'seat') {
    return (
      <svg {...common}>
        <path d="M5 11V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5" />
        <path d="M17 11V9a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-3 3v-6a2 2 0 0 1 2-2h11z" />
      </svg>
    );
  }
  if (kind === 'baggage') {
    return (
      <svg {...common}>
        <rect x="4" y="7" width="16" height="14" rx="2" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M9 11v6M15 11v6" />
      </svg>
    );
  }
  if (kind === 'refund') {
    return (
      <svg {...common}>
        <path d="M3 10h11a5 5 0 0 1 0 10H9" />
        <path d="M7 6l-4 4 4 4" />
      </svg>
    );
  }
  if (kind === 'pet') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="1.6" />
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="17" cy="7" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
        <path d="M9 13c-2 1-3 3-2 5.5 1 2 4 2.5 5 1 1 1.5 4 1 5-1 1-2.5 0-4.5-2-5.5-2-1-4-1-6 0z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="4.5" r="1.6" />
      <path d="M9 8v5l4 2M9 13H5.5a3.5 3.5 0 1 0 3 5.3M13 15l3 5h3" />
    </svg>
  );
}
