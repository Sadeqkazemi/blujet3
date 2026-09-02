import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchNav } from '../api/panels';
import {
  fetchCartable,
  fetchCartableUnreadCount,
  fetchMyReferrals,
  fetchReferrals,
} from '../api/cartable';
import { fetchRefunds } from '../api/refunds';
import { fetchLowSalesAlerts, fetchStaffReports } from '../api/reporting';
import { runFlightsAiAnalysis } from '../api/flights';
import { fetchLogsBadgeCount } from '../api/audit';
import { fetchCeoPricing, fetchPendingApprovalsCount } from '../api/pricing';
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markNotificationRead,
} from '../api/notifications';
import { fetchSupportTickets } from '../api/support-tickets';
import { fetchCustomersIncompleteCount } from '../api/customers';
import { fetchAdminLoanApplications } from '../api/loans';
import { fetchFinancialIntegrations } from '../api/finance-manager';
import type { NotificationRow } from '../types/notifications';
import { faDigits } from '../lib/fa-format';
import type { PanelNavItem } from '../types/panels';
import type { LowSalesAlert } from '../types/reporting';
import { isLowSalesRole } from '../types/panel-shell';
import PanelNotificationBell, { type PanelNotificationItem } from './PanelNotificationBell';
import PanelNotifBell from './PanelNotifBell';
import PanelSearchBox from './PanelSearchBox';
import { PANEL_BRAND_PLANE_ICON, panelNavIcon } from './panel-nav-icons';
import SuperAdminSandboxAccess from './SuperAdminSandboxAccess';
import ConfirmActionDialog from './ConfirmActionDialog';
import { usePanelNotify } from '../hooks/usePanelNotify';
import { usePanelInactivityLogout } from '../hooks/usePanelInactivityLogout';
import { commercialNavWithServices } from './commercial-nav';
import PanelThemeToggle from './PanelThemeToggle';
import { usePanelTheme } from '../hooks/usePanelTheme';

const ROLE_LABELS: Record<string, string> = {
  CEO: 'مدیر عامل',
  BOARD_CHAIR: 'رئیس هیئت مدیره',
  SENIOR_MANAGER: 'مدیر ارشد',
  FINANCE_MANAGER: 'مدیر مالی',
  COMMERCIAL_MANAGER: 'مدیر بازرگانی',
  OPERATIONS_MANAGER: 'مدیر عملیات',
  IT_MANAGER: 'مدیر فناوری اطلاعات',
  SITE_ADMIN: 'ادمین سایت',
  EMPLOYEE: 'کارمند',
};

/** Must stay in sync with backend `SITE_ADMIN_SIDEBAR_DENYLIST`. */
const SITE_ADMIN_SIDEBAR_DENYLIST = new Set(['kyc', 'settings']);

/** Brand subtitle under «blujet» — sampled from each panel's design sidebar. */
const ROLE_BRAND_SUB: Record<string, string> = {
  IT_MANAGER: 'پنل فناوری اطلاعات',
  EMPLOYEE: 'پنل کارمند',
  // Logo line in design HTML / screenshots is «پنل مدیریت» (not roleDefs.sub).
  SITE_ADMIN: 'پنل مدیریت',
  OPERATIONS_MANAGER: 'پنل مدیریت',
};

type NavBadge = { count: number; className: string };

function notificationTarget(n: NotificationRow): string {
  const type = (n.entityType ?? '').toUpperCase();
  if (n.category === 'CARTABLE' || type.includes('CARTABLE')) return '/panel/cartable';
  if (n.category === 'APPROVAL' || type.includes('PRICING')) return '/panel/pricing';
  if (n.category === 'REQUEST' || type.includes('AGENCY')) return '/panel/agencies';
  if (type.includes('REFERRAL')) return '/panel/referrals';
  if (type.includes('REFUND')) return '/panel/refund';
  return '/panel';
}

export default function PanelShell() {
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = usePanelNotify();
  const [nav, setNav] = useState<PanelNavItem[] | null>(null);
  const [badges, setBadges] = useState<Record<string, NavBadge>>({});
  const [notifications, setNotifications] = useState<PanelNotificationItem[]>([]);
  const [lowSalesAlerts, setLowSalesAlerts] = useState<LowSalesAlert[]>([]);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const autoAiRequestedRef = useRef(false);
  const inactivityLogoutStartedRef = useRef(false);
  const { theme, toggleTheme } = usePanelTheme();

  const onInactivityTimeout = useCallback(() => {
    if (inactivityLogoutStartedRef.current) return;
    inactivityLogoutStartedRef.current = true;
    void signOut().finally(() => {
      navigate('/login?reason=inactive', { replace: true });
    });
  }, [navigate, signOut]);

  usePanelInactivityLogout({
    enabled: status === 'authenticated' && Boolean(user),
    onTimeout: onInactivityTimeout,
  });

  useEffect(() => {
    fetchNav()
      .then(setNav)
      .catch(() => setNav([]));
  }, []);

  useEffect(() => {
    if (!isLowSalesRole(user?.role)) {
      setLowSalesAlerts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let alerts = await fetchLowSalesAlerts();
        if (
          user?.role === 'COMMERCIAL_MANAGER' &&
          !autoAiRequestedRef.current &&
          alerts.some((alert) => alert.suggestedPriceIrr == null)
        ) {
          autoAiRequestedRef.current = true;
          const result = await runFlightsAiAnalysis();
          if (result.available) alerts = await fetchLowSalesAlerts();
        }
        if (!cancelled) setLowSalesAlerts(alerts);
      } catch {
        if (!cancelled) setLowSalesAlerts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.role]);

  const visibleNav = useMemo(() => {
    if (nav === null) return null;
    let items = nav;
    if (!user?.isSuperAdmin && user?.role === 'SITE_ADMIN') {
      items = items.filter((item) => !SITE_ADMIN_SIDEBAR_DENYLIST.has(item.key));
    }
    if (user?.role === 'COMMERCIAL_MANAGER') {
      items = commercialNavWithServices(items);
    }
    return items;
  }, [nav, user?.role, user?.isSuperAdmin]);

  const navKeys = useMemo(() => new Set(visibleNav?.map((item) => item.key) ?? []), [visibleNav]);

  useEffect(() => {
    if (!visibleNav || visibleNav.length === 0) return;

    const next: Record<string, NavBadge> = {};
    const nextNotifications: PanelNotificationItem[] = [];
    const tasks: Promise<void>[] = [];

    tasks.push(
      Promise.all([
        fetchNotificationsUnreadCount().catch(() => null),
        fetchNotifications({ unreadOnly: true, limit: 8 }).catch(
          () => [] as NotificationRow[],
        ),
      ]).then(([counts, rows]) => {
        if (counts && counts.total > 0) {
          nextNotifications.push(
            ...rows.map((n) => ({
              key: `notif-${n.id}`,
              title: n.title,
              sublabel: n.body,
              to: notificationTarget(n),
              tone: 'warning' as const,
              onOpen: async () => {
                await markNotificationRead(n.id);
                setNotifications((current) => current.filter((item) => item.key !== `notif-${n.id}`));
              },
            })),
          );
        }
        if (counts && counts.CARTABLE > 0 && navKeys.has('cartable')) {
          next.cartable = {
            count: counts.CARTABLE,
            className: 'bg-danger text-white',
          };
        }
        if (counts && counts.APPROVAL > 0 && navKeys.has('pricing') && user?.role === 'CEO') {
          next.pricing = {
            count: counts.APPROVAL,
            className: 'bg-[#a78bfa] text-white',
          };
        }
      }),
    );

    if (navKeys.has('cartable')) {
      tasks.push(
        Promise.all([
          fetchCartableUnreadCount().catch(() => null),
          fetchCartable().catch(() => null),
        ]).then(([unread, list]) => {
          const count = unread?.count ?? list?.totalOpen ?? 0;
          if (count > 0 && !next.cartable) {
            next.cartable = {
              count,
              className: 'bg-danger text-white',
            };
          }
          if (list) {
            for (const t of list.tasks.slice(0, 5)) {
              if (nextNotifications.some((n) => n.key === `cartable-${t.id}`)) continue;
              nextNotifications.push({
                key: `cartable-${t.id}`,
                title: t.title,
                sublabel: t.senderLabelFa ?? t.sender?.fullName ?? undefined,
                to: '/panel/cartable',
                tone: 'danger',
              });
            }
          }
        }),
      );
    }

    if (navKeys.has('refund') && (user?.role === 'FINANCE_MANAGER' || user?.role === 'SITE_ADMIN')) {
      tasks.push(
        fetchRefunds()
          .then((r) => {
            if (user?.role === 'FINANCE_MANAGER') {
              if (r.kpis.payoutQueue > 0) {
                next.refund = {
                  count: r.kpis.payoutQueue,
                  className: 'bg-[#a855f7] text-white',
                };
                nextNotifications.push({
                  key: 'refund-queue',
                  title: 'استرداد در صف پرداخت',
                  sublabel: `${faDigits(r.kpis.payoutQueue)} مورد`,
                  to: '/panel/refund',
                  tone: 'purple',
                });
              }
            } else {
              const awaiting = r.requests.filter((row) => row.status === 'SUBMITTED' || row.status === 'REVIEW').length;
              if (awaiting > 0) {
                next.refund = {
                  count: awaiting,
                  className: 'bg-[#f59e0b] text-[#0f1623]',
                };
                nextNotifications.push({
                  key: 'refund-review',
                  title: 'استرداد در انتظار بررسی',
                  sublabel: `${faDigits(awaiting)} مورد`,
                  to: '/panel/refund',
                  tone: 'warning',
                });
              }
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('staff')) {
      tasks.push(
        fetchStaffReports()
          .then((r) => {
            if (r.newEmployeeEvents.length > 0) {
              next.staff = {
                count: r.newEmployeeEvents.length,
                className: 'bg-danger text-white',
              };
              nextNotifications.push({
                key: 'staff-events',
                title: 'رویدادهای جدید کارمندان',
                sublabel: `${faDigits(r.newEmployeeEvents.length)} مورد`,
                to: '/panel/staff',
                tone: 'danger',
              });
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('integrations')) {
      tasks.push(
        fetchFinancialIntegrations()
          .then((result) => {
            if (result.connectedCount > 0) {
              next.integrations = {
                count: result.connectedCount,
                className: 'bg-[#6ee7b7] text-[#0f3a2d]',
              };
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('logs') && user?.role === 'IT_MANAGER') {
      tasks.push(
        fetchLogsBadgeCount()
          .then((r) => {
            if (r.count > 0) {
              next.logs = { count: r.count, className: 'bg-danger text-white' };
              nextNotifications.push({
                key: 'logs-alerts',
                title: 'رویدادهای امنیتی جدید',
                sublabel: `${faDigits(r.count)} مورد`,
                to: '/panel/logs',
                tone: 'danger',
              });
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('referrals')) {
      if (user?.role === 'EMPLOYEE') {
        tasks.push(
          fetchMyReferrals()
            .then((r) => {
              if (r.counts.awaitingMyReport > 0) {
                next.referrals = {
                  count: r.counts.awaitingMyReport,
                  className: 'bg-[#a855f7] text-white',
                };
                nextNotifications.push({
                  key: 'referrals-awaiting',
                  title: 'ارجاعات در انتظار گزارش',
                  sublabel: `${faDigits(r.counts.awaitingMyReport)} مورد`,
                  to: '/panel/referrals',
                  tone: 'purple',
                });
              }
            })
            .catch(() => undefined),
        );
      } else if (user?.role === 'SENIOR_MANAGER') {
        tasks.push(
          fetchReferrals()
            .then((r) => {
              if (r.kpis.awaitingReport > 0) {
                next.referrals = {
                  count: r.kpis.awaitingReport,
                  className: 'bg-[#a855f7] text-white',
                };
                nextNotifications.push({
                  key: 'referrals-awaiting',
                  title: 'ارجاعات در انتظار گزارش',
                  sublabel: `${faDigits(r.kpis.awaitingReport)} مورد`,
                  to: '/panel/referrals',
                  tone: 'purple',
                });
              }
            })
            .catch(() => undefined),
        );
      }
    }

    if (navKeys.has('pricing') && user?.role === 'CEO') {
      tasks.push(
        fetchPendingApprovalsCount()
          .then((r) => {
            if (r.pendingApprovalsCount > 0) {
              next.pricing = {
                count: r.pendingApprovalsCount,
                className: 'bg-[#a78bfa] text-white',
              };
            }
          })
          .catch(() =>
            fetchCeoPricing()
              .then((r) => {
                if (r.pending.length > 0) {
                  next.pricing = {
                    count: r.pending.length,
                    className: 'bg-[#a78bfa] text-white',
                  };
                }
              })
              .catch(() => undefined),
          ),
      );
    }

    if (navKeys.has('tickets') && user?.role === 'SITE_ADMIN') {
      tasks.push(
        fetchSupportTickets()
          .then((rows) => {
            const open = rows.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
            if (open > 0) {
              next.tickets = {
                count: open,
                className: 'bg-[#f59e0b] text-[#0f1623]',
              };
              nextNotifications.push({
                key: 'tickets-open',
                title: 'تیکت باز',
                sublabel: `${faDigits(open)} مورد`,
                to: '/panel/tickets',
                tone: 'warning',
              });
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('customers') && (user?.role === 'SITE_ADMIN' || user?.role === 'SENIOR_MANAGER')) {
      tasks.push(
        fetchCustomersIncompleteCount()
          .then((r) => {
            if (r.count > 0) {
              next.customers = {
                count: r.count,
                className: 'bg-[#f59e0b] text-[#0f1623]',
              };
            }
          })
          .catch(() => undefined),
      );
    }

    if (navKeys.has('loans') && user?.role === 'SITE_ADMIN') {
      tasks.push(
        fetchAdminLoanApplications(1, 100)
          .then((result) => {
            const pending = result.items.filter((item) =>
              ['processing', 'awaiting_bank', 'under_review'].includes(item.displayStatus),
            ).length;
            if (pending > 0) {
              next.loans = {
                count: pending,
                className: 'bg-[#f59e0b] text-[#0f1623]',
              };
            }
          })
          .catch(() => undefined),
      );
    }

    void Promise.all(tasks).then(() => {
      setBadges(next);
      // The bell is a strict unread inbox. Operational counters stay on their
      // sidebar entries and only persisted unread notifications appear here.
      setNotifications(nextNotifications.filter((item) => item.key.startsWith('notif-')));
    });
    // Recompute when the active panel tab changes so badges refresh after
    // reading/acting on cartable, referrals, tickets, etc.
  }, [visibleNav, navKeys, user?.role, lowSalesAlerts, location.pathname]);

  async function onSignOut() {
    setLogoutBusy(true);
    try {
      await signOut();
      notify('با موفقیت از پنل خارج شدید.', 'success');
      navigate('/login', { replace: true });
    } catch {
      notify('خروج با خطا مواجه شد.', 'error');
    } finally {
      setLogoutBusy(false);
      setLogoutConfirmOpen(false);
    }
  }

  const roleLabel = user?.isSuperAdmin ? 'سوپر ادمین' : user ? (ROLE_LABELS[user.role] ?? user.role) : '';
  const brandSub = (user?.role ? ROLE_BRAND_SUB[user.role] : undefined) ?? 'پنل مدیریت';

  /** Executive roles retain their compact header layout on the shared light palette. */
  const executiveShell =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER' ||
    user?.role === 'COMMERCIAL_MANAGER' ||
    user?.role === 'OPERATIONS_MANAGER';
  const onDashboard = /^\/panel\/?$/.test(location.pathname);
  const showExecNotifChrome = executiveShell && isLowSalesRole(user?.role) && !onDashboard;
  const notifAlerts = lowSalesAlerts.slice(1);

  return (
    <div
      dir="rtl"
      data-testid="management-panel-shell"
      data-theme={theme}
      className={`management-panel-${theme} flex min-h-screen bg-panel-canvas font-sans text-panel-ink`}
    >
      <aside className="sticky top-0 flex h-screen w-[248px] flex-none flex-col gap-1.5 border-l border-panel-border bg-panel-surface px-[11px] py-[15px] text-panel-ink shadow-[-8px_0_30px_-24px_rgba(13,38,64,.35)]">
        <div className="flex items-center gap-[9px] px-2 pb-3.5 pt-[7px]">
          <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[#3b82f6] text-white">
            {PANEL_BRAND_PLANE_ICON}
          </div>
          <div className="leading-[1.3]">
            <div className="text-[15.5px] font-black text-panel-ink">blujet</div>
            <div className="text-[10px] text-panel-muted">{brandSub}</div>
          </div>
        </div>

        {user?.role !== 'EMPLOYEE' && (
          <div className="px-[5px] pb-[11px]">
            <label className="mb-1.5 block pr-[3px] text-[10px] text-panel-muted">نقش این پنل</label>
            <div className="flex items-center gap-[7px] rounded-[10px] border border-panel-border bg-panel-surface-2 px-[11px] py-[9px]">
              <span className="h-2 w-2 flex-none rounded-full bg-[#3b82f6]" />
              <span className="text-xs font-extrabold text-panel-ink">{roleLabel}</span>
            </div>
          </div>
        )}

        <SuperAdminSandboxAccess />

        <div className="px-[5px] pb-2">
          <PanelThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {visibleNav === null && <div className="px-2 py-3 text-xs text-panel-muted-2">در حال بارگذاری…</div>}
          {visibleNav?.length === 0 && (
            <div className="px-2 py-3 text-xs text-panel-muted-2">تبی برای این نقش تعریف نشده است.</div>
          )}
          {visibleNav?.map((item) => {
            const badge = badges[item.key];
            return (
              <NavLink
                key={item.key}
                to={item.key === 'dashboard' ? '/panel' : `/panel/${item.key}`}
                end={item.key === 'dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-[11px] px-[11px] py-2.5 text-[12.5px] transition ${
                    isActive
                      ? 'bg-[rgba(22,104,196,.12)] font-bold text-accent'
                      : 'font-medium text-panel-muted hover:bg-panel-surface-2 hover:text-panel-ink'
                  }`
                }
              >
                <span className="flex h-5 w-5 flex-none items-center justify-center">{panelNavIcon(item.key)}</span>
                <span className="flex-1">{item.labelFa}</span>
                {badge && (
                  <span
                    data-testid={`nav-badge-${item.key}`}
                    className={`font-num flex h-5 min-w-5 items-center justify-center rounded-[10px] px-[5px] text-center text-[10px] font-extrabold ${badge.className}`}
                  >
                    {faDigits(badge.count)}
                  </span>
                )}
                {!item.implemented && <span className="text-[10px] text-[#5a6678]">به‌زودی</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="-mx-[11px] -mb-[15px] mt-auto flex-none border-t border-panel-border">
          <button
            type="button"
            data-testid="panel-logout"
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex min-h-[72px] w-full items-center gap-2 px-[22px] text-right text-xs font-bold text-[#dc4545] transition hover:bg-red-50 hover:text-[#b91c1c]"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {executiveShell ? (
          showExecNotifChrome ? (
            <div className="flex items-center justify-end gap-2.5 px-[21px] pt-[18px]">
              <div className="flex h-[42px] w-[230px] items-center gap-2 rounded-[10px] border border-panel-border bg-panel-surface px-3 text-[12px] text-panel-muted shadow-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <span>جستجو…</span>
              </div>
              <PanelNotifBell alerts={notifAlerts} variant="light" />
            </div>
          ) : null
        ) : (
          <div className="flex items-center justify-end gap-3 border-b border-panel-border px-8 py-3">
            <PanelNotificationBell items={notifications} />
            <PanelSearchBox nav={visibleNav ?? []} />
          </div>
        )}
        <Outlet context={{ nav: visibleNav, lowSalesAlerts }} />
      </main>
      <ConfirmActionDialog
        open={logoutConfirmOpen}
        title="خروج از حساب"
        message="آیا مطمئن هستید که می‌خواهید از پنل مدیریت خارج شوید؟"
        confirmLabel="بله، خارج شو"
        cancelLabel="انصراف"
        busy={logoutBusy}
        busyLabel="در حال خروج…"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={onSignOut}
        variant={theme}
        testId="panel-logout-confirm"
      />
    </div>
  );
}
