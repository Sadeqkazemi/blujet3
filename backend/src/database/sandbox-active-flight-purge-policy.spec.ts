import {
  SANDBOX_FLIGHT_PURGE_TABLE_ORDER,
  assertSandboxPurgeEnvironmentAllowed,
  parseSandboxFlightPurgeArgs,
} from './sandbox-active-flight-purge-policy';

describe('Sandbox active-flight purge policy', () => {
  describe('assertSandboxPurgeEnvironmentAllowed', () => {
    it('refuses when NODE_ENV=production, regardless of AUTH_SANDBOX_ENABLED', () => {
      expect(() =>
        assertSandboxPurgeEnvironmentAllowed({
          NODE_ENV: 'production',
          AUTH_SANDBOX_ENABLED: 'true',
        }),
      ).toThrow(/NODE_ENV must NOT equal production/);
    });

    it('refuses when AUTH_SANDBOX_ENABLED is not exactly "true"', () => {
      expect(() =>
        assertSandboxPurgeEnvironmentAllowed({
          NODE_ENV: 'test',
          AUTH_SANDBOX_ENABLED: 'false',
        }),
      ).toThrow(/AUTH_SANDBOX_ENABLED must equal true/);
      expect(() =>
        assertSandboxPurgeEnvironmentAllowed({ NODE_ENV: 'test' }),
      ).toThrow(/AUTH_SANDBOX_ENABLED must equal true/);
    });

    it('allows a non-production sandbox with AUTH_SANDBOX_ENABLED=true', () => {
      expect(() =>
        assertSandboxPurgeEnvironmentAllowed({
          NODE_ENV: 'test',
          AUTH_SANDBOX_ENABLED: 'true',
        }),
      ).not.toThrow();
      expect(() =>
        assertSandboxPurgeEnvironmentAllowed({
          NODE_ENV: 'development',
          AUTH_SANDBOX_ENABLED: 'TRUE',
        }),
      ).not.toThrow();
    });
  });

  describe('parseSandboxFlightPurgeArgs', () => {
    it('parses repeated and comma-separated --flight-no, and --actor', () => {
      const parsed = parseSandboxFlightPurgeArgs([
        '--flight-no=IR101',
        '--flight-no=IR102,IR103',
        '--actor=it.admin',
      ]);
      expect(parsed.flightNos.sort()).toEqual(['IR101', 'IR102', 'IR103']);
      expect(parsed.all).toBe(false);
      expect(parsed.actorUsername).toBe('it.admin');
    });

    it('dedupes repeated flight numbers', () => {
      const parsed = parseSandboxFlightPurgeArgs([
        '--flight-no=IR101',
        '--flight-no=IR101',
      ]);
      expect(parsed.flightNos).toEqual(['IR101']);
    });

    it('recognizes --all-flights and defaults actor to null', () => {
      const parsed = parseSandboxFlightPurgeArgs(['--all-flights']);
      expect(parsed.all).toBe(true);
      expect(parsed.flightNos).toEqual([]);
      expect(parsed.actorUsername).toBeNull();
    });

    it('returns empty/false/null for no recognized flags', () => {
      const parsed = parseSandboxFlightPurgeArgs(['--execute-purge']);
      expect(parsed).toEqual({
        flightNos: [],
        all: false,
        actorUsername: null,
      });
    });
  });

  describe('SANDBOX_FLIGHT_PURGE_TABLE_ORDER', () => {
    it('deletes bookings before agency_allotments and flight_instances', () => {
      const order = SANDBOX_FLIGHT_PURGE_TABLE_ORDER;
      const bookingsIdx = order.indexOf('bookings');
      const allotmentsIdx = order.indexOf('agency_allotments');
      const instancesIdx = order.indexOf('flight_instances');
      expect(bookingsIdx).toBeGreaterThanOrEqual(0);
      expect(bookingsIdx).toBeLessThan(allotmentsIdx);
      expect(allotmentsIdx).toBeLessThan(instancesIdx);
    });

    it('deletes approval history before flight_instances', () => {
      const order = SANDBOX_FLIGHT_PURGE_TABLE_ORDER;
      expect(order.indexOf('flight_reviews')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('flight_reviews')).toBeLessThan(
        order.indexOf('flight_instances'),
      );
    });

    it('deletes flight_instances before schedules before flights (RESTRICT chain)', () => {
      const order = SANDBOX_FLIGHT_PURGE_TABLE_ORDER;
      expect(order.indexOf('flight_instances')).toBeLessThan(
        order.indexOf('schedules'),
      );
      expect(order.indexOf('schedules')).toBeLessThan(order.indexOf('flights'));
    });

    it('deletes survey_responses before survey_invites (RESTRICT chain)', () => {
      const order = SANDBOX_FLIGHT_PURGE_TABLE_ORDER;
      expect(order.indexOf('survey_responses')).toBeLessThan(
        order.indexOf('survey_invites'),
      );
    });

    it('never touches routes, ledger_entries, wallet_entries, or club_points_entries', () => {
      expect(SANDBOX_FLIGHT_PURGE_TABLE_ORDER).not.toContain('routes');
      expect(SANDBOX_FLIGHT_PURGE_TABLE_ORDER).not.toContain('ledger_entries');
      expect(SANDBOX_FLIGHT_PURGE_TABLE_ORDER).not.toContain('wallet_entries');
      expect(SANDBOX_FLIGHT_PURGE_TABLE_ORDER).not.toContain(
        'club_points_entries',
      );
    });
  });
});
