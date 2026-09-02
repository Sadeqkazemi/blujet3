import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentReconciliation } from '../../database/entities/payment-reconciliation.entity';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../../common/errors';
import { PaymentReconciliationStatus } from '../../database/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Phase 13 Part E — the real "payment succeeded, ticket not issued"
 * queue: PaymentReconciliation rows written the instant a GATEWAY payment
 * is confirmed, resolved atomically with ticket issuance. A PENDING row
 * past that point means the ticketing transaction never completed. See
 * docs/DB_SCHEMA.md. */
@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(PaymentReconciliation)
    private readonly reconciliationRepo: Repository<PaymentReconciliation>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.reconciliationRepo.find({
      where: { status: PaymentReconciliationStatus.PENDING },
      relations: { booking: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      pnr: r.booking.pnr,
      bookingStatus: r.booking.status,
      gatewayRefId: r.gatewayRefId,
      amountIrr: r.amountIrr,
      createdAt: r.createdAt,
    }));
  }

  async resolve(actor: AuthenticatedUser, id: string, resolutionNote: string) {
    const row = await this.reconciliationRepo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مورد تطبیق پرداخت یافت نشد.',
      });
    }
    if (row.status === PaymentReconciliationStatus.RESOLVED) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این مورد قبلاً رفع‌شده علامت خورده است.',
      });
    }

    row.status = PaymentReconciliationStatus.RESOLVED;
    row.resolvedById = actor.id;
    row.resolvedAt = new Date();
    row.resolutionNote = resolutionNote;
    const updated = await this.reconciliationRepo.save(row);

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'رفع مغایرت پرداخت',
      detail: `مغایرت پرداخت ${row.gatewayRefId} توسط ${actor.fullName} رفع شد: ${resolutionNote}`,
      entityType: 'PaymentReconciliation',
      entityId: id,
    });

    return updated;
  }
}
