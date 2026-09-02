/** Contract: docs/api-contract-pr126.md — aircraft definitions */

export type AircraftStatus = 'ACTIVE' | 'INACTIVE';

/** Backend CabinType — no PREMIUM_ECONOMY. */
export type AircraftCabinType = 'FIRST' | 'BUSINESS' | 'COMFORT' | 'ECONOMY';

export type AircraftSeatSide = 'LEFT' | 'RIGHT';

export interface AircraftCabinCapacity {
  cabinType: AircraftCabinType;
  capacity: number;
  defaultClassCode?: string;
}

export interface AircraftSeat {
  row: number;
  column: string;
  label: string;
  cabinType: AircraftCabinType;
  side: AircraftSeatSide;
  isBlocked: boolean;
}

export interface AircraftCabinLayoutBand {
  colsLeft: string[];
  colsRight: string[];
  aisleAfterIndex: number;
}

export interface AircraftSeatMap {
  aircraftDefinitionId: string;
  cabinLayout: Partial<Record<AircraftCabinType, AircraftCabinLayoutBand | null>>;
  excludedSeatCodes: string[];
  exitRows?: number[];
  seats: AircraftSeat[];
}

export interface AircraftDefinitionListItem {
  id: string;
  code: string;
  model: string;
  title: string;
  status: AircraftStatus;
  totalCapacity: number;
  version: number;
  cabins: AircraftCabinCapacity[];
}

export interface AircraftDefinition extends AircraftDefinitionListItem {
  seats: AircraftSeat[];
  seatMap: AircraftSeatMap;
}

/** POST/PUT/PATCH body — flat seat-map bands (contract UpsertAircraftDto). */
export interface UpsertAircraftDefinitionPayload {
  code: string;
  model: string;
  title: string;
  totalCapacity: number;
  cabinCapacities?: AircraftCabinCapacity[];
  businessRowStart?: number | null;
  businessRowEnd?: number | null;
  businessColsLeft?: string[] | null;
  businessColsRight?: string[] | null;
  comfortRowStart?: number | null;
  comfortRowEnd?: number | null;
  comfortColsLeft?: string[] | null;
  comfortColsRight?: string[] | null;
  firstRowStart?: number | null;
  firstRowEnd?: number | null;
  firstColsLeft?: string[] | null;
  firstColsRight?: string[] | null;
  economyRowStart?: number | null;
  economyRowEnd?: number | null;
  economyColsLeft?: string[] | null;
  economyColsRight?: string[] | null;
  excludedSeatCodes?: string[];
  exitRows?: number[];
}

/** UI draft band used by the seat-map editor before mapping to Upsert DTO. */
export interface AircraftSeatMapBandDraft {
  cabinType: AircraftCabinType;
  enabled: boolean;
  rowStart: number;
  rowEnd: number;
  colsLeft: string[];
  colsRight: string[];
}

export const AIRCRAFT_CABIN_OPTIONS: {
  value: AircraftCabinType;
  label: string;
}[] = [
  { value: 'FIRST', label: 'فرست' },
  { value: 'BUSINESS', label: 'بیزنس' },
  { value: 'COMFORT', label: 'کامفورت' },
  { value: 'ECONOMY', label: 'اکونومی' },
];

export const STANDARD_AIRCRAFT_CLASS_CODE: Record<AircraftCabinType, string> = {
  FIRST: 'F',
  BUSINESS: 'C',
  COMFORT: 'W',
  ECONOMY: 'Y',
};

/** Map the physical aircraft cabin to the same cabin used by fares and inventory. */
export function toFlightCabinKind(
  cabin: AircraftCabinType,
): AircraftCabinType {
  return cabin;
}
