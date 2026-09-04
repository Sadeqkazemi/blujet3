import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { CoreItineraryLifecycleEvent } from '../../database/entities/core-itinerary-lifecycle-event.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import type { HeldCoreItineraryDto } from './dto/hold-core-itinerary.dto';

@Injectable()
export class CoreItineraryCancelService {
  constructor(
    @InjectRepository(CoreItineraryOrder)
    private readonly orderRepo: Repository<CoreItineraryOrder>,
  ) {}

  async cancel(id: string, ownerId: string): Promise<HeldCoreItineraryDto> {
    return this.orderRepo.manager.transaction(async (manager) => {
      const order = await manager.findOne(CoreItineraryOrder, {
        where: { id, ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'رزرو چندسگمنتی یافت نشد.',
        });
      }
      if (order.status !== 'HELD' && order.status !== 'CANCELLED') {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این رزرو دیگر در وضعیت قابل لغو نیست.',
        });
      }
      if (order.status === 'HELD') {
        order.status = 'CANCELLED';
        await manager.save(order);
        const eventRepo = manager.getRepository(CoreItineraryLifecycleEvent);
        await eventRepo.save(
          eventRepo.create({
            orderId: order.id,
            eventType: 'HOLD_CANCELLED',
            fromStatus: 'HELD',
            toStatus: 'CANCELLED',
            occurredAt: new Date(),
          }),
        );
      }
      const segments = await manager.getRepository(CoreItinerarySegment).find({
        where: { orderId: order.id },
        order: { sequence: 'ASC' },
      });
      return {
        id: order.id,
        pnr: order.pnr,
        status: order.status,
        currency: 'IRR',
        holdExpiresAt: order.holdExpiresAt.toISOString(),
        segments: segments.map((segment) => ({
          sequence: segment.sequence,
          flightInstanceId: segment.flightInstanceId,
          cabin: segment.cabin,
          fareClassCode: segment.fareClassCode,
          occupiedSeats: segment.occupiedSeats,
          totalIrr: String(segment.totalIrr),
        })),
        totalIrr: String(order.totalIrr),
      };
    });
  }
}
