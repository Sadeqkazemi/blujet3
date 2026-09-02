import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ServiceMenuIcon,
  type ServiceMenuIconKind,
} from '../../components/public/service-menu-icon';
import { useAuth } from '../../hooks/useAuth';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useT } from '../../lib/i18n';
import { localeMoney } from '../../lib/fa-format';
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markNotificationRead,
} from '../../api/notifications';
import { formatNotificationTime, notificationCategoryIcon } from '../../components/public/customer-notification-ui';
import type { NotificationRow } from '../../types/notifications';
import { AGENCY_NAV_ITEMS, agencyInitials } from './agency-nav-config';
import type { AgencyNavKey } from './agency-nav-config';
import AgencyNavIcon from './AgencyNavIcon';

const LANG_OPTIONS: { value: StoredLocale; label: string }[] = [
  { value: 'fa', label: 'فارسی' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

const STR: Record<StoredLocale, { b2bPartner: string; agencyPanel: string; menuTitle: string }> = {
  fa: { b2bPartner: 'همکار B2B', agencyPanel: 'پنل آژانس', menuTitle: 'منو' },
  en: { b2bPartner: 'B2B Partner', agencyPanel: 'Agency Panel', menuTitle: 'Menu' },
  ar: { b2bPartner: 'شريك B2B', agencyPanel: 'لوحة الوكالة', menuTitle: 'القائمة' },
};

function ChevronIcon({ isRTL }: { isRTL: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9aa4b2"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', transform: isRTL ? 'scaleX(-1)' : undefined }}
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

interface Props {
  isMobile: boolean;
  activeKey: AgencyNavKey;
  agencyName: string;
  licenseNo: string | null;
  remainingIrr: string | null;
  onSignOut: () => void;
}

export default function AgencyPortalHeader({ isMobile, activeKey, agencyName, licenseNo, remainingIrr, onSignOut }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const at = STR[locale];
  const isRTL = locale !== 'en';
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchNotifications({ limit: 12 }),
      fetchNotificationsUnreadCount(),
    ])
      .then(([rows, counts]) => {
        if (!active) return;
        setNotifications(rows);
        setUnreadNotifications(counts.total);
      })
      .catch(() => {
        if (!active) return;
        setNotifications([]);
        setUnreadNotifications(0);
      });
    return () => {
      active = false;
    };
  }, []);

  async function openAgencyNotification(row: NotificationRow) {
    if (row.readAt) return;
    try {
      const updated = await markNotificationRead(row.id);
      setNotifications((current) => current.map((item) => (item.id === row.id ? updated : item)));
      setUnreadNotifications((current) => Math.max(0, current - 1));
    } catch {
      // Keep the notification visible when the acknowledgement request fails.
    }
  }

  const displayName = agencyName || user?.fullName || '—';
  const initials = agencyInitials(displayName);
  const logoTextColor = isMobile ? '#fff' : 'var(--portal-ink)';
  const logoSquareBg = isMobile ? '#fff' : '#1668c4';
  const logoIconColor = isMobile ? '#1668c4' : '#fff';

  const navLinks = [
    { to: '/', label: t('navFlights') },
    { to: '/destinations', label: t('navDestinations') },
    { to: '/club', label: t('navLoyalty') },
    { to: '/support', label: t('navSupport') },
  ];
  const serviceLinks: { to: string; label: string; icon: ServiceMenuIconKind }[] = [
    { to: '/services/seat-selection', label: t('svcSeatLabel'), icon: 'seat' },
    { to: '/services/extra-baggage', label: t('svcBaggageLabel'), icon: 'baggage' },
    { to: '/services/refund-info', label: t('svcRefundLabel'), icon: 'refund' },
    { to: '/services/pet-travel', label: t('svcPetLabel'), icon: 'pet' },
    { to: '/services/wheelchair', label: t('svcWheelchairLabel'), icon: 'wheelchair' },
  ];
  const servicesActive = location.pathname.startsWith('/services/');

  const langDropdown = (
    <>
      <button type="button" aria-label="Close language menu" onClick={() => setLangOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120, border: 0, background: 'transparent' }} />
      <div
        style={{
          position: 'absolute',
          top: 44,
          [isRTL ? 'left' : 'right']: 0,
          width: 150,
          background: 'var(--portal-surface)',
          border: '1px solid var(--portal-border)',
          borderRadius: 14,
          boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
          zIndex: 130,
          overflow: 'hidden',
          padding: 6,
        }}
      >
        {LANG_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            data-testid={`agency-lang-option-${opt.value}`}
            onClick={() => {
              setLocale(opt.value);
              setLangOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '9px 11px',
              borderRadius: 9,
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--portal-ink)',
              cursor: 'pointer',
              border: 0,
              background: locale === opt.value ? 'var(--portal-surface-2)' : 'transparent',
              width: '100%',
              fontFamily: 'inherit',
            }}
          >
            {opt.label}
            {locale === opt.value && <span style={{ color: '#1668c4', fontWeight: 900 }}>✓</span>}
          </button>
        ))}
      </div>
    </>
  );

  const userMenuPanel = (width: number, top: number, align: 'left' | 'right') => (
    <>
      <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
      <div
        style={{
          position: 'absolute',
          top,
          [align]: 0,
          width,
          maxWidth: '80vw',
          background: 'var(--portal-surface)',
          border: '1px solid var(--portal-border)',
          borderRadius: 16,
          boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
          zIndex: 130,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 17px 12px', color: 'var(--portal-ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                background: '#2f7fd4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 13.5,
                color: '#fff',
              }}
            >
              {initials}
            </div>
            <div style={{ lineHeight: 1.5 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{displayName}</div>
              <div dir="ltr" style={{ fontSize: 10.5, color: 'var(--portal-muted)', fontWeight: 700 }}>{licenseNo || '—'}</div>
            </div>
          </div>
        </div>
        <div style={{ margin: '0 17px 12px', borderRadius: 12, background: 'var(--portal-surface-2)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--portal-muted)' }}>{locale === 'fa' ? 'اعتبار قابل استفاده' : locale === 'ar' ? 'الرصيد المتاح' : 'Available credit'}</div>
            <b className="font-num" style={{ display: 'block', marginTop: 4, fontSize: 14, color: 'var(--portal-ink)' }}>{remainingIrr == null ? '—' : localeMoney(remainingIrr, locale)}</b>
          </div>
          <span aria-hidden style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--portal-surface)', border: '1px solid var(--portal-border)', display: 'grid', placeItems: 'center', color: 'var(--portal-accent)' }}>
            <AgencyNavIcon name="credit" size={18} />
          </span>
        </div>
        <div style={{ padding: 5 }}>
          <Link
            to="/agency"
            onClick={() => setUserMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderRadius: 9, fontSize: 11.5, color: 'var(--portal-ink)', textDecoration: 'none', fontWeight: 600 }}
          >
            <span style={{ color: '#1668c4' }}>👤</span>
            {at.agencyPanel}
          </Link>
          <Link
            to="/agency/sales"
            onClick={() => setUserMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderRadius: 9, fontSize: 11.5, color: 'var(--portal-ink)', textDecoration: 'none', fontWeight: 600 }}
          >
            <span style={{ color: '#1668c4' }}>🧳</span>
            {locale === 'fa' ? 'پروازهای خریداری‌شده' : locale === 'ar' ? 'الرحلات المشتراة' : 'Purchased flights'}
          </Link>
          <Link to="/agency/webservice" onClick={() => setUserMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderRadius: 9, fontSize: 11.5, color: 'var(--portal-ink)', textDecoration: 'none', fontWeight: 600 }}>
            <span style={{ color: '#1668c4' }}>&lt;/&gt;</span>
            {locale === 'fa' ? 'وب‌سرویس' : locale === 'ar' ? 'خدمة الويب' : 'Web service'}
          </Link>
          <Link to="/agency/profile" onClick={() => setUserMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderRadius: 9, fontSize: 11.5, color: 'var(--portal-ink)', textDecoration: 'none', fontWeight: 600 }}>
            <span style={{ color: '#1668c4' }}>▯</span>
            {locale === 'fa' ? 'مدارک و پروفایل' : locale === 'ar' ? 'المستندات والملف الشخصي' : 'Documents & profile'}
          </Link>
          <span
            data-testid="agency-header-logout"
            onClick={() => {
              setUserMenuOpen(false);
              onSignOut();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderRadius: 9, fontSize: 11.5, color: '#e5484d', fontWeight: 600, cursor: 'pointer' }}
          >
            <span>↩</span>
            {t('logoutLabel')}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <header data-testid="agency-portal-header" style={{ gridColumn: '1 / -1', position: 'sticky', top: 0, zIndex: 150 }}>
        <div
          style={{
            background: isMobile ? '#1668c4' : 'var(--portal-surface)',
            borderBottom: isMobile ? 'none' : '1px solid var(--portal-border)',
            boxShadow: '0 2px 12px -8px rgba(13,38,102,.25)',
          }}
        >
          <div
            style={{
              padding: '0 22px',
              height: isMobile ? 58 : 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {isMobile && (
              <span
                data-testid="agency-mobile-menu-toggle"
                onClick={() => setMobileMenuOpen((v) => !v)}
                style={{
                  display: 'flex',
                  width: 38,
                  height: 38,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 17,
                  color: '#fff',
                  flex: 'none',
                }}
              >
                ☰
              </span>
            )}

            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: logoTextColor }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: logoSquareBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: logoIconColor,
                  fontSize: 18,
                }}
              >
                ✈
              </div>
              <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-.5px', color: logoTextColor }}>blujet</span>
            </Link>

            {!isMobile && (
              <nav style={{ display: 'flex', gap: 30, fontSize: 15.5, color: 'var(--portal-ink)', fontWeight: 600, height: '100%', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {navLinks.slice(0, 2).map((link) => (
                  <Link key={link.to} to={link.to} style={{ textDecoration: 'none', color: 'var(--portal-ink)' }}>
                    {link.label}
                  </Link>
                ))}
                <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    data-testid="agency-services-menu-toggle"
                    aria-expanded={servicesMenuOpen}
                    onClick={() => setServicesMenuOpen((value) => !value)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: servicesActive ? 'var(--portal-accent)' : 'var(--portal-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      height: '100%',
                      borderBottom: servicesActive ? '3px solid #1668c4' : '3px solid transparent',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {t('navServices')}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: servicesMenuOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {servicesMenuOpen && (
                    <>
                      <div onClick={() => setServicesMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
                      <div
                        data-testid="agency-services-menu"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          [isRTL ? 'right' : 'left']: 0,
                          marginTop: 10,
                          width: 230,
                          background: 'var(--portal-surface)',
                          border: '1px solid var(--portal-border)',
                          borderRadius: 14,
                          boxShadow: '0 18px 40px -14px rgba(13,38,102,.25)',
                          padding: 10,
                          zIndex: 60,
                        }}
                      >
                        {serviceLinks.map((item) => {
                          const active = location.pathname === item.to;
                          return (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setServicesMenuOpen(false)}
                              style={{
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                padding: '9px 10px',
                                borderRadius: 10,
                                fontSize: 12.5,
                                fontWeight: active ? 700 : 600,
                                color: active ? 'var(--portal-accent)' : 'var(--portal-ink)',
                              }}
                            >
                              <span>{item.label}</span>
                              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--portal-surface-2)', color: 'var(--portal-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                                <ServiceMenuIcon kind={item.icon} />
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                {navLinks.slice(2).map((link) => (
                  <Link key={link.to} to={link.to} style={{ textDecoration: 'none', color: 'var(--portal-ink)' }}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}

            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    data-testid="agency-lang-toggle"
                    aria-haspopup="menu"
                    aria-expanded={langOpen}
                    onClick={() => setLangOpen((v) => !v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      color: 'var(--portal-muted)',
                      border: '1.5px solid var(--portal-border)',
                      borderRadius: 20,
                      padding: '6px 12px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      background: 'transparent',
                    }}
                  >
                    <GlobeIcon />
                    {locale.toUpperCase()}
                  </button>
                  {langOpen && langDropdown}
                </div>
                <div style={{ position: 'relative' }}>
                  <div
                    data-testid="agency-notif-toggle"
                    onClick={() => setNotifOpen((v) => !v)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'var(--portal-surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--portal-muted)',
                      fontSize: 15.5,
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    🔔
                    {unreadNotifications > 0 && (
                      <span
                        data-testid="agency-notif-badge"
                        style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, background: '#e5484d', color: '#fff', display: 'grid', placeItems: 'center', padding: '0 4px', fontSize: 9, fontWeight: 900 }}
                      >
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                  </div>
                  {notifOpen && (
                    <>
                      <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
                      <div
                        style={{
                          position: 'absolute',
                          top: 52,
                          [isRTL ? 'left' : 'right']: 0,
                          width: 340,
                          background: 'var(--portal-surface)',
                          border: '1px solid var(--portal-border)',
                          borderRadius: 14,
                          boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
                          zIndex: 130,
                          overflow: 'hidden',
                          padding: 8,
                          textAlign: isRTL ? 'right' : 'left',
                          color: 'var(--portal-muted)',
                          fontSize: 11.5,
                        }}
                      >
                        {notifications.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center' }}>
                            {locale === 'fa' ? 'هنوز اعلانی وجود ندارد.' : locale === 'ar' ? 'لا توجد إشعارات بعد.' : 'No notifications yet.'}
                          </div>
                        ) : notifications.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => void openAgencyNotification(row)}
                            style={{ width: '100%', border: 0, borderBottom: '1px solid var(--portal-border)', background: row.readAt ? 'var(--portal-surface)' : 'var(--portal-surface-2)', padding: '11px 10px', textAlign: 'inherit', cursor: 'pointer', display: 'flex', gap: 9 }}
                          >
                            <span aria-hidden>{notificationCategoryIcon(row.category)}</span>
                            <span style={{ minWidth: 0 }}>
                              <strong style={{ display: 'block', color: 'var(--portal-ink)', fontSize: 11.5 }}>{row.title}</strong>
                              <span style={{ display: 'block', marginTop: 3, color: 'var(--portal-muted)', fontSize: 10, lineHeight: 1.6 }}>{row.body}</span>
                              <span style={{ display: 'block', marginTop: 4, color: 'var(--portal-muted)', fontSize: 9 }}>{formatNotificationTime(row.createdAt, locale)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <div
                    data-testid="agency-user-menu-toggle"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'var(--portal-surface)',
                      border: '1px solid var(--portal-border)',
                      padding: '4px 10px 4px 7px',
                      borderRadius: 30,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg,#1668c4,#3b8ae0)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 12.5,
                      }}
                    >
                      {initials}
                    </div>
                    <div style={{ lineHeight: 1.35, textAlign: isRTL ? 'right' : 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-ink)' }}>{displayName}</div>
                      <div style={{ fontSize: 10, color: '#caa53a', fontWeight: 700 }}>{at.b2bPartner}</div>
                    </div>
                    <span style={{ fontSize: 8, color: '#9aa4b2', marginRight: 2 }}>▼</span>
                  </div>
                  {userMenuOpen && userMenuPanel(300, 54, isRTL ? 'left' : 'right')}
                </div>
              </div>
            )}

            {isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                  <button type="button" data-testid="agency-lang-toggle-mobile" aria-haspopup="menu" aria-expanded={langOpen} onClick={() => setLangOpen((v) => !v)} style={{ width: 36, height: 36, border: 0, background: 'transparent', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
                    <GlobeIcon size={19} />
                  </button>
                  {langOpen && langDropdown}
                </div>
                <div style={{ position: 'relative' }}>
                  <span
                    data-testid="agency-user-menu-toggle-mobile"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
                  >
                    <UserOutlineIcon size={19} />
                  </span>
                  {userMenuOpen && userMenuPanel(280, 46, 'left')}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--portal-surface)', color: 'var(--portal-ink)', zIndex: 210, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '26px 20px 18px' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-ink)' }}>{at.menuTitle}</span>
            <span
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: 'absolute',
                [isRTL ? 'left' : 'right']: 20,
                top: 22,
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                color: 'var(--portal-ink)',
                cursor: 'pointer',
              }}
            >
              ×
            </span>
          </div>
          <div style={{ padding: '4px 24px 0', display: 'flex', flexDirection: 'column' }}>
            {navLinks.slice(0, 2).map((link, i) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '20px 0',
                  textDecoration: 'none',
                  color: '#16202e',
                  fontSize: 17,
                  fontWeight: 700,
                  borderTop: i > 0 ? '1px solid #eef1f5' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {link.label}
                <ChevronIcon isRTL={isRTL} />
              </Link>
            ))}
            <div style={{ borderTop: '1px solid #eef1f5' }}>
              <button
                type="button"
                data-testid="agency-mobile-services-toggle"
                aria-expanded={mobileServicesOpen}
                onClick={() => setMobileServicesOpen((value) => !value)}
                style={{
                  width: '100%',
                  padding: '20px 0',
                  border: 0,
                  background: 'transparent',
                  color: servicesActive ? '#1668c4' : '#16202e',
                  fontFamily: 'inherit',
                  fontSize: 17,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{t('navServices')}</span>
                <span style={{ display: 'flex', color: '#9aa4b2', transform: mobileServicesOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              {mobileServicesOpen && (
                <div data-testid="agency-mobile-services-panel" style={{ paddingBottom: 8 }}>
                  {serviceLinks.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileServicesOpen(false);
                      }}
                      style={{
                        padding: '12px 0 12px 4px',
                        textDecoration: 'none',
                        color: location.pathname === item.to ? '#1668c4' : '#16202e',
                        fontSize: 15,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#f2f4f7', color: '#3b4554', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                          <ServiceMenuIcon kind={item.icon} />
                        </span>
                        {item.label}
                      </span>
                      <ChevronIcon isRTL={isRTL} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {navLinks.slice(2).map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '20px 0',
                  textDecoration: 'none',
                  color: 'var(--portal-ink)',
                  fontSize: 17,
                  fontWeight: 700,
                  borderTop: '1px solid #eef1f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {link.label}
                <ChevronIcon isRTL={isRTL} />
              </Link>
            ))}
            {AGENCY_NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '20px 0',
                  textDecoration: 'none',
                  color: '#16202e',
                  fontSize: 17,
                  fontWeight: activeKey === item.key ? 800 : 700,
                  borderTop: '1px solid #eef1f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {item.label[locale]}
                {activeKey !== item.key && <ChevronIcon isRTL={isRTL} />}
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 'auto', padding: '14px 24px 32px' }}>
            <span
              onClick={() => {
                setMobileMenuOpen(false);
                onSignOut();
              }}
              style={{ display: 'block', padding: '10px 0', color: '#e5484d', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              {t('logoutLabel')}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function GlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
    </svg>
  );
}

function UserOutlineIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
