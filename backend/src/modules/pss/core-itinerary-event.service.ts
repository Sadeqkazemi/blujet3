import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  createItineraryOrderCreated,
  createItineraryPaymentConfirmed,
  createItineraryRefundRequested,
  createItineraryTicketIssued,
} from '../../common/events/core-itinerary-events';
import { AuditService } from '../audit/audit.service';
import { CommerceOutboxService } from '../commerce-outbox/commerce-outbox.service';
import { CommerceSagaService } from '../commerce-outbox/commerce-saga.service';
import { User } from '../../database/entities/user.entity';
import type { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import type { CoreItineraryPaymentConfirmation } from '../../database/entities/core-itinerary-payment-confirmation.entity';
import type { CoreItineraryRefund } from '../../database/entities/core-itinerary-refund.entity';
import type { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';

/**
 * Publishes only after the Core transaction has written its audit evidence.
 * The outbox row and audit row share the caller's transaction, so a rollback
 * cannot leave a consumer believing that a business transition committed.
 */
@Injectable()
export class CoreItineraryEventService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: CommerceOutboxService,
    private readonly saga: CommerceSagaService,
  ) {}

  async orderCreated(
    manager: EntityManager,
    order: CoreItineraryOrder,
  ): Promise<void> {
    const auditId = await this.recordAudit(manager, order.ownerId, {
      action: 'ایجاد hold سفارش چندسگمنتی',
      detail: `سفارش ${order.pnr} ایجاد شد و موجودی آن در وضعیت hold قرار گرفت.`,
      entityType: 'CoreItineraryOrder',
      entityId: order.id,
    });
    await this.outbox.enqueueItinerary(
      manager,
      createItineraryOrderCreated(order, {
        auditId,
        correlationId: `core-itinerary:${order.id}`,
        idempotencyKey: `order-created:${order.id}`,
      }),
    );
    await this.saga.start(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: order.id,
      correlationId: `core-itinerary:${order.id}`,
      idempotencyKey: `fulfilment:${order.id}`,
      currentStep: 'HOLD_CREATED',
    });
  }

  async paymentConfirmed(
    manager: EntityManager,
    order: CoreItineraryOrder,
    confirmation: CoreItineraryPaymentConfirmation,
    documents: CoreItineraryTicketDocument[],
  ): Promise<void> {
    const auditId = await this.recordAudit(manager, order.ownerId, {
      action: 'تأیید پرداخت و صدور بلیت سفارش چندسگمنتی',
      detail: `پرداخت سفارش ${order.pnr} تأیید و ${documents.length} سند بلیت صادر شد.`,
      entityType: 'CoreItineraryOrder',
      entityId: order.id,
    });
    const context = {
      auditId,
      correlationId: `core-itinerary:${order.id}`,
      idempotencyKey: `payment-confirmed:${confirmation.id}`,
    };
    await this.ensureFulfilmentSaga(manager, order);
    await this.outbox.enqueueItinerary(
      manager,
      createItineraryPaymentConfirmed(order, confirmation, context),
    );
    await this.outbox.enqueueItinerary(
      manager,
      createItineraryTicketIssued(order, documents, {
        ...context,
        idempotencyKey: `ticket-issued:${order.id}`,
      }),
    );
    await this.saga.advance(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: order.id,
      currentStep: 'PAYMENT_CAPTURED_AND_TICKETED',
      status: 'COMPLETED',
    });
  }

  async refundRequested(
    manager: EntityManager,
    order: CoreItineraryOrder,
    refund: CoreItineraryRefund,
  ): Promise<void> {
    const auditId = await this.recordAudit(manager, refund.ownerId, {
      action: 'ثبت درخواست استرداد سفارش چندسگمنتی',
      detail: `درخواست استرداد ${refund.refundReference} برای سفارش ${order.pnr} ثبت شد.`,
      entityType: 'CoreItineraryRefund',
      entityId: refund.id,
    });
    await this.outbox.enqueueItinerary(
      manager,
      createItineraryRefundRequested(order, refund, {
        auditId,
        correlationId: `core-itinerary:${order.id}`,
        idempotencyKey: `refund-requested:${refund.id}`,
      }),
    );
    await this.saga.start(manager, {
      sagaType: 'CORE_ITINERARY_REFUND',
      aggregateId: refund.id,
      correlationId: `core-itinerary:${order.id}`,
      idempotencyKey: `refund:${refund.id}`,
      currentStep: 'REFUND_REQUESTED',
    });
  }

  async fulfilmentFailed(
    manager: EntityManager,
    order: CoreItineraryOrder,
    failureCode: string,
  ): Promise<void> {
    await this.ensureFulfilmentSaga(manager, order);
    await this.saga.advance(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: order.id,
      currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
      status: 'COMPENSATION_REQUIRED',
      failureCode,
    });
  }

  async refundFailed(
    manager: EntityManager,
    refund: CoreItineraryRefund,
    failureCode: string,
  ): Promise<void> {
    await this.saga.start(manager, {
      sagaType: 'CORE_ITINERARY_REFUND',
      aggregateId: refund.id,
      correlationId: `core-itinerary:${refund.orderId}`,
      idempotencyKey: `refund:${refund.id}`,
      currentStep: 'REFUND_REQUESTED',
    });
    await this.saga.advance(manager, {
      sagaType: 'CORE_ITINERARY_REFUND',
      aggregateId: refund.id,
      currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
      status: 'COMPENSATION_REQUIRED',
      failureCode,
    });
  }

  private async ensureFulfilmentSaga(
    manager: EntityManager,
    order: CoreItineraryOrder,
  ): Promise<void> {
    await this.saga.start(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: order.id,
      correlationId: `core-itinerary:${order.id}`,
      idempotencyKey: `fulfilment:${order.id}`,
      currentStep: 'HOLD_CREATED',
    });
  }

  private async recordAudit(
    manager: EntityManager,
    actorId: string,
    input: {
      action: string;
      detail: string;
      entityType: string;
      entityId: string;
    },
  ): Promise<string> {
    const actor = await manager.findOne(User, {
      where: { id: actorId },
      select: { id: true, role: true },
    });
    if (!actor) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مالک سفارش برای ثبت رویداد یافت نشد.',
      });
    }
    const row = await this.audit.record(
      {
        actorId: actor.id,
        actorRole: actor.role,
        category: 'RESERVATION',
        action: input.action,
        detail: input.detail,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      manager,
    );
    return row.id;
  }
}
