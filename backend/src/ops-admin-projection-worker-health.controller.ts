import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { OpsAdminKafkaRuntime } from './modules/ops-admin/ops-admin-kafka.runtime';

@ApiExcludeController()
@Controller()
export class OpsAdminProjectionWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: OpsAdminKafkaRuntime,
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
      });
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: { database: { status: 'down' } },
      });
    }

    const consumer = this.runtime.getStatus();
    if (!this.runtime.isReady()) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: consumer.state },
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
      },
    };
  }
}
