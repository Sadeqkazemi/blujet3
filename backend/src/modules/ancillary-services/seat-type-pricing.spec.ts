import { classifySeatType } from './seat-type-pricing';

describe('seat type pricing classification', () => {
  it('prioritizes extra-legroom rows and classifies MD-80 window/aisle positions', () => {
    expect(classifySeatType('19A', 'MD-80')).toBe('seat-legroom');
    expect(classifySeatType('12A', 'MD-80')).toBe('seat-window-aisle');
    expect(classifySeatType('12D', 'MD-80')).toBe('seat-window-aisle');
    expect(classifySeatType('12E', 'MD-80')).toBe('seat-normal');
  });
});
