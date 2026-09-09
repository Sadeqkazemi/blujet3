import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../common/errors';

type DueHoldRow = {
  id: string;
  pnr: string;
  channel: string;
  status: string;
  currency: string;
  totalIrr: string;
  holdExpiresAt: Date;
  version: number;
};

type OrderRow = DueHoldRow & {
  sourceOfferId: string | null;
  fareIrr: string;
  taxIrr: string;
  extrasIrr: string;
  createdAt: Date;
  updatedAt: Date;
};

type SegmentRow = {
  id: string;
  sequence: number;
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destinationCode: string;
  departureAt: Date;
  arrivalAt: Date;
  cabin: string;
  fareClassCode: string | null;
  occupiedSeats: number;
  travellerCount: number;
  fareIrr: string;
  taxIrr: string;
  extrasIrr: string;
  totalIrr: string;
};

type LifecycleRow = {
  id: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  occurredAt: Date;
};

@Injectable()
export class OrderBookingReadService {
  constructor(private readonly dataSource: DataSource) {}

  async listDueHolds(asOf: string | undefined, limit: number) {
    const cutoff = asOf ? new Date(asOf) : new Date();
    const rows = await this.dataSource.query<DueHoldRow[]>(
      `SELECT id, pnr, channel, status, currency,
          "totalIrr"::text AS "totalIrr", "holdExpiresAt", version
       FROM orders.core_itinerary_orders
       WHERE status = 'HELD' AND "holdExpiresAt" <= $1
       ORDER BY "holdExpiresAt" ASC, id ASC
       LIMIT $2`,
      [cutoff, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      pnr: row.pnr,
      channel: row.channel,
      status: row.status,
      currency: row.currency,
      totalIrr: row.totalIrr,
      holdExpiresAt: new Date(row.holdExpiresAt).toISOString(),
      version: row.version,
    }));
  }

  async getOrder(reference: string) {
    const normalized = reference.trim();
    if (normalized.length < 1 || normalized.length > 128) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مرجع سفارش معتبر نیست.',
      });
    }
    const orders = await this.dataSource.query<OrderRow[]>(
      `SELECT id, pnr, channel, status, currency, "sourceOfferId",
          "fareIrr"::text AS "fareIrr", "taxIrr"::text AS "taxIrr",
          "extrasIrr"::text AS "extrasIrr", "totalIrr"::text AS "totalIrr",
          "holdExpiresAt", version, "createdAt", "updatedAt"
       FROM orders.core_itinerary_orders
       WHERE id = $1 OR pnr = $1
       LIMIT 1`,
      [normalized],
    );
    const order = orders[0];
    if (!order) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سفارش یافت نشد.',
      });
    }

    const [segments, lifecycle] = await Promise.all([
      this.dataSource.query<SegmentRow[]>(
        `SELECT s.id, s.sequence, s."flightInstanceId", s."flightNo",
            s."originCode", s."destinationCode", s."departureAt", s."arrivalAt",
            s.cabin, s."fareClassCode", s."occupiedSeats",
            COUNT(DISTINCT ts."travellerId")::int AS "travellerCount",
            s."fareIrr"::text AS "fareIrr", s."taxIrr"::text AS "taxIrr",
            s."extrasIrr"::text AS "extrasIrr", s."totalIrr"::text AS "totalIrr"
         FROM orders.core_itinerary_segments s
         LEFT JOIN orders.core_itinerary_traveller_segments ts
           ON ts."segmentId" = s.id
         WHERE s."orderId" = $1
         GROUP BY s.id
         ORDER BY s.sequence ASC, s.id ASC`,
        [order.id],
      ),
      this.dataSource.query<LifecycleRow[]>(
        `SELECT id, "eventType", "fromStatus", "toStatus", "occurredAt"
         FROM orders.core_itinerary_lifecycle_events
         WHERE "orderId" = $1
         ORDER BY "occurredAt" ASC, id ASC`,
        [order.id],
      ),
    ]);

    return {
      order: {
        id: order.id,
        pnr: order.pnr,
        channel: order.channel,
        status: order.status,
        currency: order.currency,
        sourceOfferId: order.sourceOfferId,
        fareIrr: order.fareIrr,
        taxIrr: order.taxIrr,
        extrasIrr: order.extrasIrr,
        totalIrr: order.totalIrr,
        holdExpiresAt: new Date(order.holdExpiresAt).toISOString(),
        version: order.version,
        createdAt: new Date(order.createdAt).toISOString(),
        updatedAt: new Date(order.updatedAt).toISOString(),
      },
      segments: segments.map((segment) => ({
        ...segment,
        departureAt: new Date(segment.departureAt).toISOString(),
        arrivalAt: new Date(segment.arrivalAt).toISOString(),
      })),
      lifecycle: lifecycle.map((event) => ({
        ...event,
        occurredAt: new Date(event.occurredAt).toISOString(),
      })),
    };
  }
}
