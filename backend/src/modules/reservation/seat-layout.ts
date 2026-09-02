export interface SeatCell {
  seatCode: string;
  row: number;
  cabin: 'BUSINESS' | 'COMFORT' | 'ECONOMY' | 'FIRST';
}

/** Structural shape shared by seat-map rows — ORM-agnostic. */
export interface AircraftSeatMapLike {
  businessRowStart: number;
  businessRowEnd: number;
  businessColsLeft: string[] | null;
  businessColsRight: string[] | null;
  comfortRowStart?: number | null;
  comfortRowEnd?: number | null;
  comfortColsLeft?: string[] | null;
  comfortColsRight?: string[] | null;
  firstRowStart?: number | null;
  firstRowEnd?: number | null;
  firstColsLeft?: string[] | null;
  firstColsRight?: string[] | null;
  economyRowStart: number;
  economyRowEnd: number;
  economyColsLeft: string[] | null;
  economyColsRight: string[] | null;
  excludedSeatCodes?: string[] | null;
  exitRows?: number[] | null;
}

function pushCabinRows(
  seats: SeatCell[],
  excluded: Set<string>,
  rowStart: number | null | undefined,
  rowEnd: number | null | undefined,
  colsLeft: string[] | null | undefined,
  colsRight: string[] | null | undefined,
  cabin: SeatCell['cabin'],
) {
  if (
    rowStart == null ||
    rowEnd == null ||
    !Number.isFinite(rowStart) ||
    !Number.isFinite(rowEnd) ||
    rowEnd < rowStart
  ) {
    return;
  }
  const cols = [...(colsLeft ?? []), ...(colsRight ?? [])];
  if (cols.length === 0) return;
  for (let row = rowStart; row <= rowEnd; row++) {
    for (const col of cols) {
      const seatCode = `${row}${col}`;
      if (excluded.has(seatCode)) continue;
      seats.push({ seatCode, row, cabin });
    }
  }
}

/** Enumerates every seat code from a data-driven AircraftSeatMap config. */
export function enumerateSeats(map: AircraftSeatMapLike): SeatCell[] {
  const excluded = new Set(map.excludedSeatCodes ?? []);
  const seats: SeatCell[] = [];
  pushCabinRows(
    seats,
    excluded,
    map.firstRowStart,
    map.firstRowEnd,
    map.firstColsLeft,
    map.firstColsRight,
    'FIRST',
  );
  pushCabinRows(
    seats,
    excluded,
    map.businessRowStart,
    map.businessRowEnd,
    map.businessColsLeft,
    map.businessColsRight,
    'BUSINESS',
  );
  pushCabinRows(
    seats,
    excluded,
    map.comfortRowStart,
    map.comfortRowEnd,
    map.comfortColsLeft,
    map.comfortColsRight,
    'COMFORT',
  );
  pushCabinRows(
    seats,
    excluded,
    map.economyRowStart,
    map.economyRowEnd,
    map.economyColsLeft,
    map.economyColsRight,
    'ECONOMY',
  );
  return seats;
}

export function countSeatsByCabin(
  map: AircraftSeatMapLike,
): Record<'BUSINESS' | 'COMFORT' | 'ECONOMY' | 'FIRST', number> {
  const out = { BUSINESS: 0, COMFORT: 0, ECONOMY: 0, FIRST: 0 };
  for (const seat of enumerateSeats(map)) {
    out[seat.cabin] += 1;
  }
  return out;
}

export function isKnownSeat(
  map: AircraftSeatMapLike,
  seatCode: string,
): boolean {
  return enumerateSeats(map).some((s) => s.seatCode === seatCode);
}

function cabinSides(
  map: AircraftSeatMapLike,
  cabin: SeatCell['cabin'],
): string[][] {
  if (cabin === 'FIRST')
    return [map.firstColsLeft ?? [], map.firstColsRight ?? []];
  if (cabin === 'BUSINESS')
    return [map.businessColsLeft ?? [], map.businessColsRight ?? []];
  if (cabin === 'COMFORT')
    return [map.comfortColsLeft ?? [], map.comfortColsRight ?? []];
  return [map.economyColsLeft ?? [], map.economyColsRight ?? []];
}

/** Finds a free adjacent seat in the same row/cabin and aisle side. */
export function findAdjacentSeatCode(
  map: AircraftSeatMapLike,
  primarySeatCode: string,
  unavailable: ReadonlySet<string>,
): string | null {
  const primary = enumerateSeats(map).find(
    (seat) => seat.seatCode === primarySeatCode,
  );
  if (!primary) return null;
  const column = primarySeatCode.slice(String(primary.row).length);
  for (const side of cabinSides(map, primary.cabin)) {
    const index = side.indexOf(column);
    if (index < 0) continue;
    for (const adjacentIndex of [index - 1, index + 1]) {
      const adjacentColumn = side[adjacentIndex];
      if (!adjacentColumn) continue;
      const code = `${primary.row}${adjacentColumn}`;
      if (!unavailable.has(code) && isKnownSeat(map, code)) return code;
    }
  }
  return null;
}

/** Finds any two free adjacent seats in one cabin, without crossing an aisle. */
export function findAdjacentSeatPair(
  map: AircraftSeatMapLike,
  cabin: SeatCell['cabin'],
  unavailable: ReadonlySet<string>,
): [string, string] | null {
  for (const seat of enumerateSeats(map)) {
    if (seat.cabin !== cabin || unavailable.has(seat.seatCode)) continue;
    const adjacent = findAdjacentSeatCode(map, seat.seatCode, unavailable);
    if (adjacent) return [seat.seatCode, adjacent];
  }
  return null;
}
