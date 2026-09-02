import {
  assertValidFlightNo,
  arrivalFromDuration,
  normalizeCabinCapacities,
  normalizeFlightNo,
} from './flight-definition.util';
import { BadRequestException } from '@nestjs/common';

describe('flight-definition.util', () => {
  it('accepts XY1234 and uppercases letters without trimming or stripping', () => {
    expect(normalizeFlightNo('xy1234')).toBe('XY1234');
    // Leading/trailing spaces are preserved so validation can reject them.
    expect(normalizeFlightNo(' XY1234 ')).toBe(' XY1234 ');
    expect(normalizeFlightNo('XY-1234')).toBe('XY-1234');
    expect(normalizeFlightNo('XY 1234')).toBe('XY 1234');
    expect(() => assertValidFlightNo('XY1234')).not.toThrow();
    expect(() => assertValidFlightNo(' XY1234 ')).toThrow(BadRequestException);
    expect(() => assertValidFlightNo('XY-1234')).toThrow(BadRequestException);
    expect(() => assertValidFlightNo('XY 1234')).toThrow(BadRequestException);
    expect(() => assertValidFlightNo('X1234')).toThrow(BadRequestException);
  });

  it('derives arrivalAt from durationMinutes', () => {
    const dep = new Date('2026-09-01T10:00:00.000Z');
    const arr = arrivalFromDuration(dep, 90);
    expect(arr.toISOString()).toBe('2026-09-01T11:30:00.000Z');
    expect(() => arrivalFromDuration(dep, 0)).toThrow(BadRequestException);
  });

  it('rejects duplicate cabins and capacity sum mismatch', () => {
    expect(() =>
      normalizeCabinCapacities(
        [
          { cabin: 'ECONOMY', seats: 100 },
          { cabin: 'ECONOMY', seats: 20 },
        ],
        120,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      normalizeCabinCapacities(
        [
          { cabin: 'ECONOMY', seats: 100 },
          { cabin: 'COMFORT', seats: 20 },
          { cabin: 'BUSINESS', seats: 20 },
        ],
        180,
      ),
    ).toThrow(BadRequestException);

    const ok = normalizeCabinCapacities(
      [
        { cabin: 'ECONOMY', capacity: 140 },
        { cabin: 'COMFORT', seats: 20 },
        { cabin: 'BUSINESS', seats: 20 },
      ],
      180,
    );
    expect(ok).toHaveLength(3);
    expect(ok.find((c) => c.cabin === 'COMFORT')?.seats).toBe(20);
  });
});
