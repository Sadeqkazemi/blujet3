import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ReportingController } from './reporting.controller';

describe('ReportingController employee finance access', () => {
  it.each([
    ['financeDashboardStats', 'fn_dashboard'],
    ['recentTransactions', 'fn_transactions'],
    ['agencySettlements', 'fn_settlements'],
  ] as const)('%s is delegated only through %s', (method, permission) => {
    const handler = ReportingController.prototype[method];
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toContain('EMPLOYEE');
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, handler)).toEqual([
      permission,
    ]);
  });
});
