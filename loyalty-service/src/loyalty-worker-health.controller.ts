import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { LoyaltyKafkaRuntime } from './projection/loyalty-kafka.runtime';

const SERVICE = 'blujet-loyalty-projection-worker';

@ApiExcludeController()
@Controller()
export class LoyaltyWorkerHealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: LoyaltyKafkaRuntime,
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

    return {
      status: 'ok',
      service: SERVICE,
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: this.runtime.getStatus().state,
        },
      },
    };
  }
}
