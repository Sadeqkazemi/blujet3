const PERMISSION_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
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
  // IT employee actions stay independent; selecting one must not silently
  // grant the section-wide users/security capability.
  sv_config: ['sv_view'],
  sc_sessions: ['sc_view'],
  lg_export: ['lg_view'],
  ct_process: ['ct_list'],
  rf_details: ['rf_list'],
  rf_process: ['rf_list', 'rf_details'],
};

export function expandPermissionSelection(keys: Iterable<string>): Set<string> {
  const expanded = new Set(keys);
  const queue = [...expanded];

  while (queue.length > 0) {
    const key = queue.shift();
    if (!key) continue;
    for (const dependency of PERMISSION_DEPENDENCIES[key] ?? []) {
      if (expanded.has(dependency)) continue;
      expanded.add(dependency);
      queue.push(dependency);
    }
  }

  return expanded;
}

export function togglePermissionSelection(
  current: ReadonlySet<string>,
  permissionKey: string,
): Set<string> {
  if (!current.has(permissionKey)) {
    return expandPermissionSelection([...current, permissionKey]);
  }

  const next = new Set(current);
  for (const selectedKey of current) {
    if (
      selectedKey === permissionKey ||
      expandPermissionSelection([selectedKey]).has(permissionKey)
    ) {
      next.delete(selectedKey);
    }
  }
  return next;
}
