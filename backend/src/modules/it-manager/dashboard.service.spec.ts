import { ItDashboardService } from './dashboard.service';

function repository(overrides: Record<string, unknown> = {}) {
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function serviceWith(options?: {
  internal?: Array<{ nameFa: string; enabled: boolean; uptimePct: number }>;
  external?: Array<{ enabled: boolean }>;
}) {
  const refreshTokens = repository();
  const internalServices = repository({
    find: jest.fn().mockResolvedValue(options?.internal ?? []),
  });
  const backups = repository();
  const auditLogs = repository();
  const externalServices = repository({
    find: jest.fn().mockResolvedValue(options?.external ?? []),
  });
  const service = new ItDashboardService(
    refreshTokens as never,
    internalServices as never,
    backups as never,
    auditLogs as never,
    externalServices as never,
  );
  jest.spyOn(service as never, 'diskUsedPct').mockResolvedValue(null);
  jest.spyOn(service as never, 'bandwidthUsedPct').mockResolvedValue(null);
  return service;
}

describe('ItDashboardService aggregate health', () => {
  it('does not report an empty service catalogue as healthy', async () => {
    const result = await serviceWith().get();

    expect(result.kpis.servicesTotal).toBe(0);
    expect(result.kpis.allServicesHealthy).toBe(false);
  });

  it('includes disabled external dependencies in aggregate health', async () => {
    const result = await serviceWith({
      internal: [{ nameFa: 'موتور جستجو', enabled: true, uptimePct: 99.9 }],
      external: [{ enabled: true }, { enabled: false }],
    }).get();

    expect(result.kpis.servicesUp).toBe(2);
    expect(result.kpis.servicesTotal).toBe(3);
    expect(result.kpis.allServicesHealthy).toBe(false);
  });

  it('reports healthy only when every configured dependency is enabled', async () => {
    const result = await serviceWith({
      internal: [{ nameFa: 'موتور جستجو', enabled: true, uptimePct: 100 }],
      external: [{ enabled: true }],
    }).get();

    expect(result.kpis.allServicesHealthy).toBe(true);
  });
});
