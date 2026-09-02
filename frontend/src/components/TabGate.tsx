import { Outlet, useOutletContext } from 'react-router-dom';
import ComingSoonPage from './ComingSoonPage';
import type { PanelShellContext } from '../types/panel-shell';

/** Renders the tab's real pages only when this role's nav entry is
 * implemented — otherwise the shared coming-soon placeholder, never a
 * broken fetch-and-error page (same pattern as DashboardRouter). */
export default function TabGate({ tabKey }: { tabKey: string }) {
  const ctx = useOutletContext<PanelShellContext>();
  const entry = ctx.nav?.find((item) => item.key === tabKey);

  if (ctx.nav !== null && (!entry || !entry.implemented)) {
    return <ComingSoonPage />;
  }

  return <Outlet context={ctx} />;
}
