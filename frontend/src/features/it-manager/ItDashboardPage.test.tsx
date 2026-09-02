import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ItDashboardPage from './ItDashboardPage';
import * as itApi from '../../api/it-manager';
import type { ItDashboardData } from '../../types/it-manager';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const DATA: ItDashboardData = {
  kpis: {
    servicesUp: 14,
    servicesTotal: 16,
    uptime30dPct: 99.98,
    activeSessions: 6,
    securityAlerts: 0,
    allServicesHealthy: true,
    lastBackupStatus: 'SUCCESS',
    lastBackupAt: '2026-07-17T09:00:00.000Z',
  },
  serviceHealth: [
    { name: 'موتور جستجوی پرواز', uptimePct: 99.99, enabled: true },
    { name: 'استرداد آنلاین', uptimePct: 98.2, enabled: false },
  ],
  resources: { cpuUsedPct: 34, memoryUsedPct: 42.5, diskUsedPct: 48, bandwidthUsedPct: 12, loadAvg1m: 0.85, cpuCount: 4, uptimeSeconds: 3600 },
  recentEvents: [
    { id: 'e1', text: 'کارمند «رضا کاظمی» ایجاد شد.', category: 'ACCOUNT', createdAt: '2026-07-17T08:00:00.000Z' },
  ],
};

describe('ItDashboardPage', () => {
  it('renders design-aligned KPI cards, health badge and service list', async () => {
    vi.spyOn(itApi, 'fetchItDashboard').mockResolvedValue(DATA);

    render(<ItDashboardPage />);

    expect(await screen.findByText('داشبورد فنی')).toBeInTheDocument();
    expect(screen.getByText('نمای کلی سلامت زیرساخت و سرویس‌های blujet')).toBeInTheDocument();
    expect(screen.getByText('همه سامانه‌ها سالم')).toBeInTheDocument();
    expect(screen.getByText('سرویس فعال')).toBeInTheDocument();
    expect(screen.getByText('آپ‌تایم ۳۰ روز')).toBeInTheDocument();
    expect(screen.getByText('سلامت سرویس‌ها')).toBeInTheDocument();
    expect(screen.getByText('استفاده از منابع سرور')).toBeInTheDocument();
    expect(screen.getByText('موتور جستجوی پرواز')).toBeInTheDocument();
    expect(screen.getByText('کارمند «رضا کاظمی» ایجاد شد.')).toBeInTheDocument();
  });

  it('shows empty events copy when there are no recent events', async () => {
    vi.spyOn(itApi, 'fetchItDashboard').mockResolvedValue({
      ...DATA,
      recentEvents: [],
    });
    render(<ItDashboardPage />);
    expect(await screen.findByText('رویدادی ثبت نشده است.')).toBeInTheDocument();
  });
});
