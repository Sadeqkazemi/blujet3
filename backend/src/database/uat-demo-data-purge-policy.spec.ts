import {
  isUatAccessAccount,
  operationalTables,
  UAT_PRESERVED_TABLES,
} from './uat-demo-data-purge-policy';

describe('UAT demo data purge policy', () => {
  it('preserves only explicit UAT access accounts and the super admin', () => {
    expect(isUatAccessAccount('uat.it', false)).toBe(true);
    expect(isUatAccessAccount('PANEL.finance', false)).toBe(true);
    expect(isUatAccessAccount(null, true)).toBe(true);
    expect(isUatAccessAccount('itadmin', false)).toBe(false);
    expect(isUatAccessAccount(null, false)).toBe(false);
  });

  it('purges operational tables while retaining users and required reference data', () => {
    const result = operationalTables([
      'users',
      'flights',
      'flight_instances',
      'passengers',
      'bookings',
      'club_members',
      'club_points_entries',
      'club_card_requests',
      'wallet_entries',
      'agency_profiles',
      'airports',
      'permissions',
      'system_settings',
      'flights',
    ]);

    expect(result).toEqual([
      'agency_profiles',
      'airports',
      'bookings',
      'club_card_requests',
      'club_members',
      'club_points_entries',
      'flight_instances',
      'flights',
      'passengers',
      'wallet_entries',
    ]);
    expect(UAT_PRESERVED_TABLES.has('airports')).toBe(false);
    expect(UAT_PRESERVED_TABLES.has('bookings')).toBe(false);
  });
});
