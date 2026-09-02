import { NavLink } from 'react-router-dom';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import AgencyNavIcon from './AgencyNavIcon';
import { AGENCY_NAV_ITEMS, agencyInitials, type AgencyNavKey } from './agency-nav-config';

const STR: Record<StoredLocale, { activeCode: (code: string) => string; logout: string }> = {
  fa: {
    activeCode: (code) => `● فعال · کد ${code}`,
    logout: 'خروج از حساب',
  },
  en: {
    activeCode: (code) => `● Active · Code ${code}`,
    logout: 'Log Out',
  },
  ar: {
    activeCode: (code) => `● نشط · رمز ${code}`,
    logout: 'تسجيل الخروج',
  },
};

interface Props {
  activeKey: AgencyNavKey;
  agencyName: string;
  licenseNo: string | null;
  inboxCount: number;
  onSignOut: () => void;
}

export default function AgencyPortalSidebar({
  activeKey,
  agencyName,
  licenseNo,
  inboxCount,
  onSignOut,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const initials = agencyInitials(agencyName);
  const codeSuffix = licenseNo?.replace(/^AG-?/i, '') ?? '—';

  return (
    <aside
      data-testid="agency-sidebar"
      style={{
        background: 'var(--portal-surface)',
        color: 'var(--portal-ink)',
        borderLeft: '1px solid var(--portal-border)',
        padding: '15px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--portal-surface-2)',
          border: '1px solid var(--portal-border)',
          borderRadius: 13,
          padding: '11px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg,#1668c4,#3b8ae0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 12.5,
              color: '#fff',
              flex: 'none',
            }}
          >
            {initials}
          </div>
          <div style={{ lineHeight: 1.4, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--portal-ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {agencyName}
            </div>
            <div style={{ fontSize: 10, color: '#1f8a5b', fontWeight: 700 }}>{t.activeCode(localeDigits(codeSuffix, locale))}</div>
          </div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {AGENCY_NAV_ITEMS.map((item) => {
          const active = activeKey === item.key;
          const badge = item.showBadge && inboxCount > 0 ? localeDigits(inboxCount, locale) : null;
          return (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.key === 'dashboard'}
              data-testid={`agency-nav-${item.key}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 11px',
                borderRadius: 11,
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: active ? 800 : 600,
                color: active ? 'var(--portal-accent)' : 'var(--portal-muted)',
                background: active ? 'var(--portal-surface-2)' : 'transparent',
                textDecoration: 'none',
              }}
            >
              <span style={{ width: 20, height: 20, display: 'flex', flex: 'none', color: 'inherit' }}>
                <AgencyNavIcon name={item.icon} />
              </span>
              <span style={{ flex: 1 }}>{item.label[locale]}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#fff',
                    background: '#e8553a',
                    minWidth: 19,
                    height: 19,
                    padding: '0 5px',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <button
        type="button"
        data-testid="agency-logout"
        onClick={onSignOut}
        style={{
          marginTop: 'auto',
          marginRight: -11,
          marginLeft: -11,
          marginBottom: -15,
          minHeight: 72,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 22px',
          borderTop: '1px solid #eef2f7',
          cursor: 'pointer',
          color: '#e5484d',
          fontSize: 12,
          fontWeight: 700,
          background: 'transparent',
          border: 'none',
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: 'var(--portal-border)',
          fontFamily: 'inherit',
          width: 'calc(100% + 22px)',
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        {t.logout}
      </button>
    </aside>
  );
}
