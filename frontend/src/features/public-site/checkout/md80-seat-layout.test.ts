import { describe, expect, it } from 'vitest';
import {
  buildMd80Seats,
  isMd80Aircraft,
  looksLikeLegacyA320SeatPayload,
  looksLikeMd80SeatPayload,
  mapLegacyTakenSeatsToMd80,
  md80ColsForRow,
  md80IsExitRow,
  md80LeftAmenity,
  md80SectionForRow,
  MD80_EXCLUDED,
  shouldUseMd80SeatMap,
} from './md80-seat-layout';

describe('md80-seat-layout', () => {
  it('detects MD-80 / MD-88 type strings', () => {
    expect(isMd80Aircraft('MD-80')).toBe(true);
    expect(isMd80Aircraft('MD-88')).toBe(true);
    expect(isMd80Aircraft('Airbus A320')).toBe(false);
  });

  it('uses 2-2 A/B|E/F in first class and 2-3 A/B|D/E/F in economy', () => {
    expect(md80ColsForRow(3)).toEqual({
      left: ['A', 'B'],
      right: ['E', 'F'],
      cabin: 'FIRST',
    });
    expect(md80ColsForRow(12)).toEqual({
      left: ['A', 'B'],
      right: ['D', 'E', 'F'],
      cabin: 'ECONOMY',
    });
  });

  it('labels cabin sections per PDF', () => {
    expect(md80SectionForRow(4)).toBe('FIRST');
    expect(md80SectionForRow(9)).toBe('BUSINESS');
    expect(md80SectionForRow(15)).toBe('ECONOMY');
    expect(md80IsExitRow(19)).toBe(true);
    expect(md80IsExitRow(21)).toBe(false);
  });

  it('marks rear exit/galley omissions', () => {
    expect(md80LeftAmenity(28)).toBe('exit');
    expect(md80LeftAmenity(29)).toBe('galley');
    expect(md80LeftAmenity(30)).toBe('empty');
    expect(MD80_EXCLUDED.has('28A')).toBe(true);
    expect(MD80_EXCLUDED.has('30B')).toBe(true);
    expect(MD80_EXCLUDED.has('31A')).toBe(false);
  });

  it('builds 140 selectable seats and marks taken codes', () => {
    const seats = buildMd80Seats(['7A', '3E']);
    expect(seats).toHaveLength(140);
    expect(seats.find((s) => s.seatCode === '7A')?.status).toBe('TAKEN');
    expect(seats.find((s) => s.seatCode === '7B')?.status).toBe('FREE');
    expect(seats.find((s) => s.seatCode === '28A')).toBeUndefined();
  });

  it('detects MD-80 vs legacy A320 lettering', () => {
    expect(looksLikeMd80SeatPayload([{ seatCode: '3F' }, { seatCode: '7D' }])).toBe(true);
    expect(looksLikeMd80SeatPayload([{ seatCode: '3C' }, { seatCode: '7E' }])).toBe(false);
    expect(looksLikeLegacyA320SeatPayload([{ seatCode: '3C' }, { seatCode: '7E' }])).toBe(true);
    const legacyA320 = buildMd80Seats().map((s) => {
      const m = /^(\d+)([A-F])$/.exec(s.seatCode)!;
      const row = Number(m[1]);
      const col = m[2]!;
      if (row <= 6) {
        if (col === 'E') return { seatCode: `${row}C` };
        if (col === 'F') return { seatCode: `${row}D` };
      } else if (col === 'D') return { seatCode: `${row}C` };
      else if (col === 'E') return { seatCode: `${row}D` };
      else if (col === 'F') return { seatCode: `${row}E` };
      return { seatCode: s.seatCode };
    });
    // A320 chart has two extra business seats per row (C/D vs E/F) → 146 total
    legacyA320.push({ seatCode: '3C' }, { seatCode: '4C' }, { seatCode: '5C' }, { seatCode: '6C' });
    expect(looksLikeLegacyA320SeatPayload(legacyA320)).toBe(true);
    expect(shouldUseMd80SeatMap('Airbus A320', legacyA320)).toBe(false);
    expect(shouldUseMd80SeatMap('MD-80', legacyA320)).toBe(true);
    expect(shouldUseMd80SeatMap('Airbus A320', [{ seatCode: '3C' }, { seatCode: '7D' }])).toBe(true);
  });

  it('maps legacy A320 taken seats onto MD-80 chart', () => {
    expect(mapLegacyTakenSeatsToMd80(['3C', '7C', '7E'])).toEqual(['3E', '7D', '7F']);
  });
});
