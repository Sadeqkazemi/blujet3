import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../common/errors';

type PendingRow = {
  id: string;
  bookingId: string;
  pnr: string;
  bookingStatus: string;
  gatewayRefId: string;
  amountIrr: string;
  createdAt: Date;
};

type BookingRow = {
  id: string;
  pnr: string;
  status: string;
  totalIrr: string;
  currency: string;
};

type AttemptRow = {
  id: string;
  amountIrr: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ReconciliationRow = {
  id: string;
  gatewayRefId: string;
  amountIrr: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

type LedgerRow = {
  id: string;
  type: string;
  signedAmountIrr: string;
  occurredAt: Date;
};

@Injectable()
export class PaymentReconciliationReadService {
  constructor(private readonly dataSource: DataSource) {}

  async listPending(limit: number) {
    const rows = await this.dataSource.query<PendingRow[]>(
      `SELECT r.id, r."bookingId", b.pnr, b.status AS "bookingStatus",
          r."gatewayRefId", r."amountIrr"::text AS "amountIrr", r."createdAt"
       FROM payments.payment_reconciliations r
       JOIN orders.bookings b ON b.id = r."bookingId"
       WHERE r.status = 'PENDING' AND b."deletedAt" IS NULL
       ORDER BY r."createdAt" ASC, r.id ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      pnr: row.pnr,
      bookingStatus: row.bookingStatus,
      gatewayRefId: row.gatewayRefId,
      amountIrr: row.amountIrr,
      currency: 'IRR' as const,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  async status(reference: string) {
    const normalized = reference.trim();
    if (normalized.length < 1 || normalized.length > 128) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مرجع سفارش معتبر نیست.',
      });
    }
    const bookings = (await this.dataSource.query(
      `SELECT id, pnr, status, "totalIrr"::text AS "totalIrr", currency
       FROM orders.bookings
       WHERE (id = $1 OR pnr = $1) AND "deletedAt" IS NULL
       LIMIT 1`,
      [normalized],
    )) as unknown as BookingRow[];
    const booking = bookings[0];
    if (!booking) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'سفارش یافت نشد.',
      });
    }
    const [attempts, reconciliations, ledger] = await Promise.all([
      this.dataSource.query<AttemptRow[]>(
        `SELECT id, "amountIrr"::text AS "amountIrr", status, "createdAt", "updatedAt"
         FROM payments.payment_attempts WHERE "bookingId" = $1
         ORDER BY "createdAt" ASC, id ASC`,
        [booking.id],
      ),
      this.dataSource.query<ReconciliationRow[]>(
        `SELECT id, "gatewayRefId", "amountIrr"::text AS "amountIrr", status,
            "createdAt", "resolvedAt"
         FROM payments.payment_reconciliations WHERE "bookingId" = $1
         ORDER BY "createdAt" ASC, id ASC`,
        [booking.id],
      ),
      this.dataSource.query<LedgerRow[]>(
        `SELECT id, type, "signedAmountIrr"::text AS "signedAmountIrr", "occurredAt"
         FROM payments.ledger_entries WHERE "bookingId" = $1
         ORDER BY "occurredAt" ASC, id ASC`,
        [booking.id],
      ),
    ]);
    return {
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        status: booking.status,
        totalIrr: booking.totalIrr,
        currency: booking.currency,
      },
      attempts: attempts.map((row) => ({
        id: row.id,
        amountIrr: row.amountIrr,
        status: row.status,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      })),
      reconciliations: reconciliations.map((row) => ({
        id: row.id,
        gatewayRefId: row.gatewayRefId,
        amountIrr: row.amountIrr,
        status: row.status,
        createdAt: new Date(row.createdAt).toISOString(),
        resolvedAt: row.resolvedAt
          ? new Date(row.resolvedAt).toISOString()
          : null,
      })),
      ledger: ledger.map((row) => ({
        id: row.id,
        type: row.type,
        signedAmountIrr: row.signedAmountIrr,
        occurredAt: new Date(row.occurredAt).toISOString(),
      })),
    };
  }
}
