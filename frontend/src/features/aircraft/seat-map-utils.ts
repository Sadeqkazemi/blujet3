import type {
  AircraftCabinType,
  AircraftSeatMapBandDraft,
  UpsertAircraftDefinitionPayload,
} from '../../types/aircraft';

export function emptyBands(): AircraftSeatMapBandDraft[] {
  return [
    {
      cabinType: 'FIRST',
      enabled: false,
      rowStart: 1,
      rowEnd: 1,
      colsLeft: ['A'],
      colsRight: ['C', 'D'],
    },
    {
      cabinType: 'BUSINESS',
      enabled: true,
      rowStart: 1,
      rowEnd: 2,
      colsLeft: ['A'],
      colsRight: ['C', 'D'],
    },
    {
      cabinType: 'COMFORT',
      enabled: false,
      rowStart: 3,
      rowEnd: 4,
      colsLeft: ['A', 'B'],
      colsRight: ['C', 'D', 'E'],
    },
    {
      cabinType: 'ECONOMY',
      enabled: true,
      rowStart: 3,
      rowEnd: 33,
      colsLeft: ['A', 'B', 'C'],
      colsRight: ['D', 'E', 'F'],
    },
  ];
}

export function countBandSeats(band: AircraftSeatMapBandDraft): number {
  if (!band.enabled || band.rowEnd < band.rowStart) return 0;
  const cols = [...band.colsLeft, ...band.colsRight];
  if (cols.length === 0) return 0;
  return (band.rowEnd - band.rowStart + 1) * cols.length;
}

export function totalBandSeats(
  bands: AircraftSeatMapBandDraft[],
  excluded: string[],
): number {
  const excludedSet = new Set(excluded.map((c) => c.toUpperCase()));
  let total = 0;
  for (const band of bands) {
    if (!band.enabled) continue;
    const cols = [...band.colsLeft, ...band.colsRight];
    for (let row = band.rowStart; row <= band.rowEnd; row++) {
      for (const col of cols) {
        const label = `${row}${col}`.toUpperCase();
        if (!excludedSet.has(label)) total += 1;
      }
    }
  }
  return total;
}

function bandOrNull(band: AircraftSeatMapBandDraft | undefined) {
  if (!band?.enabled) {
    return {
      rowStart: null as number | null,
      rowEnd: null as number | null,
      colsLeft: null as string[] | null,
      colsRight: null as string[] | null,
    };
  }
  return {
    rowStart: band.rowStart,
    rowEnd: band.rowEnd,
    colsLeft: band.colsLeft,
    colsRight: band.colsRight,
  };
}

export function bandsToUpsertFields(
  bands: AircraftSeatMapBandDraft[],
  excludedSeatCodes: string[],
): Pick<
  UpsertAircraftDefinitionPayload,
  | 'businessRowStart'
  | 'businessRowEnd'
  | 'businessColsLeft'
  | 'businessColsRight'
  | 'comfortRowStart'
  | 'comfortRowEnd'
  | 'comfortColsLeft'
  | 'comfortColsRight'
  | 'firstRowStart'
  | 'firstRowEnd'
  | 'firstColsLeft'
  | 'firstColsRight'
  | 'economyRowStart'
  | 'economyRowEnd'
  | 'economyColsLeft'
  | 'economyColsRight'
  | 'excludedSeatCodes'
> {
  const byType = (t: AircraftCabinType) => bands.find((b) => b.cabinType === t);
  const first = bandOrNull(byType('FIRST'));
  const business = bandOrNull(byType('BUSINESS'));
  const comfort = bandOrNull(byType('COMFORT'));
  const economy = bandOrNull(byType('ECONOMY'));
  return {
    firstRowStart: first.rowStart,
    firstRowEnd: first.rowEnd,
    firstColsLeft: first.colsLeft,
    firstColsRight: first.colsRight,
    businessRowStart: business.rowStart,
    businessRowEnd: business.rowEnd,
    businessColsLeft: business.colsLeft,
    businessColsRight: business.colsRight,
    comfortRowStart: comfort.rowStart,
    comfortRowEnd: comfort.rowEnd,
    comfortColsLeft: comfort.colsLeft,
    comfortColsRight: comfort.colsRight,
    economyRowStart: economy.rowStart,
    economyRowEnd: economy.rowEnd,
    economyColsLeft: economy.colsLeft,
    economyColsRight: economy.colsRight,
    excludedSeatCodes,
  };
}

export function detailToBands(def: {
  seatMap?: {
    cabinLayout?: Partial<
      Record<
        AircraftCabinType,
        { colsLeft: string[]; colsRight: string[] } | null
      >
    >;
    seats?: { row: number; cabinType: AircraftCabinType }[];
  };
  cabins?: { cabinType: AircraftCabinType; capacity: number }[];
}): AircraftSeatMapBandDraft[] {
  const bands = emptyBands();
  const seats = def.seatMap?.seats ?? [];
  for (const band of bands) {
    const cabinSeats = seats.filter((s) => s.cabinType === band.cabinType);
    const layout = def.seatMap?.cabinLayout?.[band.cabinType];
    if (cabinSeats.length === 0 && !layout) {
      band.enabled = (def.cabins ?? []).some(
        (c) => c.cabinType === band.cabinType && c.capacity > 0,
      );
      continue;
    }
    band.enabled = true;
    if (layout) {
      band.colsLeft = [...layout.colsLeft];
      band.colsRight = [...layout.colsRight];
    }
    if (cabinSeats.length > 0) {
      const rows = cabinSeats.map((s) => s.row);
      band.rowStart = Math.min(...rows);
      band.rowEnd = Math.max(...rows);
    }
  }
  return bands;
}
