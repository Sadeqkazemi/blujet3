export interface PanelNavItem {
  key: string;
  labelFa: string;
  implemented: boolean;
}

export interface PanelAccessFlag {
  panelKey: string;
  enabled: boolean;
  updatedAt: string | null;
}

export interface EmployeeContext {
  dept: string | null;
  deptLabelFa: string;
  rank: string | null;
  permissionLabelsFa: string[];
  /** Raw granted permission keys (e.g. 'ag_list', 'ag_requests'). */
  permissionKeys: string[];
}
