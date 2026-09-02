import { resolveTierForPoints } from './club.service';

const RULE = { goldMinPoints: 5000, platinumMinPoints: 15000 };

describe('resolveTierForPoints (unit)', () => {
  it.each([
    [0, 'SILVER'],
    [4999, 'SILVER'],
    [5000, 'GOLD'], // boundary: exactly at the gold threshold
    [12450, 'GOLD'],
    [14999, 'GOLD'],
    [15000, 'PLATINUM'], // boundary: exactly at the platinum threshold
    [18800, 'PLATINUM'],
  ])('%i points → %s', (points, expected) => {
    expect(resolveTierForPoints(points, RULE)).toBe(expected);
  });

  it('a redemption that drops points back below a threshold demotes the tier', () => {
    expect(resolveTierForPoints(16000, RULE)).toBe('PLATINUM');
    expect(resolveTierForPoints(16000 - 2000, RULE)).toBe('GOLD');
  });
});
