import { describe, expect, it } from 'vitest';
import { classifySeatType, seatTypeTotalIrr } from './seat-type-pricing';

describe('checkout seat-type pricing', () => {
  it('uses the commercial price matching each selected seat type', () => {
    const services = [
      { key: 'seat-normal', titleFa: 'عادی', descriptionFa: '', priceIrr: '0' },
      { key: 'seat-legroom', titleFa: 'فضای پای بیشتر', descriptionFa: '', priceIrr: '4000000' },
      { key: 'seat-window-aisle', titleFa: 'پنجره یا راهرو', descriptionFa: '', priceIrr: '2000000' },
    ];
    expect(classifySeatType('19A', 'MD-80')).toBe('seat-legroom');
    expect(seatTypeTotalIrr(['19A', '12A', '12E'], 'MD-80', services)).toBe(6_000_000n);
  });
});
