import type { CabinClass } from '../../database/enums';
import {
  enumerateSeats,
  type AircraftSeatMapLike,
  type SeatCell,
} from '../reservation/seat-layout';

type Gender = 'male' | 'female';
type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface SeatPolicyPassenger {
  passengerType: PassengerType;
  gender?: Gender;
  seatCode?: string;
}

export interface OccupiedSeatContext {
  seatCode: string;
  gender?: Gender | null;
  hasLapInfant: boolean;
}

export class SeatAssignmentPolicyError extends Error {}

function sidesForCabin(
  map: AircraftSeatMapLike,
  cabin: CabinClass,
): string[][] {
  if (cabin === 'FIRST')
    return [map.firstColsLeft ?? [], map.firstColsRight ?? []];
  if (cabin === 'BUSINESS')
    return [map.businessColsLeft ?? [], map.businessColsRight ?? []];
  if (cabin === 'COMFORT')
    return [map.comfortColsLeft ?? [], map.comfortColsRight ?? []];
  return [map.economyColsLeft ?? [], map.economyColsRight ?? []];
}

function seatColumn(seat: SeatCell): string {
  return seat.seatCode.slice(String(seat.row).length);
}

function blockKey(
  map: AircraftSeatMapLike,
  cabin: CabinClass,
  seat: SeatCell,
): string {
  const column = seatColumn(seat);
  const sideIndex = sidesForCabin(map, cabin).findIndex((side) =>
    side.includes(column),
  );
  return `${seat.row}:${Math.max(0, sideIndex)}`;
}

function adjacentCodes(
  map: AircraftSeatMapLike,
  cabin: CabinClass,
  seat: SeatCell,
): string[] {
  const column = seatColumn(seat);
  const side = sidesForCabin(map, cabin).find((candidate) =>
    candidate.includes(column),
  );
  if (!side) return [];
  const index = side.indexOf(column);
  return [index - 1, index + 1]
    .map((candidate) => side[candidate])
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => `${seat.row}${candidate}`);
}

function contiguousFreeBlocks(
  row: number,
  side: string[],
  byCode: ReadonlyMap<string, SeatCell>,
  unavailable: ReadonlySet<string>,
): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const column of side) {
    const code = `${row}${column}`;
    if (byCode.has(code) && !unavailable.has(code)) {
      current.push(code);
      continue;
    }
    if (current.length > 0) blocks.push(current);
    current = [];
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Deterministic seat assignment over one DB-backed aircraft layout.
 * Manual choices remain fixed; every other choice is derived from the same
 * free-seat set that the locked booking transaction re-checks.
 */
export function assignPassengerSeats({
  map,
  cabin,
  passengers,
  occupied,
}: {
  map: AircraftSeatMapLike;
  cabin: CabinClass;
  passengers: SeatPolicyPassenger[];
  occupied: OccupiedSeatContext[];
}): Array<string | null> {
  const seats = enumerateSeats(map)
    .filter((seat) => seat.cabin === cabin)
    .sort((a, b) => a.row - b.row || a.seatCode.localeCompare(b.seatCode));
  const byCode = new Map(seats.map((seat) => [seat.seatCode, seat]));
  const unavailable = new Set(occupied.map((row) => row.seatCode));
  const result: Array<string | null> = passengers.map(() => null);
  const infantCount = passengers.filter(
    (p) => p.passengerType === 'INFANT',
  ).length;
  const adultIndexes = passengers.flatMap((passenger, index) =>
    passenger.passengerType === 'ADULT' ? [index] : [],
  );
  const infantCarrierIndexes = new Set(adultIndexes.slice(0, infantCount));
  const infantBlocks = new Set<string>();

  for (const row of occupied) {
    const seat = byCode.get(row.seatCode);
    if (seat && row.hasLapInfant) infantBlocks.add(blockKey(map, cabin, seat));
  }

  function eligible(passengerIndex: number, seat: SeatCell): boolean {
    const passenger = passengers[passengerIndex];
    if (passenger.passengerType === 'INFANT') return false;
    if ((map.exitRows ?? []).includes(seat.row)) {
      return (
        passenger.passengerType === 'ADULT' &&
        !infantCarrierIndexes.has(passengerIndex)
      );
    }
    if (
      infantCarrierIndexes.has(passengerIndex) &&
      infantBlocks.has(blockKey(map, cabin, seat))
    ) {
      return false;
    }
    return true;
  }

  function take(passengerIndex: number, code: string): boolean {
    const seat = byCode.get(code);
    if (!seat || unavailable.has(code) || !eligible(passengerIndex, seat))
      return false;
    result[passengerIndex] = code;
    unavailable.add(code);
    if (infantCarrierIndexes.has(passengerIndex)) {
      infantBlocks.add(blockKey(map, cabin, seat));
    }
    return true;
  }

  passengers.forEach((passenger, index) => {
    if (!passenger.seatCode) return;
    if (!take(index, passenger.seatCode)) {
      throw new SeatAssignmentPolicyError(
        `Seat ${passenger.seatCode} violates the passenger seating policy.`,
      );
    }
  });

  const seatBearingIndexes = passengers.flatMap((passenger, index) =>
    passenger.passengerType === 'INFANT' ? [] : [index],
  );

  // For a multi-passenger order with no manual anchor, start with the first
  // contiguous row-side block large enough for the group (or its leading
  // members). This is the strongest deterministic "family together" rule.
  if (seatBearingIndexes.length > 1 && result.every((code) => code == null)) {
    const needed = seatBearingIndexes.length;
    const blocks = [...new Set(seats.map((seat) => seat.row))].flatMap((row) =>
      sidesForCabin(map, cabin).flatMap((side) =>
        contiguousFreeBlocks(row, side, byCode, unavailable),
      ),
    );
    const completeBlock = blocks.find((codes) => codes.length >= needed);
    const chosenBlock =
      completeBlock ?? [...blocks].sort((a, b) => b.length - a.length)[0];
    if (chosenBlock) {
      for (const passengerIndex of seatBearingIndexes.slice(
        0,
        chosenBlock.length,
      )) {
        const candidate = chosenBlock.find((code) => {
          const seat = byCode.get(code)!;
          return !unavailable.has(code) && eligible(passengerIndex, seat);
        });
        if (candidate) take(passengerIndex, candidate);
      }
    }
  }

  for (const passengerIndex of seatBearingIndexes) {
    if (result[passengerIndex]) continue;
    const passenger = passengers[passengerIndex];

    // Children are always attached to an adult in this order when an adjacent
    // free seat exists.
    const preferredAnchors = passengers.flatMap((candidate, index) => {
      const code = result[index];
      if (!code) return [];
      if (
        passenger.passengerType === 'CHILD' &&
        candidate.passengerType !== 'ADULT'
      )
        return [];
      return [code];
    });
    let assigned = false;
    for (const anchorCode of preferredAnchors) {
      const anchor = byCode.get(anchorCode);
      if (!anchor) continue;
      for (const code of adjacentCodes(map, cabin, anchor)) {
        if (take(passengerIndex, code)) {
          assigned = true;
          break;
        }
      }
      if (assigned) break;
    }
    if (assigned) continue;

    // A genuinely solo traveller first seeks a free neighbour of the same
    // gender among already booked passengers.
    if (seatBearingIndexes.length === 1 && passenger.gender) {
      for (const neighbour of occupied.filter(
        (row) => row.gender === passenger.gender,
      )) {
        const anchor = byCode.get(neighbour.seatCode);
        if (!anchor) continue;
        for (const code of adjacentCodes(map, cabin, anchor)) {
          if (take(passengerIndex, code)) {
            assigned = true;
            break;
          }
        }
        if (assigned) break;
      }
    }
    if (assigned) continue;

    // Fallback requested by product: in a 3-seat side choose aisle first,
    // then window. Other layouts retain their canonical row/column order.
    const fallback: string[] = [];
    for (const row of [...new Set(seats.map((seat) => seat.row))]) {
      for (const [sideIndex, side] of sidesForCabin(map, cabin).entries()) {
        if (side.length === 3) {
          const aisleColumn = sideIndex === 0 ? side[side.length - 1] : side[0];
          const windowColumn =
            sideIndex === 0 ? side[0] : side[side.length - 1];
          fallback.push(`${row}${aisleColumn}`, `${row}${windowColumn}`);
        }
      }
    }
    fallback.push(...seats.map((seat) => seat.seatCode));
    for (const code of fallback) {
      if (take(passengerIndex, code)) {
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      throw new SeatAssignmentPolicyError(
        'No policy-compliant seat is available.',
      );
    }
  }

  return result;
}
