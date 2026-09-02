import { describe, expect, it } from 'vitest';
import { commercialNavWithServices } from './commercial-nav';

describe('commercialNavWithServices', () => {
  it('uses one canonical services tab, retains aircraft, and follows the approved handoff order', () => {
    const result = commercialNavWithServices([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
      { key: 'flights', labelFa: 'مدیریت پروازها', implemented: true },
      { key: 'routes', labelFa: 'مسیرهای پروازی', implemented: true },
      { key: 'aircraft', labelFa: 'تعریف هواپیما', implemented: true },
      { key: 'services', labelFa: 'خدمات قدیمی', implemented: true },
      { key: 'ancillary-services', labelFa: 'خدمات', implemented: true },
      { key: 'reports', labelFa: 'گزارش مسافران', implemented: true },
    ]);

    expect(result.map((item) => item.key)).toEqual([
      'dashboard',
      'agencies',
      'routes',
      'aircraft',
      'flights',
      'ancillary-services',
      'reports',
    ]);
    expect(result.filter((item) => item.labelFa === 'خدمات')).toHaveLength(1);
    expect(result.some((item) => item.key === 'aircraft')).toBe(true);
  });

  it('does not duplicate a services item returned by a future backend nav response', () => {
    const result = commercialNavWithServices([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'services', labelFa: 'خدمات سفر', implemented: true },
    ]);

    expect(result.filter((item) => item.key === 'services')).toHaveLength(1);
    expect(result.find((item) => item.key === 'services')?.labelFa).toBe('خدمات سفر');
  });
});
