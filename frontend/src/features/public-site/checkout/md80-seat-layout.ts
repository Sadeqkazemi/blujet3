/**
 * MD-80 cabin chart — source: design-reference-v2/MD-80-seatmap.pdf
 * (user-provided MD _ 80.pdf, Aug 2026)
 *
 * First Class (rows 3–6):     A B | aisle | E F          (2-2, 16 seats)
 * Business / Main Cabin Extra (7–11): A B | aisle | D E F (2-3)
 * Economy (rows 12–32):       A B | aisle | D E F        (2-3)
 * Over-wing exit rows: 19–20
 * Rear exit/galley omits 28A/B, 29A/B, 30A/B on the left; D/E/F continue.
 * Total selectable seats: 140
 */

export const MD80_AIRCRAFT_TYPES = new Set(['MD-80', 'MD-88', 'MD80', 'MD88']);

export const MD80_BUSINESS_LEFT = ['A', 'B'] as const;
export const MD80_BUSINESS_RIGHT = ['E', 'F'] as const;
export const MD80_ECONOMY_LEFT = ['A', 'B'] as const;
export const MD80_ECONOMY_RIGHT = ['D', 'E', 'F'] as const;

export const MD80_BUSINESS_ROWS = [3, 4, 5, 6] as const;
export const MD80_MAIN_CABIN_EXTRA_ROW_START = 7;
export const MD80_MAIN_CABIN_EXTRA_ROW_END = 11;
export const MD80_ECONOMY_ROW_START = 12;
export const MD80_ECONOMY_ROW_END = 32;
export const MD80_EXIT_ROWS = [19, 20] as const;
export const MD80_WING_ROW_START = 17;
export const MD80_WING_ROW_END = 22;

export const MD80_EXCLUDED = new Set([
  '28A',
  '28B',
  '29A',
  '29B',
  '30A',
  '30B',
]);

export const MD80_TOTAL_SEATS = 140;

export type Md80Amenity = 'exit' | 'galley' | 'empty' | null;
export type Md80CabinSection = 'FIRST' | 'BUSINESS' | 'ECONOMY';

/** Left-side amenity when A/B seats are missing (rear of MD-80). */
export function md80LeftAmenity(row: number): Md80Amenity {
  if (row === 28) return 'exit';
  if (row === 29) return 'galley';
  if (row === 30) return 'empty';
  return null;
}

export function md80SectionForRow(row: number): Md80CabinSection {
  if (row >= 3 && row <= 6) return 'FIRST';
  if (row >= 7 && row <= 11) return 'BUSINESS';
  return 'ECONOMY';
}

export function md80IsExitRow(row: number): boolean {
  return row === 19 || row === 20;
}

export function isMd80Aircraft(aircraftType: string | undefined): boolean {
  if (!aircraftType) return false;
  const normalized = aircraftType.replace(/\s+/g, '').toUpperCase();
  return (
    MD80_AIRCRAFT_TYPES.has(aircraftType) ||
    MD80_AIRCRAFT_TYPES.has(normalized) ||
    normalized.includes('MD-80') ||
    normalized.includes('MD80') ||
    normalized.includes('MD-88') ||
    normalized.includes('MD88')
  );
}

export function md80Rows(): number[] {
  const rows: number[] = [];
  for (let r = 3; r <= 32; r++) rows.push(r);
  return rows;
}

export function md80ColsForRow(row: number): {
  left: readonly string[];
  right: readonly string[];
  cabin: Md80CabinSection;
} {
  if (row >= 3 && row <= 6) {
    return {
      left: MD80_BUSINESS_LEFT,
      right: MD80_BUSINESS_RIGHT,
      cabin: 'FIRST',
    };
  }
  if (row >= MD80_MAIN_CABIN_EXTRA_ROW_START && row <= MD80_MAIN_CABIN_EXTRA_ROW_END) {
    return {
      left: MD80_ECONOMY_LEFT,
      right: MD80_ECONOMY_RIGHT,
      cabin: 'BUSINESS',
    };
  }
  return {
    left: MD80_ECONOMY_LEFT,
    right: MD80_ECONOMY_RIGHT,
    cabin: 'ECONOMY',
  };
}

/** Full MD-80 inventory (140 seats) — used when API seatmap is empty/mismatched. */
export function buildMd80Seats(
  takenCodes: Iterable<string> = [],
): Array<{
  seatCode: string;
  row: number;
  cabin: Md80CabinSection;
  status: 'FREE' | 'TAKEN';
}> {
  const taken = new Set(takenCodes);
  const out: Array<{
    seatCode: string;
    row: number;
    cabin: Md80CabinSection;
    status: 'FREE' | 'TAKEN';
  }> = [];
  for (const row of md80Rows()) {
    const { left, right, cabin } = md80ColsForRow(row);
    for (const letter of [...left, ...right]) {
      const seatCode = `${row}${letter}`;
      if (MD80_EXCLUDED.has(seatCode)) continue;
      out.push({
        seatCode,
        row,
        cabin,
        status: taken.has(seatCode) ? 'TAKEN' : 'FREE',
      });
    }
  }
  return out;
}

/** True when the API payload already uses MD-80 lettering (F present, C absent). */
export function looksLikeMd80SeatPayload(
  seats: Array<{ seatCode: string }>,
): boolean {
  if (seats.length === 0) return false;
  const hasF = seats.some((s) => /F$/.test(s.seatCode));
  const hasC = seats.some((s) => /C$/.test(s.seatCode));
  return hasF && !hasC;
}

/** True when the API still uses legacy A320 lettering (column C, no F). */
export function looksLikeLegacyA320SeatPayload(
  seats: Array<{ seatCode: string }>,
): boolean {
  if (seats.length === 0) return false;
  const hasC = seats.some((s) => /C$/.test(s.seatCode));
  const hasF = seats.some((s) => /F$/.test(s.seatCode));
  return hasC && !hasF;
}

/** Decide whether checkout should paint the MD-80 PDF chart. */
export function shouldUseMd80SeatMap(
  aircraftType: string | undefined,
  seats: Array<{ seatCode: string }>,
): boolean {
  const explicitPartnerA320 =
    aircraftType?.includes('Airbus A320') &&
    looksLikeLegacyA320SeatPayload(seats) &&
    seats.length >= 140;
  if (explicitPartnerA320) return false;

  if (isMd80Aircraft(aircraftType)) return true;
  if (looksLikeMd80SeatPayload(seats)) return true;
  if (seats.length === 0) return true;
  if (looksLikeLegacyA320SeatPayload(seats)) return true;
  return false;
}

/** Map legacy A320 seat codes onto MD-80 chart for taken-seat overlay. */
export function mapLegacyTakenSeatsToMd80(takenCodes: Iterable<string>): string[] {
  const mapped: string[] = [];
  for (const code of takenCodes) {
    const m = /^(\d+)([A-F])$/.exec(code);
    if (!m) continue;
    const row = Number(m[1]);
    const col = m[2]!;
    if (row >= 3 && row <= 6) {
      // A320 business right: C,D → MD-80 E,F
      if (col === 'C') mapped.push(`${row}E`);
      else if (col === 'D') mapped.push(`${row}F`);
      else mapped.push(code);
    } else if (row >= 7) {
      // A320 economy right: C,D,E → MD-80 D,E,F
      if (col === 'C') mapped.push(`${row}D`);
      else if (col === 'D') mapped.push(`${row}E`);
      else if (col === 'E') mapped.push(`${row}F`);
      else mapped.push(code);
    } else {
      mapped.push(code);
    }
  }
  return mapped;
}
