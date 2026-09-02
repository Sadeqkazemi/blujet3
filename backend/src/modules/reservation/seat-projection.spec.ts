import { classifySeatProjection } from './seatmap.service';

describe('managerial seat-map projection', () => {
  it('keeps checkout holds separate from confirmed sales', () => {
    expect(classifySeatProjection('HELD', null)).toBe('HELD');
    expect(classifySeatProjection('PAID', null)).toBe('SOLD');
    expect(classifySeatProjection('TICKETED', null)).toBe('SOLD');
  });

  it('distinguishes company blocks from passenger or agency locks', () => {
    expect(classifySeatProjection(null, 'FREE')).toBe('BLOCKED');
    expect(classifySeatProjection(null, 'PAYABLE')).toBe('LOCKED');
    expect(classifySeatProjection(null, null)).toBe('FREE');
  });
});
