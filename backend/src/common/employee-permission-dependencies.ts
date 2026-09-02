/**
 * Capabilities that require lower-level read capabilities to render and work.
 *
 * The dependency is persisted for new/updated employees, while the guard also
 * honours it for accounts created before this rule existed. This keeps the
 * menu, page data and mutation endpoints aligned without widening writes.
 */
export const EMPLOYEE_PERMISSION_DEPENDENCIES: Readonly<
  Record<string, readonly string[]>
> = {
  fl_manage: ['fl_view'],
  fl_active: ['fl_view'],
  fl_add: ['fl_view'],
  fl_assign: ['fl_view'],
  fl_completed: ['fl_view'],
  fl_cities: ['fl_view'],
  fl_costs: ['fl_view'],
  fl_history: ['fl_view'],
  fl_sales_view: ['fl_view'],
  fl_site_sales: ['fl_sales_view'],
  fl_agency_sales: ['fl_sales_view'],
  fl_agency_allotments: ['fl_sales_view'],
  rt_create: ['rt_view'],
  rt_manage: ['rt_view'],
  ac_manage: ['ac_view'],
  op_manage: ['op_view'],
  sv_manage: ['sv_view'],
  ws_manage: ['ws_view'],
  cl_rules_manage: ['cl_rules_view'],
  ag_partners: ['ag_list'],
  ag_debtors: ['ag_list'],
  cr_manage: ['cr_view'],
  rp_exports: ['rp_finance'],
  fn_transactions: ['fn_dashboard'],
  fn_settlements: ['fn_dashboard'],
  // IT employee capabilities are deliberately independent.  The old
  // us_* -> us_manage chain made selecting one narrow action silently grant
  // the broad users capability.  Read prerequisites remain explicit, while
  // the legacy umbrella grants below are still accepted by the guard.
  sv_config: ['sv_view'],
  sc_sessions: ['sc_view'],
  lg_export: ['lg_view'],
  ct_process: ['ct_list'],
  rf_details: ['rf_list'],
  rf_process: ['rf_list', 'rf_details'],
};

/**
 * Legacy section-level grants that intentionally cover the detailed actions
 * introduced later.  This is kept separate from selection dependencies so a
 * new action never widens an employee's grant, while existing us_manage /
 * sv_control / sc_manage assignments keep working after the split.
 */
export const EMPLOYEE_PERMISSION_BUNDLES: Readonly<
  Record<string, readonly string[]>
> = {
  us_manage: [
    'us_list',
    'us_create',
    'us_permissions',
    'us_status',
    'us_reset_password',
  ],
  sv_control: ['sv_view'],
  sc_manage: ['sc_view'],
  fl_manage: [
    'fl_sales_view',
    'fl_site_sales',
    'fl_agency_sales',
    'fl_agency_allotments',
  ],
};

export function expandEmployeePermissionKeys(
  permissionKeys: readonly string[],
): string[] {
  const expanded = new Set(permissionKeys);
  const queue = [...permissionKeys];

  while (queue.length > 0) {
    const key = queue.shift();
    if (!key) continue;
    for (const dependency of EMPLOYEE_PERMISSION_DEPENDENCIES[key] ?? []) {
      if (expanded.has(dependency)) continue;
      expanded.add(dependency);
      queue.push(dependency);
    }
  }

  return [...expanded];
}

/** Grants which implicitly satisfy a required capability (including itself). */
export function grantsSatisfyingEmployeePermission(
  requiredKey: string,
): string[] {
  return [
    requiredKey,
    ...Object.keys(EMPLOYEE_PERMISSION_BUNDLES).filter((grantKey) =>
      EMPLOYEE_PERMISSION_BUNDLES[grantKey].includes(requiredKey),
    ),
    ...Object.keys(EMPLOYEE_PERMISSION_DEPENDENCIES).filter((grantKey) =>
      expandEmployeePermissionKeys([grantKey]).includes(requiredKey),
    ),
  ];
}

/** Removing a prerequisite also removes capabilities that depend on it. */
export function dependentEmployeePermissionKeys(
  permissionKey: string,
): string[] {
  return [
    permissionKey,
    ...Object.keys(EMPLOYEE_PERMISSION_DEPENDENCIES).filter((candidateKey) =>
      expandEmployeePermissionKeys([candidateKey]).includes(permissionKey),
    ),
  ];
}
