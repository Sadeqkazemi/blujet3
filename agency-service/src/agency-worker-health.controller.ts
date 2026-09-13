import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AgencyKafkaRuntime } from './projection/agency-kafka.runtime';

const SERVICE = 'blujet-agency-projection-worker';

@ApiExcludeController()
@Controller()
export class AgencyWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: AgencyKafkaRuntime,
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
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT "userId", version FROM agency.agency_profiles LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM agency.agency_invoices LIMIT 0',
        );
        await manager.query(
          'SELECT id, version FROM agency.agency_credit_requests LIMIT 0',
        );
        await manager.query(
          'SELECT "eventId" FROM agency.agency_projection_event_receipts LIMIT 0',
        );
        await manager.query(
          'SELECT "aggregateType", "aggregateId" FROM agency.agency_projection_slots LIMIT 0',
        );
        await manager.query(
          'SELECT "consumerGroup", topic, "partition", "nextOffset", "highWatermark", "updatedAt" FROM agency.kafka_consumer_checkpoints LIMIT 0',
        );
      });
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: SERVICE,
        error: { database: { status: 'down' } },
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
      },
    };
  }
}
