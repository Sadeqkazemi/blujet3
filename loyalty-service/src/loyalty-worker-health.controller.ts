import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import {
  LOYALTY_DLQ_CONFIG,
  type LoyaltyDlqConfig,
} from './loyalty-dlq.config';
import { LoyaltyDlqStore } from './projection/loyalty-dlq.store';
import { LoyaltyKafkaRuntime } from './projection/loyalty-kafka.runtime';
import { attestLoyaltyProjectionRuntimeRole } from './projection/loyalty-runtime-role.attestation';

const SERVICE = 'blujet-loyalty-projection-worker';

@ApiExcludeController()
@Controller()
export class LoyaltyWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: LoyaltyKafkaRuntime,
    private readonly dlq: LoyaltyDlqStore,
    @Inject(LOYALTY_DLQ_CONFIG)
    private readonly dlqConfig: LoyaltyDlqConfig,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: SERVICE,
      version:
        process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? 'dev',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    };
  }

  @Get('ready')
  async ready() {
    try {
      await attestLoyaltyProjectionRuntimeRole(this.dataSource);
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT id, version FROM loyalty.club_members LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM loyalty.club_points_entries LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM loyalty.club_card_requests LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM loyalty.club_tier_rules LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM loyalty.price_locks LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM loyalty.customer_referrals LIMIT 0',
        );
        await manager.query(
          'SELECT "eventId" FROM loyalty.loyalty_projection_event_receipts LIMIT 0',
        );
        await manager.query(
          'SELECT "aggregateType", "aggregateId" FROM loyalty.loyalty_projection_slots LIMIT 0',
        );
        await manager.query(
          'SELECT "consumerGroup", topic, "partition", "nextOffset", "highWatermark", "updatedAt" FROM loyalty.kafka_consumer_checkpoints LIMIT 0',
        );
        await manager.query(
          'SELECT id, status FROM loyalty.kafka_processing_failures LIMIT 0',
        );
      });
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: SERVICE,
        error: { database: { status: 'down-or-misconfigured' } },
      });
    }

    if (!this.runtime.isReady()) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: SERVICE,
        error: {
          database: { status: 'up' },
          consumer: {
            status: 'down',
            state: this.runtime.getStatus().state,
          },
        },
      });
    }

    let quarantine: { status: 'disabled' } | { status: 'up'; count: number } = {
      status: 'disabled',
    };
    if (this.dlqConfig.enabled) {
      try {
        quarantine = {
          status: 'up',
          count: await this.dlq.countQuarantined(),
        };
      } catch {
        throw new ServiceUnavailableException({
          status: 'error',
          service: SERVICE,
          error: {
            database: { status: 'up' },
            consumer: {
              status: 'up',
              state: this.runtime.getStatus().state,
            },
            quarantine: { status: 'down' },
          },
        });
      }
    }

    const status = this.runtime.getStatus();
    return {
      status: 'ok',
      service: SERVICE,
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: status.state,
          checkpoint: {
            partitions: status.checkpointPartitions,
            maxObservedLag: status.maxObservedLag,
            lastCheckpointAt: status.lastCheckpointAt,
          },
        },
        quarantine,
      },
    };
  }
}
