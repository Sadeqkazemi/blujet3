import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Passenger } from '../../database/entities/passenger.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import {
  decryptPii,
  hashPii,
  normalizeNationalId,
} from '../../common/pii-crypto';
import { resolveAircraftType } from '../flights/aircraft-type.util';

/** «123******7»-style mask — this surface never returns a full national ID. */
function maskNationalId(nid: string): string {
  if (nid.length < 4) return '*'.repeat(nid.length);
  return `${nid.slice(0, 3)}${'*'.repeat(nid.length - 4)}${nid.slice(-1)}`;
}

function cabinFor(map: AircraftSeatMap | null, seatCode: string | null) {
  if (!map || !seatCode) return null;
  const row = parseInt(seatCode, 10);
  if (Number.isNaN(row)) return null;
  if (row >= map.businessRowStart && row <= map.businessRowEnd)
    return 'BUSINESS';
  if (row >= map.economyRowStart && row <= map.economyRowEnd) return 'ECONOMY';
  return null;
}

@Injectable()
export class PassengerReportsService {
  constructor(
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
  ) {}

  async search(q: string) {
    // A 10-digit input (Persian or Latin digits) is treated as an exact
    // national-ID lookup via the deterministic hash — same pattern as the
    // club/reservation searches; anything else is a name substring match.
    const normalized = normalizeNationalId(q);
    const isNationalId = /^\d{10}$/.test(normalized);

    const qb = this.passengerRepo
      .createQueryBuilder('p')
      .leftJoin('p.booking', 'booking')
      .leftJoin('booking.flightInstance', 'fi')
      .leftJoin('fi.flight', 'flight')
      .leftJoin('flight.route', 'route')
      .select(['p.id', 'p.fullName', 'p.nationalIdEnc', 'p.seatCode'])
      .addSelect([
        'booking.id',
        'booking.pnr',
        'booking.status',
        'booking.priceIrr',
      ])
      .addSelect(['fi.id', 'fi.departureAt', 'fi.aircraftTypeOverride'])
      .addSelect(['flight.id', 'flight.aircraftType', 'flight.flightNo'])
      .addSelect(['route.id', 'route.originCode', 'route.destCode'])
      .take(20);

    if (isNationalId) {
      qb.where('p.nationalIdHash = :hash', { hash: hashPii(normalized) });
    } else {
      qb.where('p.fullName LIKE :name', { name: `%${q.trim()}%` });
    }

    const passengers = await qb.getMany();

    const aircraftTypes = [
      ...new Set(
        passengers.map((p) => resolveAircraftType(p.booking.flightInstance)),
      ),
    ];
    const seatMaps = aircraftTypes.length
      ? await this.seatMapRepo.find({
          where: { aircraftType: In(aircraftTypes) },
        })
      : [];
    const mapByType = new Map(seatMaps.map((m) => [m.aircraftType, m]));

    return passengers.map((p) => {
      const instance = p.booking.flightInstance;
      return {
        fullName: p.fullName,
        maskedNationalId: p.nationalIdEnc
          ? maskNationalId(decryptPii(p.nationalIdEnc))
          : null,
        pnr: p.booking.pnr,
        status: p.booking.status,
        flightNo: instance.flight.flightNo,
        originCode: instance.flight.route.originCode,
        destCode: instance.flight.route.destCode,
        departureAt: instance.departureAt.toISOString(),
        seatCode: p.seatCode,
        cabin: cabinFor(
          mapByType.get(resolveAircraftType(instance)) ?? null,
          p.seatCode,
        ),
        priceIrr: p.booking.priceIrr,
      };
    });
  }
}
