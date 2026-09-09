import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../common/errors';

type InventoryRow = {
  flightInstanceId: string;
  departureAt: Date;
  arrivalAt: Date;
  capacity: number;
  charterSeats: number;
  agencySeatsAllocated: number | null;
  status: string;
  version: number;
  soldSeats: number;
  heldSeats: number;
  activeSeatLocks: number;
};

@Injectable()
export class InventoryReadService {
  constructor(private readonly dataSource: DataSource) {}

  async getAvailability(flightInstanceId: string) {
    const observedAt = new Date();
    const rows = await this.dataSource.query<InventoryRow[]>(
      `SELECT fi.id AS "flightInstanceId", fi."departureAt", fi."arrivalAt",
          fi.capacity, fi."charterSeats", fi."agencySeatsAllocated", fi.status,
          fi.version,
          COALESCE((SELECT SUM(s."occupiedSeats")::int
            FROM orders.core_itinerary_segments s
            JOIN orders.core_itinerary_orders o ON o.id = s."orderId"
            WHERE s."flightInstanceId" = fi.id
              AND o.status IN ('PAID', 'TICKETED', 'FLOWN', 'NO_SHOW')), 0)::int AS "soldSeats",
          COALESCE((SELECT SUM(s."occupiedSeats")::int
            FROM orders.core_itinerary_segments s
            JOIN orders.core_itinerary_orders o ON o.id = s."orderId"
            WHERE s."flightInstanceId" = fi.id
              AND o.status = 'HELD'
              AND o."holdExpiresAt" > $2), 0)::int AS "heldSeats",
          (SELECT COUNT(*)::int FROM inventory.seat_locks sl
            WHERE sl."flightInstanceId" = fi.id
              AND sl."releasedAt" IS NULL
              AND sl."expiresAt" > $2) AS "activeSeatLocks"
       FROM inventory.flight_instances fi
       WHERE fi.id = $1
       LIMIT 1`,
      [flightInstanceId, observedAt],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    const availableSeats = Math.max(
      0,
      row.capacity - row.soldSeats - row.heldSeats - row.activeSeatLocks,
    );
    return {
      flightInstanceId: row.flightInstanceId,
      departureAt: new Date(row.departureAt).toISOString(),
      arrivalAt: new Date(row.arrivalAt).toISOString(),
      capacity: row.capacity,
      charterSeats: row.charterSeats,
      agencySeatsAllocated: row.agencySeatsAllocated,
      status: row.status,
      version: row.version,
      soldSeats: row.soldSeats,
      heldSeats: row.heldSeats,
      activeSeatLocks: row.activeSeatLocks,
      availableSeats,
      observedAt: observedAt.toISOString(),
    };
  }
}
