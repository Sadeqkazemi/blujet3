import { describe, expect, it } from 'vitest';
import { AGENCY_NAV_ITEMS, agencyNavKeyFromPath } from './agency-nav-config';

describe('agency notices navigation', () => {
  it('exposes the notices page through the shared desktop/mobile navigation config', () => {
    expect(AGENCY_NAV_ITEMS).toContainEqual(expect.objectContaining({
      key: 'notices',
      path: '/agency/notices',
      icon: 'notices',
    }));
    expect(agencyNavKeyFromPath('/agency/notices')).toBe('notices');
  });
});
