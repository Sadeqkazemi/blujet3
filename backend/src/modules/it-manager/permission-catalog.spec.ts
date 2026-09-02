import {
  CATALOG_DEPTS,
  PERMISSION_CATALOG,
  catalogDeptFor,
} from './permission-catalog';
import {
  expandEmployeePermissionKeys,
  grantsSatisfyingEmployeePermission,
} from '../../common/employee-permission-dependencies';

describe('phase-one employee permission catalog', () => {
  it('keeps permission keys unique within each catalog department', () => {
    const keys = PERMISSION_CATALOG.map(
      (entry) => `${entry.dept}:${entry.key}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains the commercial and finance action groups requested by IT', () => {
    const commercial = new Set(
      PERMISSION_CATALOG.filter((entry) => entry.dept === 'commercial').map(
        (entry) => entry.key,
      ),
    );
    const finance = new Set(
      PERMISSION_CATALOG.filter((entry) => entry.dept === 'finance').map(
        (entry) => entry.key,
      ),
    );

    expect(
      [
        'ag_list',
        'ag_partners',
        'ag_requests',
        'ag_debtors',
        'rt_create',
        'rt_manage',
        'ac_manage',
        'fl_active',
        'fl_add',
        'fl_assign',
        'fl_completed',
        'fl_cities',
        'fl_costs',
        'fl_history',
        'fl_sales_view',
        'fl_site_sales',
        'fl_agency_sales',
        'fl_agency_allotments',
        'op_manage',
        'sv_manage',
        'rp_passengers',
        'cl_rules_manage',
        'ws_manage',
      ].every((key) => commercial.has(key)),
    ).toBe(true);

    expect(
      [
        'ag_list',
        'ag_settle',
        'cr_manage',
        'fn_dashboard',
        'fn_transactions',
        'fn_settlements',
        'rp_finance',
        'rp_exports',
        'rf_process',
      ].every((key) => finance.has(key)),
    ).toBe(true);
  });

  it('uses the commercial catalog for the sales sub-unit', () => {
    expect(CATALOG_DEPTS).toEqual(['commercial', 'finance', 'it']);
    expect(catalogDeptFor('sales')).toBe('commercial');
  });

  it('keeps IT action grants narrow while accepting legacy section grants', () => {
    expect(expandEmployeePermissionKeys(['us_list'])).toEqual(['us_list']);
    expect(expandEmployeePermissionKeys(['us_create'])).toEqual(['us_create']);
    expect(grantsSatisfyingEmployeePermission('us_list')).toEqual(
      expect.arrayContaining(['us_list', 'us_manage']),
    );
    expect(grantsSatisfyingEmployeePermission('us_list')).not.toContain(
      'us_create',
    );
    expect(grantsSatisfyingEmployeePermission('sv_view')).toEqual(
      expect.arrayContaining(['sv_view', 'sv_control']),
    );
    expect(grantsSatisfyingEmployeePermission('sc_view')).toEqual(
      expect.arrayContaining(['sc_view', 'sc_manage']),
    );
  });
});
