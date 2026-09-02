import {
  permissionForNavKey,
  permissionForRequestPath,
} from './manager-panel-permissions';

describe('manager panel permission mapping', () => {
  it('maps related nav items to the same coarse permission', () => {
    expect(permissionForNavKey('flightops')).toBe('flights');
    expect(permissionForNavKey('aircraft')).toBe('flights');
    expect(permissionForNavKey('routes')).toBe('flights');
    expect(permissionForNavKey('mgrreports')).toBe('reports');
    expect(permissionForNavKey('reservation')).toBe('flights');
    expect(permissionForNavKey('survey')).toBe('reports');
    expect(permissionForNavKey('dashboard')).toBe('dashboard');
    expect(permissionForNavKey('notices')).toBe('content');
  });

  it('normalizes API-prefixed request paths', () => {
    expect(permissionForRequestPath('/api/admins/a1/permissions')).toBe(
      'admins',
    );
    expect(permissionForRequestPath('/api/flights/123?mode=edit')).toBe(
      'flights',
    );
    expect(permissionForRequestPath('/api/agencies/requests/42/approve')).toBe(
      'approvals',
    );
    expect(permissionForRequestPath('/api/reservation/flights')).toBe(
      'flights',
    );
    expect(permissionForRequestPath('/api/survey/results')).toBe('reports');
    expect(permissionForRequestPath('/api/audit/manager-reports')).toBe(
      'reports',
    );
    expect(permissionForRequestPath('/api/notifications')).toBeNull();
    expect(permissionForRequestPath('/api/agency-bulletins/admin')).toBe(
      'content',
    );
  });
});
