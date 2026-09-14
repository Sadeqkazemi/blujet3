import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ErrorCode } from '../common/errors';
import { AgencyCreditRequest } from '../database/entities/agency-credit-request.entity';
import { AgencyInvoice } from '../database/entities/agency-invoice.entity';
import { AgencyKafkaConsumerCheckpoint } from '../database/entities/agency-kafka-consumer-checkpoint.entity';
import { AgencyProfile } from '../database/entities/agency-profile.entity';
import { AgencyProjectionEventReceipt } from '../database/entities/agency-projection-event-receipt.entity';
import { AgencyProjectionSlot } from '../database/entities/agency-projection-slot.entity';
import {
  snapshotPayload,
  type AgencyProjectionEvent,
} from './agency-projection-event';
import { fingerprintJson } from './fingerprint';

export type AgencyProjectionResult = 'applied' | 'duplicate' | 'stale';
export type AgencyEventDelivery = {
  consumerGroup: string;
  topic: string;
  partition: number;
  nextOffset: string;
  highWatermark?: string;
};
export type AgencyCheckpointState = {
  partitions: readonly number[];
  maxLag: string | null;
  lastCheckpointAt: string | null;
};

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
export class AgencyProjectionStore {
  constructor(private readonly dataSource: DataSource) {}

  project(
    event: AgencyProjectionEvent,
    delivery?: AgencyEventDelivery,
  ): Promise<AgencyProjectionResult> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      for (const lock of [
        `aggregate:${event.aggregateType}:${event.aggregateId}`,
        `event:${event.eventId}`,
      ].sort()) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`agency-projection:${lock}`],
        );
      }

      const envelopeFingerprint = fingerprintJson(event);
      const semanticFingerprint = this.semanticFingerprint(event);
      const receipts = manager.getRepository(AgencyProjectionEventReceipt);
      const existingReceipt = await receipts.findOneBy({
        eventId: event.eventId,
      });
      if (existingReceipt) {
        if (existingReceipt.envelopeFingerprint === envelopeFingerprint) {
          await this.saveCheckpoint(manager, delivery);
          return 'duplicate';
        }
        conflict('شناسهٔ رویداد آژانس با محتوای متفاوت تکرار شده است.');
      }

      const slots = manager.getRepository(AgencyProjectionSlot);
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
        )
          conflict('وضعیت داخلی Projection آژانس ناسازگار است.');
      }

      if (current && event.payload.recordVersion < current.version) {
        await this.saveReceipt(
          manager,
          event,
          envelopeFingerprint,
          semanticFingerprint,
        );
        await this.saveCheckpoint(manager, delivery);
        return 'stale';
      }

      if (current && event.payload.recordVersion === current.version) {
        const matches =
          this.snapshotFingerprint(event, current.snapshot) ===
            this.snapshotFingerprint(event, snapshotPayload(event)) &&
          (!slot || slot.semanticFingerprint === semanticFingerprint);
        if (!matches)
          conflict('نسخهٔ یکسان رویداد آژانس دارای محتوای متفاوت است.');
        await this.saveReceipt(
          manager,
          event,
          envelopeFingerprint,
          semanticFingerprint,
        );
        if (!slot) await this.saveSlot(manager, event, semanticFingerprint);
        await this.saveCheckpoint(manager, delivery);
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
      await this.saveCheckpoint(manager, delivery);
      return 'applied';
    });
  }

  checkpointIgnoredDelivery(delivery: AgencyEventDelivery): Promise<void> {
    return this.dataSource.transaction('READ COMMITTED', (manager) =>
      this.saveCheckpoint(manager, delivery),
    );
  }

  async getCheckpointState(
    consumerGroup: string,
    topic: string,
  ): Promise<AgencyCheckpointState> {
    const rows = await this.dataSource
      .getRepository(AgencyKafkaConsumerCheckpoint)
      .find({ where: { consumerGroup, topic }, order: { partition: 'ASC' } });
    let maxLag: bigint | null = null;
    let lastCheckpointAt: Date | null = null;
    for (const row of rows) {
      if (row.highWatermark !== null) {
        const observed = BigInt(row.highWatermark) - BigInt(row.nextOffset);
        const lag = observed > 0n ? observed : 0n;
        if (maxLag === null || lag > maxLag) maxLag = lag;
      }
      if (lastCheckpointAt === null || row.updatedAt > lastCheckpointAt)
        lastCheckpointAt = row.updatedAt;
    }
    return {
      partitions: rows.map((row) => row.partition),
      maxLag: maxLag?.toString() ?? null,
      lastCheckpointAt: lastCheckpointAt?.toISOString() ?? null,
    };
  }

  private async current(
    manager: EntityManager,
    event: AgencyProjectionEvent,
  ): Promise<CurrentProjection | null> {
    switch (event.eventType) {
      case 'AgencyProfileProjected': {
        const row = await manager
          .getRepository(AgencyProfile)
          .findOneBy({ userId: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                licenseNo: row.licenseNo,
                managerName: row.managerName,
                phone: row.phone,
                email: row.email,
                city: row.city,
                address: row.address,
                tier: row.tier,
                suspendedAt: nullableDate(row.suspendedAt),
                suspendReason: row.suspendReason,
                joinedAt: date(row.joinedAt),
              },
            }
          : null;
      }
      case 'AgencyInvoiceProjected': {
        const row = await manager
          .getRepository(AgencyInvoice)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                agencyId: row.agencyId,
                invoiceNo: row.invoiceNo,
                issuedById: row.issuedById,
                issuedAt: date(row.issuedAt),
                dueAt: date(row.dueAt),
                amountIrr: row.amountIrr,
                status: row.status,
                paidAt: nullableDate(row.paidAt),
                descriptionFa: row.descriptionFa,
                bookingId: row.bookingId,
              },
            }
          : null;
      }
      case 'AgencyCreditRequestProjected': {
        const row = await manager
          .getRepository(AgencyCreditRequest)
          .findOneBy({ id: event.aggregateId });
        return row
          ? {
              version: row.version,
              snapshot: {
                recordVersion: row.version,
                agencyId: row.agencyId,
                requestedLimitIrr: row.requestedLimitIrr,
                note: row.note,
                status: row.status,
                decidedById: row.decidedById,
                decidedAt: nullableDate(row.decidedAt),
                createdAt: date(row.createdAt),
              },
            }
          : null;
      }
    }
  }

  private async apply(
    manager: EntityManager,
    event: AgencyProjectionEvent,
  ): Promise<void> {
    switch (event.eventType) {
      case 'AgencyProfileProjected': {
        const payload = event.payload;
        const repository = manager.getRepository(AgencyProfile);
        await repository.save(
          repository.create({
            userId: event.aggregateId,
            version: payload.recordVersion,
            licenseNo: payload.licenseNo,
            managerName: payload.managerName,
            phone: payload.phone,
            email: payload.email,
            city: payload.city,
            address: payload.address,
            tier: payload.tier,
            suspendedAt: payload.suspendedAt
              ? new Date(payload.suspendedAt)
              : null,
            suspendReason: payload.suspendReason,
            joinedAt: new Date(payload.joinedAt),
          }),
        );
        return;
      }
      case 'AgencyInvoiceProjected': {
        const payload = event.payload;
        await this.requireProfile(manager, payload.agencyId);
        const repository = manager.getRepository(AgencyInvoice);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            agencyId: payload.agencyId,
            invoiceNo: payload.invoiceNo,
            issuedById: payload.issuedById,
            issuedAt: new Date(payload.issuedAt),
            dueAt: new Date(payload.dueAt),
            amountIrr: payload.amountIrr,
            status: payload.status,
            paidAt: payload.paidAt ? new Date(payload.paidAt) : null,
            descriptionFa: payload.descriptionFa,
            bookingId: payload.bookingId,
          }),
        );
        return;
      }
      case 'AgencyCreditRequestProjected': {
        const payload = event.payload;
        await this.requireProfile(manager, payload.agencyId);
        const repository = manager.getRepository(AgencyCreditRequest);
        await repository.save(
          repository.create({
            id: event.aggregateId,
            version: payload.recordVersion,
            agencyId: payload.agencyId,
            requestedLimitIrr: payload.requestedLimitIrr,
            note: payload.note,
            status: payload.status,
            decidedById: payload.decidedById,
            decidedAt: payload.decidedAt ? new Date(payload.decidedAt) : null,
            createdAt: new Date(payload.createdAt),
          }),
        );
      }
    }
  }

  private async requireProfile(
    manager: EntityManager,
    agencyId: string,
  ): Promise<void> {
    if (
      !(await manager
        .getRepository(AgencyProfile)
        .existsBy({ userId: agencyId }))
    )
      conflict('پروفایل وابسته هنوز در Projection آژانس موجود نیست.');
  }

  private saveReceipt(
    manager: EntityManager,
    event: AgencyProjectionEvent,
    envelopeFingerprint: string,
    semanticFingerprint: string,
  ): Promise<AgencyProjectionEventReceipt> {
    const repository = manager.getRepository(AgencyProjectionEventReceipt);
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
    event: AgencyProjectionEvent,
    semanticFingerprint: string,
  ): Promise<AgencyProjectionSlot> {
    const repository = manager.getRepository(AgencyProjectionSlot);
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

  private saveCheckpoint(
    manager: EntityManager,
    delivery?: AgencyEventDelivery,
  ): Promise<void> {
    if (delivery === undefined) return Promise.resolve();
    return manager
      .query(
        `INSERT INTO "agency"."kafka_consumer_checkpoints"
          ("consumerGroup", "topic", "partition", "nextOffset", "highWatermark")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("consumerGroup", "topic", "partition") DO UPDATE SET
           "nextOffset" = GREATEST(
             "agency"."kafka_consumer_checkpoints"."nextOffset",
             EXCLUDED."nextOffset"
           ),
           "highWatermark" = CASE
             WHEN EXCLUDED."highWatermark" IS NULL
               THEN "agency"."kafka_consumer_checkpoints"."highWatermark"
             WHEN "agency"."kafka_consumer_checkpoints"."highWatermark" IS NULL
               THEN EXCLUDED."highWatermark"
             ELSE GREATEST(
               "agency"."kafka_consumer_checkpoints"."highWatermark",
               EXCLUDED."highWatermark"
             )
           END,
           "updatedAt" = now()`,
        [
          delivery.consumerGroup,
          delivery.topic,
          delivery.partition,
          delivery.nextOffset,
          delivery.highWatermark ?? null,
        ],
      )
      .then(() => undefined);
  }

  private semanticFingerprint(event: AgencyProjectionEvent): string {
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
    event: AgencyProjectionEvent,
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
