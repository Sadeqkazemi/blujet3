import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import {
  OPS_ADMIN_DLQ_CONFIG,
  type OpsAdminDlqConfig,
} from './config/ops-admin-dlq.config';
import { OpsAdminDlqStore } from './modules/ops-admin/ops-admin-dlq.store';
import { OpsAdminKafkaRuntime } from './modules/ops-admin/ops-admin-kafka.runtime';
import { attestOpsAdminProjectionRuntimeRole } from './modules/ops-admin/ops-admin-runtime-role.attestation';

@ApiExcludeController()
@Controller()
export class OpsAdminProjectionWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: OpsAdminKafkaRuntime,
    private readonly dlq: OpsAdminDlqStore,
    @Inject(OPS_ADMIN_DLQ_CONFIG)
    private readonly dlqConfig: OpsAdminDlqConfig,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'blujet-ops-admin-projection',
      version:
        process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? 'dev',
      commit: process.env.GIT_COMMIT_SHA ?? 'unknown',
    };
  }

  @Get('ready')
  async ready() {
    try {
      await attestOpsAdminProjectionRuntimeRole(this.dataSource);
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT id, "taskVersion" FROM ops.cartable_tasks LIMIT 0',
        );
        await manager.query(
          'SELECT "eventId" FROM ops.cartable_projection_event_receipts LIMIT 0',
        );
        await manager.query(
          'SELECT "consumerGroup", topic, "partition", "nextOffset", "highWatermark", "updatedAt" FROM ops.kafka_consumer_checkpoints LIMIT 0',
        );
        await manager.query(
          'SELECT id, status FROM ops.kafka_processing_failures LIMIT 0',
        );
      });
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: { database: { status: 'down' } },
      });
    }

    const consumer = this.runtime.getStatus();
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
          service: 'blujet-ops-admin-projection',
          error: {
            database: { status: 'up' },
            consumer: { status: 'up', state: consumer.state },
            quarantine: { status: 'down' },
          },
        });
      }
    }

    if (!this.runtime.isReady()) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: consumer.state },
          quarantine,
        },
      });
    }

    return {
      status: 'ok',
      service: 'blujet-ops-admin-projection',
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: consumer.state,
          checkpoint: {
            partitions: consumer.checkpointPartitions,
            maxObservedLag: consumer.maxObservedLag,
            lastCheckpointAt: consumer.lastCheckpointAt,
          },
        },
        quarantine,
      },
    };
  }
}
