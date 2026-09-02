import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { fetchCredit, fetchInbox, fetchProfile } from '../../api/agency-portal';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import AgencyPortalHeader from './AgencyPortalHeader';
import AgencyPortalSidebar from './AgencyPortalSidebar';
import { AGENCY_PAGE_META, agencyNavKeyFromPath } from './agency-nav-config';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import AgencyComposeMessageModal from './AgencyComposeMessageModal';
import { usePanelInactivityLogout } from '../../hooks/usePanelInactivityLogout';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import PanelThemeToggle from '../../components/PanelThemeToggle';

const STR: Record<StoredLocale, { newMessage: string; logoutTitle: string; logoutMessage: string; logoutConfirm: string; logoutCancel: string; logoutBusy: string }> = {
  fa: { newMessage: 'پیام جدید', logoutTitle: 'خروج از حساب', logoutMessage: 'آیا مطمئن هستید که می‌خواهید از پنل آژانس خارج شوید؟', logoutConfirm: 'بله، خارج شو', logoutCancel: 'انصراف', logoutBusy: 'در حال خروج…' },
  en: { newMessage: 'New message', logoutTitle: 'Sign out', logoutMessage: 'Are you sure you want to sign out of the agency portal?', logoutConfirm: 'Yes, sign out', logoutCancel: 'Cancel', logoutBusy: 'Signing out…' },
  ar: { newMessage: 'رسالة جديدة', logoutTitle: 'تسجيل الخروج', logoutMessage: 'هل أنت متأكد من رغبتك في تسجيل الخروج من بوابة الوكالة؟', logoutConfirm: 'نعم، تسجيل الخروج', logoutCancel: 'إلغاء', logoutBusy: 'جارٍ تسجيل الخروج…' },
};

/** Agency portal shell — matches design-reference-v2/پنل آژانس.dc.html layout. */
export default function AgencyPortalShell() {
  const { user, signOut } = useAuth();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile(900);
  const activeKey = agencyNavKeyFromPath(location.pathname);
  const pageMeta = AGENCY_PAGE_META[activeKey];
  const t = STR[locale];
  const { theme, toggleTheme } = usePanelTheme();

  const [agencyName, setAgencyName] = useState(user?.fullName ?? '');
  const [licenseNo, setLicenseNo] = useState<string | null>(null);
  const [remainingIrr, setRemainingIrr] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const inactivityLogoutStartedRef = useRef(false);
  const showPageMeta = ['dashboard', 'seats', 'webservice', 'apidocs', 'profile'].includes(activeKey);

  const onInactivityTimeout = useCallback(() => {
    if (inactivityLogoutStartedRef.current) return;
    inactivityLogoutStartedRef.current = true;
    void signOut().finally(() => {
      navigate('/agency/login?reason=inactive', { replace: true });
    });
  }, [navigate, signOut]);

  usePanelInactivityLogout({
    enabled: Boolean(user),
    onTimeout: onInactivityTimeout,
  });

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        setAgencyName(p.fullName);
        setLicenseNo(p.licenseNo);
      })
      .catch(() => {
        /* profile optional for shell chrome */
      });
    fetchInbox()
      .then((msgs) => setInboxCount(msgs.length))
      .catch(() => setInboxCount(0));
    fetchCredit()
      .then((credit) => setRemainingIrr(credit.remainingIrr))
      .catch(() => setRemainingIrr(null));
  }, []);

  async function onSignOut() {
    setLogoutBusy(true);
    try {
      await signOut();
      navigate('/agency/login', { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div
      dir={locale === 'en' ? 'ltr' : 'rtl'}
      data-testid="agency-panel-shell"
      data-theme={theme}
      className={`portal-panel-theme portal-panel-theme--${theme}`}
      style={{
        fontFamily: locale === 'en' ? 'Inter, sans-serif' : 'var(--font-sans)',
        background: 'var(--portal-canvas)',
        color: 'var(--portal-ink)',
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '248px 1fr',
        gridTemplateRows: 'auto 1fr',
        alignContent: 'start',
      }}
    >
      <AgencyPortalHeader
        isMobile={isMobile}
        activeKey={activeKey}
        agencyName={agencyName}
        licenseNo={licenseNo}
        remainingIrr={remainingIrr}
        onSignOut={() => setLogoutConfirmOpen(true)}
      />

      {!isMobile && (
        <AgencyPortalSidebar
          activeKey={activeKey}
          agencyName={agencyName}
          licenseNo={licenseNo}
          inboxCount={inboxCount}
          onSignOut={() => setLogoutConfirmOpen(true)}
        />
      )}

      <main style={{ padding: isMobile ? '16px 14px 80px' : '16px 21px 34px', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          {showPageMeta ? (
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--portal-ink)', margin: 0 }}>{pageMeta.title[locale]}</h1>
              <div style={{ fontSize: 11.5, color: 'var(--portal-muted)', marginTop: 3 }}>{pageMeta.subtitle[locale]}</div>
            </div>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <PanelThemeToggle
              theme={theme}
              onToggle={toggleTheme}
              compact
              lightLabel={locale === 'en' ? 'Light mode' : locale === 'ar' ? 'الوضع الفاتح' : 'حالت روشن'}
              darkLabel={locale === 'en' ? 'Dark mode' : locale === 'ar' ? 'الوضع الداكن' : 'حالت تیره'}
            />
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              data-testid="agency-new-message"
              style={{
                height: 42,
                padding: '0 15px',
                background: '#1668c4',
                color: '#fff',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
                border: 0,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t.newMessage}
            </button>
            <Link
              to="/agency/inbox"
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'var(--portal-surface)',
                border: '1px solid var(--portal-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--portal-muted)',
                textDecoration: 'none',
              }}
              aria-label={locale === 'fa' ? 'اعلان‌ها' : locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.5 21a2 2 0 0 1-3 0" />
              </svg>
            </Link>
          </div>
        </div>
        <Outlet />
      </main>
      <ConfirmActionDialog
        open={logoutConfirmOpen}
        title={t.logoutTitle}
        message={t.logoutMessage}
        confirmLabel={t.logoutConfirm}
        cancelLabel={t.logoutCancel}
        busy={logoutBusy}
        busyLabel={t.logoutBusy}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={onSignOut}
        variant={theme}
        testId="agency-logout-confirm"
      />
      {composeOpen && (
        <AgencyComposeMessageModal
          onClose={() => setComposeOpen(false)}
          onSent={() => setInboxCount((count) => count + 1)}
        />
      )}
    </div>
  );
}
