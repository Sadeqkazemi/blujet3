import { ForbiddenException } from '@nestjs/common';
import {
  ALL_PANEL_KEYS,
  EMPLOYEE_SECTION_NAV,
  PANEL_ACCESS_TOGGLE_RIGHTS,
  PANEL_NAV,
} from './panel-nav.config';
import { PanelsService } from './panels.service';

describe('operations panel access contract', () => {
  it('keeps the unified cartable reachable for IT management', () => {
    expect(PANEL_NAV.IT_MANAGER?.map((item) => item.key)).toContain('cartable');
  });

  it('keeps support and agency bulletins in the site-admin panel only', () => {
    const siteAdminKeys = PANEL_NAV.SITE_ADMIN?.map((item) => item.key) ?? [];
    expect(siteAdminKeys).toEqual(
      expect.arrayContaining(['cartable', 'tickets', 'notices']),
    );
    for (const [role, items] of Object.entries(PANEL_NAV)) {
      if (role === 'SITE_ADMIN') continue;
      expect(items?.map((item) => item.key)).not.toContain('tickets');
      expect(items?.map((item) => item.key)).not.toContain('notices');
    }
  });

  it('publishes aircraft definition only in commercial navigation', () => {
    expect(PANEL_NAV.COMMERCIAL_MANAGER?.map((item) => item.key)).toContain(
      'aircraft',
    );
    expect(PANEL_NAV.SENIOR_MANAGER?.map((item) => item.key)).not.toContain(
      'aircraft',
    );
  });

  it('wires current commercial sales and finance operations into employee navigation', () => {
    expect(EMPLOYEE_SECTION_NAV.flights.wiredKeys).toEqual(
      expect.arrayContaining([
        'fl_sales_view',
        'fl_site_sales',
        'fl_agency_sales',
        'fl_agency_allotments',
      ]),
    );
    expect(EMPLOYEE_SECTION_NAV.finance.wiredKeys).toEqual(
      expect.arrayContaining([
        'fn_dashboard',
        'fn_transactions',
        'fn_settlements',
      ]),
    );
    expect(EMPLOYEE_SECTION_NAV['ancillary-services'].wiredKeys).toEqual(
      expect.arrayContaining(['sv_view', 'sv_manage']),
    );
    expect(EMPLOYEE_SECTION_NAV['ancillary-services'].depts).toEqual(
      expect.arrayContaining(['commercial', 'sales']),
    );
    expect(EMPLOYEE_SECTION_NAV.services.depts).toEqual(['it']);
  });

  it('maps the shared service permission key to the employee department surface', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ dept: 'commercial' }),
    };
    const permissionRepo = {
      find: jest.fn().mockResolvedValue([{ permission: { key: 'sv_view' } }]),
    };
    const service = new PanelsService(
      userRepo as never,
      permissionRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const nav = await service.getNav({
      id: 'employee-1',
      role: 'EMPLOYEE',
      fullName: 'کارمند بازرگانی',
      isSuperAdmin: false,
    });

    expect(nav.map((item) => item.key)).toContain('ancillary-services');
    expect(nav.map((item) => item.key)).not.toContain('services');
  });

  it('exposes manager creation and password management to the Board Chair panel', () => {
    const keys = PANEL_NAV.BOARD_CHAIR?.map((item) => item.key) ?? [];
    expect(keys).toContain('admins');
    expect(keys).toContain('security');
  });

  it('is controllable by CEO and senior manager', () => {
    expect(ALL_PANEL_KEYS).toContain('OPERATIONS');
    expect(PANEL_ACCESS_TOGGLE_RIGHTS.CEO).toContain('OPERATIONS');
    expect(PANEL_ACCESS_TOGGLE_RIGHTS.SENIOR_MANAGER).toContain('OPERATIONS');
  });

  it('returns ACCESS_REVOKED for a disabled operations panel', async () => {
    const panelRepo = {
      findOneBy: jest
        .fn<() => Promise<{ panelKey: string; enabled: boolean }>>()
        .mockResolvedValue({ panelKey: 'OPERATIONS', enabled: false }),
    };
    const service = new PanelsService(
      {} as never,
      {} as never,
      panelRepo as never,
      {} as never,
      {} as never,
    );

    let caught: unknown;
    try {
      await service.assertPanelEnabledForSelf('OPERATIONS_MANAGER');
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({
      code: 'ACCESS_REVOKED',
    });
  });

  it('revokes every live operations-manager refresh session when disabled', async () => {
    let capturedFindOptions: unknown;
    const findUsers = jest
      .fn<(options: unknown) => Promise<Array<{ id: string }>>>()
      .mockImplementation((options) => {
        capturedFindOptions = options;
        return Promise.resolve([{ id: 'ops-1' }, { id: 'ops-2' }]);
      });
    const userRepo = { find: findUsers };
    const panelRepo = {
      upsert: jest
        .fn<(row: unknown, keys: unknown) => Promise<void>>()
        .mockResolvedValue(undefined),
      findOneByOrFail: jest
        .fn<() => Promise<{ panelKey: string; enabled: boolean }>>()
        .mockResolvedValue({ panelKey: 'OPERATIONS', enabled: false }),
    };
    let capturedRefreshCriteria: unknown;
    let capturedRefreshPatch: unknown;
    const updateRefreshTokens = jest
      .fn<
        (criteria: unknown, patch: unknown) => Promise<{ affected: number }>
      >()
      .mockImplementation((criteria, patch) => {
        capturedRefreshCriteria = criteria;
        capturedRefreshPatch = patch;
        return Promise.resolve({ affected: 2 });
      });
    const refreshRepo = { update: updateRefreshTokens };
    const audit = {
      record: jest
        .fn<(entry: unknown) => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    const service = new PanelsService(
      userRepo as never,
      {} as never,
      panelRepo as never,
      refreshRepo as never,
      audit as never,
    );

    await service.setAccessFlag(
      { id: 'ceo-1', role: 'CEO', fullName: 'مدیر عامل', isSuperAdmin: false },
      'OPERATIONS',
      false,
    );

    const findOptions = capturedFindOptions as {
      where: { role: string };
    };
    expect(findOptions.where.role).toBe('OPERATIONS_MANAGER');
    const refreshCriteria = capturedRefreshCriteria as {
      userId: unknown;
      revokedAt: unknown;
    };
    const refreshPatch = capturedRefreshPatch as {
      revokedAt: Date;
    };
    expect(refreshCriteria.userId).toBeDefined();
    expect(refreshCriteria.revokedAt).toBeDefined();
    expect(refreshPatch.revokedAt).toBeInstanceOf(Date);
  });
});
