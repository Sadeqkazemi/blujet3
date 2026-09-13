import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  createAgencyCreditRequestProjected,
  createAgencyInvoiceProjected,
  createAgencyProfileProjected,
  type AgencyProjectionEvent,
} from '../../common/events/agency-events';
import { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyProjectionAudit } from '../../database/entities/agency-projection-audit.entity';
import { CommerceOutboxService } from '../commerce-outbox/commerce-outbox.service';

export const AGENCY_PROJECTION_MUTATIONS = [
  'CREATED',
  'UPDATED',
  'SUSPENDED',
  'REACTIVATED',
  'PAID',
  'VOIDED',
  'OVERDUE',
  'DECIDED',
] as const;

export type AgencyProjectionMutation =
  (typeof AGENCY_PROJECTION_MUTATIONS)[number];

type AgencyAggregateType =
  'AgencyProfile' | 'AgencyInvoice' | 'AgencyCreditRequest';

interface ProjectionRecord {
  aggregateType: AgencyAggregateType;
  aggregateId: string;
  recordVersion: number;
  mutation: AgencyProjectionMutation;
  build(auditId: string, occurredAt: Date): AgencyProjectionEvent;
}

@Injectable()
export class AgencyProjectionEventService {
  constructor(private readonly outbox: CommerceOutboxService) {}

  async recordProfileById(
    manager: EntityManager,
    id: string,
    mutation: AgencyProjectionMutation,
  ): Promise<AgencyProfile> {
    this.requireTransaction(manager);
    const row = await manager
      .createQueryBuilder(AgencyProfile, 'profile')
      .addSelect('profile.version')
      .where('profile.userId = :id', { id })
      .getOneOrFail();
    await this.recordProfile(manager, row, mutation);
    return row;
  }

  async recordInvoiceById(
    manager: EntityManager,
    id: string,
    mutation: AgencyProjectionMutation,
  ): Promise<AgencyInvoice> {
    this.requireTransaction(manager);
    const row = await manager
      .createQueryBuilder(AgencyInvoice, 'invoice')
      .addSelect('invoice.version')
      .where('invoice.id = :id', { id })
      .getOneOrFail();
    await this.recordInvoice(manager, row, mutation);
    return row;
  }

  async recordCreditRequestById(
    manager: EntityManager,
    id: string,
    mutation: AgencyProjectionMutation,
  ): Promise<AgencyCreditRequest> {
    this.requireTransaction(manager);
    const row = await manager
      .createQueryBuilder(AgencyCreditRequest, 'creditRequest')
      .addSelect('creditRequest.version')
      .where('creditRequest.id = :id', { id })
      .getOneOrFail();
    await this.recordCreditRequest(manager, row, mutation);
    return row;
  }

  recordProfile(
    manager: EntityManager,
    row: AgencyProfile,
    mutation: AgencyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'AgencyProfile',
      aggregateId: row.userId,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createAgencyProfileProjected(
          row,
          this.context(
            'AgencyProfile',
            row.userId,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordInvoice(
    manager: EntityManager,
    row: AgencyInvoice,
    mutation: AgencyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'AgencyInvoice',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createAgencyInvoiceProjected(
          row,
          this.context(
            'AgencyInvoice',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordCreditRequest(
    manager: EntityManager,
    row: AgencyCreditRequest,
    mutation: AgencyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'AgencyCreditRequest',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createAgencyCreditRequestProjected(
          row,
          this.context(
            'AgencyCreditRequest',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  private async record(
    manager: EntityManager,
    record: ProjectionRecord,
  ): Promise<{ eventId: string; auditId: string }> {
    this.requireTransaction(manager);

    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [
        JSON.stringify([
          record.aggregateType,
          record.aggregateId,
          record.recordVersion,
        ]),
      ],
    );
    const audits = manager.getRepository(AgencyProjectionAudit);
    const existing = await audits.findOneBy({
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      recordVersion: record.recordVersion,
    });
    if (existing && existing.mutation !== record.mutation) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'نسخهٔ رویداد آژانس با تغییر متفاوت ثبت شده است.',
      });
    }

    const auditId = existing?.id ?? randomUUID();
    if (!existing) {
      await audits.insert({
        id: auditId,
        aggregateType: record.aggregateType,
        aggregateId: record.aggregateId,
        recordVersion: record.recordVersion,
        mutation: record.mutation,
      });
    }
    const outbox = await this.outbox.enqueueAgency(
      manager,
      record.build(auditId, new Date()),
    );
    return { ...outbox, auditId };
  }

  private requireTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Agency projection requires an active Core transaction');
    }
  }

  private context(
    aggregateType: AgencyAggregateType,
    aggregateId: string,
    recordVersion: number,
    auditId: string,
    occurredAt: Date,
  ) {
    return {
      auditId,
      correlationId: `agency:${aggregateType}:${aggregateId}`,
      idempotencyKey: `agency-projected:${aggregateType}:${aggregateId}:v${recordVersion}`,
      occurredAt,
      recordVersion,
    };
  }
}
