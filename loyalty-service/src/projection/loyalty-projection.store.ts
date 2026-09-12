import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ErrorCode } from '../common/errors';
import { ClubCardRequest } from '../database/entities/club-card-request.entity';
import { ClubMember } from '../database/entities/club-member.entity';
import { ClubPointsEntry } from '../database/entities/club-points-entry.entity';
import { ClubTierRule } from '../database/entities/club-tier-rule.entity';
import { CustomerReferral } from '../database/entities/customer-referral.entity';
import { LoyaltyProjectionEventReceipt } from '../database/entities/loyalty-projection-event-receipt.entity';
import { LoyaltyProjectionSlot } from '../database/entities/loyalty-projection-slot.entity';
import { PriceLock } from '../database/entities/price-lock.entity';
import { fingerprintJson } from './fingerprint';
import {
  snapshotPayload,
  type LoyaltyProjectionEvent,
} from './loyalty-projection-event';

export type LoyaltyProjectionResult = 'applied' | 'duplicate' | 'stale';

type CurrentProjection = {
  version: number;
  snapshot: object;
};

function conflict(message: string): never {
  throw new ConflictException({ code: ErrorCode.CONFLICT, message });
}

function date(value: Date): string {
  return value.toISOString();
}

function nullableDate(value: Date | null): string | null {
  return value === null ? null : date(value);
}

@Injectable()
export class LoyaltyProjectionStore {
  constructor(private readonly dataSource: DataSource) {}

  project(event: LoyaltyProjectionEvent): Promise<LoyaltyProjectionResult> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      for (const lock of [
        `aggregate:${event.aggregateType}:${event.aggregateId}`,
        `event:${event.eventId}`,
      ].sort()) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`loyalty-projection:${lock}`],
        );
      }

      const envelopeFingerprint = fingerprintJson(event);
      const semanticFingerprint = this.semanticFingerprint(event);
      const receipts = manager.getRepository(LoyaltyProjectionEventReceipt);
      const existingReceipt = await receipts.findOneBy({
        eventId: event.eventId,
      });
      if (existingReceipt) {
        if (existingReceipt.envelopeFingerprint === envelopeFingerprint) {
          return 'duplicate';
        }
        conflict('شناسهٔ رویداد باشگاه با محتوای متفاوت تکرار شده است.');
      }

      const slots = manager.getRepository(LoyaltyProjectionSlot);
      const slot = await slots.findOneBy({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
      });
      const current = await this.current(manager, event);
      if (slot) {
        const currentFingerprint = current
          ? this.snapshotFingerprint(event, {
              auditId: slot.auditId,
              ...current.snapshot,
            })
          : null;
        if (
          !current ||
          slot.recordVersion !== current.version ||
          slot.semanticFingerprint !== currentFingerprint
        ) {
          conflict('وضعیت داخلی Projection باشگاه ناسازگار است.');
        }
      }

      if (current && event.payload.recordVersion < current.version) {
        await this.saveReceipt(
          manager,
          event,
          envelopeFingerprint,
          semanticFingerprint,
        );
        return 'stale';
      }

      if (current && event.payload.recordVersion === current.version) {
        const matching =
          this.snapshotFingerprint(event, current.snapshot) ===
            this.snapshotFingerprint(event, snapshotPayload(event)) &&
          (!slot || slot.semanticFingerprint === semanticFingerprint);
        if (!matching) {
          conflict('نسخهٔ یکسان رویداد باشگاه دارای محتوای متفاوت است.');
        }
        await this.saveReceipt(
          manager,
          event,
          envelopeFingerprint,
          semanticFingerprint,
        );
        if (!slot) {
          await this.saveSlot(manager, event, semanticFingerprint);
        }
        return 'duplicate';
      }

      await this.saveReceipt(
        manager,
        event,
        envelopeFingerprint,
        semanticFingerprint,
      );
      await this.apply(manager, event);
      await this.saveSlot(manager, event, semanticFingerprint);
      return 'applied';
    });
  }

  private async current(
    manager: EntityManager,
    event: LoyaltyProjectionEvent,
  ): Promise<CurrentProjection | null> {
    switch (event.eventType) {
      case 'LoyaltyMemberProjected': {
        const row = await manager
          .getRepository(ClubMember)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                userId: row.userId,
                fullName: row.fullName,
                email: row.email,
                birthDate: nullableDate(row.birthDate),
                nationalIdEnc: row.nationalIdEnc,
                nationalIdHash: row.nationalIdHash,
                joinDate: date(row.joinDate),
                points: row.points,
                level: row.level,
                cardStatus: row.cardStatus,
                cardNo: row.cardNo,
                issuedByLabelFa: row.issuedByLabelFa,
                createdAt: date(row.createdAt),
                deactivatedAt: nullableDate(row.deactivatedAt),
                deactivatedById: row.deactivatedById,
              },
            }
          : null;
      }
      case 'LoyaltyPointsEntryProjected': {
        const row = await manager
          .getRepository(ClubPointsEntry)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                clubMemberId: row.clubMemberId,
                type: row.type,
                signedPoints: row.signedPoints,
                bookingId: row.bookingId,
                createdAt: date(row.createdAt),
              },
            }
          : null;
      }
      case 'LoyaltyCardRequestProjected': {
        const row = await manager
          .getRepository(ClubCardRequest)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                memberId: row.memberId,
                level: row.level,
                points: row.points,
                status: row.status,
                assignedTo: row.assignedTo,
                decidedById: row.decidedById,
                decidedAt: nullableDate(row.decidedAt),
                cardNo: row.cardNo,
                history: row.history,
                createdAt: date(row.createdAt),
              },
            }
          : null;
      }
      case 'LoyaltyTierRuleProjected': {
        const row = await manager
          .getRepository(ClubTierRule)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                goldMinPoints: row.goldMinPoints,
                platinumMinPoints: row.platinumMinPoints,
                cardRequestMinPoints: row.cardRequestMinPoints,
                updatedById: row.updatedById,
                updatedAt: date(row.updatedAt),
                createdAt: date(row.createdAt),
              },
            }
          : null;
      }
      case 'LoyaltyPriceLockProjected': {
        const row = await manager
          .getRepository(PriceLock)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                userId: row.userId,
                flightInstanceId: row.flightInstanceId,
                cabin: row.cabin,
                lockedPriceIrr: row.lockedPriceIrr,
                feeIrr: row.feeIrr,
                feeCharged: row.feeCharged,
                status: row.status,
                expiresAt: date(row.expiresAt),
                createdAt: date(row.createdAt),
                bookingId: row.bookingId,
              },
            }
          : null;
      }
      case 'LoyaltyReferralProjected': {
        const row = await manager
          .getRepository(CustomerReferral)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                referrerUserId: row.referrerUserId,
                referredUserId: row.referredUserId,
                status: row.status,
                pointsAwarded: row.pointsAwarded,
                firstBookingId: row.firstBookingId,
                rewardedAt: nullableDate(row.rewardedAt),
                createdAt: date(row.createdAt),
                updatedAt: date(row.updatedAt),
              },
            }
          : null;
      }
    }
  }

  private async apply(
    manager: EntityManager,
    event: LoyaltyProjectionEvent,
  ): Promise<void> {
    switch (event.eventType) {
      case 'LoyaltyMemberProjected': {
        const payload = event.payload;
        const repository = manager.getRepository(ClubMember);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            userId: payload.userId,
            fullName: payload.fullName,
            email: payload.email,
            birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
            nationalIdEnc: payload.nationalIdEnc,
            nationalIdHash: payload.nationalIdHash,
            joinDate: new Date(payload.joinDate),
            points: payload.points,
            level: payload.level,
            cardStatus: payload.cardStatus,
            cardNo: payload.cardNo,
            issuedByLabelFa: payload.issuedByLabelFa,
            createdAt: new Date(payload.createdAt),
            deactivatedAt: payload.deactivatedAt
              ? new Date(payload.deactivatedAt)
              : null,
            deactivatedById: payload.deactivatedById,
          }),
        );
        return;
      }
      case 'LoyaltyPointsEntryProjected': {
        const payload = event.payload;
        await this.requireMember(manager, payload.clubMemberId);
        const repository = manager.getRepository(ClubPointsEntry);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            clubMemberId: payload.clubMemberId,
            type: payload.type,
            signedPoints: payload.signedPoints,
            bookingId: payload.bookingId,
            createdAt: new Date(payload.createdAt),
          }),
        );
        return;
      }
      case 'LoyaltyCardRequestProjected': {
        const payload = event.payload;
        await this.requireMember(manager, payload.memberId);
        const repository = manager.getRepository(ClubCardRequest);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            memberId: payload.memberId,
            level: payload.level,
            points: payload.points,
            status: payload.status,
            assignedTo: payload.assignedTo,
            decidedById: payload.decidedById,
            decidedAt: payload.decidedAt ? new Date(payload.decidedAt) : null,
            cardNo: payload.cardNo,
            history: payload.history,
            createdAt: new Date(payload.createdAt),
          }),
        );
        return;
      }
      case 'LoyaltyTierRuleProjected': {
        const payload = event.payload;
        const repository = manager.getRepository(ClubTierRule);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            goldMinPoints: payload.goldMinPoints,
            platinumMinPoints: payload.platinumMinPoints,
            cardRequestMinPoints: payload.cardRequestMinPoints,
            updatedById: payload.updatedById,
            updatedAt: new Date(payload.updatedAt),
            createdAt: new Date(payload.createdAt),
          }),
        );
        return;
      }
      case 'LoyaltyPriceLockProjected': {
        const payload = event.payload;
        const repository = manager.getRepository(PriceLock);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            userId: payload.userId,
            flightInstanceId: payload.flightInstanceId,
            cabin: payload.cabin,
            lockedPriceIrr: payload.lockedPriceIrr,
            feeIrr: payload.feeIrr,
            feeCharged: payload.feeCharged,
            status: payload.status,
            expiresAt: new Date(payload.expiresAt),
            createdAt: new Date(payload.createdAt),
            bookingId: payload.bookingId,
          }),
        );
        return;
      }
      case 'LoyaltyReferralProjected': {
        const payload = event.payload;
        const repository = manager.getRepository(CustomerReferral);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            referrerUserId: payload.referrerUserId,
            referredUserId: payload.referredUserId,
            status: payload.status,
            pointsAwarded: payload.pointsAwarded,
            firstBookingId: payload.firstBookingId,
            rewardedAt: payload.rewardedAt
              ? new Date(payload.rewardedAt)
              : null,
            createdAt: new Date(payload.createdAt),
            updatedAt: new Date(payload.updatedAt),
          }),
        );
      }
    }
  }

  private async requireMember(
    manager: EntityManager,
    memberId: string,
  ): Promise<void> {
    if (!(await manager.getRepository(ClubMember).existsBy({ id: memberId }))) {
      conflict('عضو وابسته هنوز در Projection باشگاه موجود نیست.');
    }
  }

  private saveReceipt(
    manager: EntityManager,
    event: LoyaltyProjectionEvent,
    envelopeFingerprint: string,
    semanticFingerprint: string,
  ): Promise<LoyaltyProjectionEventReceipt> {
    const repository = manager.getRepository(LoyaltyProjectionEventReceipt);
    return repository.save(
      repository.create({
        eventId: event.eventId,
        envelopeFingerprint,
        semanticFingerprint,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        recordVersion: event.payload.recordVersion,
        auditId: event.payload.auditId,
      }),
    );
  }

  private saveSlot(
    manager: EntityManager,
    event: LoyaltyProjectionEvent,
    semanticFingerprint: string,
  ): Promise<LoyaltyProjectionSlot> {
    const repository = manager.getRepository(LoyaltyProjectionSlot);
    return repository.save(
      repository.create({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        recordVersion: event.payload.recordVersion,
        semanticFingerprint,
        auditId: event.payload.auditId,
      }),
    );
  }

  private semanticFingerprint(event: LoyaltyProjectionEvent): string {
    return fingerprintJson({
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
    });
  }

  private snapshotFingerprint(
    event: LoyaltyProjectionEvent,
    snapshot: object,
  ): string {
    return fingerprintJson({
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: snapshot,
    });
  }
}
