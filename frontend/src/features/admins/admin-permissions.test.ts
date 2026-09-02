import { describe, expect, it } from 'vitest';
import {
  deriveUsernameFromEmail,
  enabledPermissionKeys,
  permissionStateFromKeys,
  rolePermissionPreset,
} from './admin-permissions';

describe('admin-permissions', () => {
  it('derives username from email local part', () => {
    expect(deriveUsernameFromEmail('z.karimi@blujet.example')).toBe('z.karimi');
    expect(deriveUsernameFromEmail('ab@x.co')).toMatch(/^admin\./);
  });

  it('round-trips an explicit permission selection', () => {
    const state = permissionStateFromKeys(
      ['reports', 'finance'],
      'FINANCE_MANAGER',
    );
    expect(enabledPermissionKeys(state)).toEqual(['reports', 'finance']);
    expect(state.cartable).toBe(false);
  });

  it('presets IT manager permissions per design', () => {
    const perms = rolePermissionPreset('IT_MANAGER');
    expect(perms.dashboard).toBe(true);
    expect(perms.admins).toBe(true);
    expect(perms.cartable).toBe(false);
    expect(perms.flights).toBe(false);
  });

  it('presets finance manager permissions per design', () => {
    const perms = rolePermissionPreset('FINANCE_MANAGER');
    expect(perms.finance).toBe(true);
    expect(perms.reports).toBe(true);
    expect(perms.flights).toBe(false);
  });
});
