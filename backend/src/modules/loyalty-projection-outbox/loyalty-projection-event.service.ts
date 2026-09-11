import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  createLoyaltyCardRequestProjected,
  createLoyaltyMemberProjected,
  createLoyaltyPointsEntryProjected,
  createLoyaltyPriceLockProjected,
  createLoyaltyReferralProjected,
  createLoyaltyTierRuleProjected,
  type LoyaltyProjectionEvent,
} from '../../common/events/loyalty-events';
import type { ClubCardRequest } from '../../database/entities/club-card-request.entity';
import type { ClubMember } from '../../database/entities/club-member.entity';
import type { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import type { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import type { CustomerReferral } from '../../database/entities/customer-referral.entity';
import { LoyaltyProjectionAudit } from '../../database/entities/loyalty-projection-audit.entity';
import type { PriceLock } from '../../database/entities/price-lock.entity';
import { CommerceOutboxService } from '../commerce-outbox/commerce-outbox.service';

export const LOYALTY_PROJECTION_MUTATIONS = [
  'CREATED',
  'UPDATED',
  'DEACTIVATED',
  'LINKED',
  'POINTS_CHANGED',
  'REFERRED',
  'DECIDED',
  'ISSUED',
  'CANCELLED',
  'CONSUMED',
  'EXPIRED',
  'REWARDED',
] as const;

export type LoyaltyProjectionMutation =
  (typeof LOYALTY_PROJECTION_MUTATIONS)[number];

type LoyaltyAggregateType =
  | 'LoyaltyMember'
  | 'LoyaltyPointsEntry'
  | 'LoyaltyCardRequest'
  | 'LoyaltyTierRule'
  | 'LoyaltyPriceLock'
  | 'LoyaltyReferral';

interface ProjectionRecord {
  aggregateType: LoyaltyAggregateType;
  aggregateId: string;
  recordVersion: number;
  mutation: LoyaltyProjectionMutation;
  build(auditId: string, occurredAt: Date): LoyaltyProjectionEvent;
}

@Injectable()
export class LoyaltyProjectionEventService {
  constructor(private readonly outbox: CommerceOutboxService) {}

  recordMember(
    manager: EntityManager,
    row: ClubMember,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyMember',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyMemberProjected(
          row,
          this.context(
            'LoyaltyMember',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordPointsEntry(
    manager: EntityManager,
    row: ClubPointsEntry,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyPointsEntry',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyPointsEntryProjected(
          row,
          this.context(
            'LoyaltyPointsEntry',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordCardRequest(
    manager: EntityManager,
    row: ClubCardRequest,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyCardRequest',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyCardRequestProjected(
          row,
          this.context(
            'LoyaltyCardRequest',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordTierRule(
    manager: EntityManager,
    row: ClubTierRule,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyTierRule',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyTierRuleProjected(
          row,
          this.context(
            'LoyaltyTierRule',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordPriceLock(
    manager: EntityManager,
    row: PriceLock,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyPriceLock',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyPriceLockProjected(
          row,
          this.context(
            'LoyaltyPriceLock',
            row.id,
            row.version,
            auditId,
            occurredAt,
          ),
        ),
    });
  }

  recordReferral(
    manager: EntityManager,
    row: CustomerReferral,
    mutation: LoyaltyProjectionMutation,
  ) {
    return this.record(manager, {
      aggregateType: 'LoyaltyReferral',
      aggregateId: row.id,
      recordVersion: row.version,
      mutation,
      build: (auditId, occurredAt) =>
        createLoyaltyReferralProjected(
          row,
          this.context(
            'LoyaltyReferral',
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
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Loyalty projection requires an active Core transaction');
    }

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
    const audits = manager.getRepository(LoyaltyProjectionAudit);
    const existing = await audits.findOneBy({
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      recordVersion: record.recordVersion,
    });
    if (existing && existing.mutation !== record.mutation) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
        message: 'نسخهٔ رویداد باشگاه با تغییر متفاوت ثبت شده است.',
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
    const outbox = await this.outbox.enqueueLoyalty(
      manager,
      record.build(auditId, new Date()),
    );
    return { ...outbox, auditId };
  }

  private context(
    aggregateType: LoyaltyAggregateType,
    aggregateId: string,
    recordVersion: number,
    auditId: string,
    occurredAt: Date,
  ) {
    return {
      auditId,
      correlationId: `loyalty:${aggregateType}:${aggregateId}`,
      idempotencyKey: `loyalty-projected:${aggregateType}:${aggregateId}:v${recordVersion}`,
      occurredAt,
      recordVersion,
    };
  }
}
