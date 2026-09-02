import type { PublicAncillaryService } from '../../../types/ancillary-services';

export type SeatTypeKey = 'seat-normal' | 'seat-legroom' | 'seat-window-aisle';

function isMd80(aircraftType: string): boolean {
  return /MD-?8[08]/i.test(aircraftType.replace(/\s+/g, ''));
}

export function classifySeatType(seatCode: string, aircraftType: string): SeatTypeKey {
  const match = /^(\d+)([A-Z])$/i.exec(seatCode.trim());
  if (!match) return 'seat-normal';
  const row = Number(match[1]);
  const letter = match[2]!.toUpperCase();
  const md80 = isMd80(aircraftType);
  const extraLegroom = md80 ? row === 7 || row === 19 || row === 20 : row === 1;
  if (extraLegroom) return 'seat-legroom';
  const windowOrAisle = md80
    ? ['A', 'B', 'D', 'F'].includes(letter)
    : ['A', 'C', 'D', 'F'].includes(letter);
  return windowOrAisle ? 'seat-window-aisle' : 'seat-normal';
}

export function seatTypeTotalIrr(
  selectedSeats: string[],
  aircraftType: string,
  services: PublicAncillaryService[],
): bigint {
  const byKey = new Map(services.map((service) => [service.key, service]));
  return selectedSeats.reduce((total, seatCode) => {
    const service = byKey.get(classifySeatType(seatCode, aircraftType));
    return total + BigInt(service?.priceIrr ?? '0');
  }, 0n);
}
