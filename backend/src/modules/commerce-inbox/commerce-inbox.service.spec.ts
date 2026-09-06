import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CanonicalEventType,
  createCanonicalEvent,
} from '../../common/events/canonical-events';
import { CommerceInboxService } from './commerce-inbox.service';

describe('Core inbox input boundary', () => {
  const transaction = jest.fn();
  const service = new CommerceInboxService({
    transaction,
  } as unknown as DataSource);
  const apply = jest.fn();
  const event = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer: 'core',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      correlationId: 'request-1',
      idempotencyKey: 'key-1',
      payload: { amountIrr: '1000' },
    });
  beforeEach(() => jest.clearAllMocks());
  it.each([
    null,
    {},
    { eventVersion: 2 },
    { payload: null },
    { eventId: 'invalid' },
  ])('rejects invalid input before DB access (%#)', async (change) => {
    await expect(
      service.consume(
        'reader',
        'core',
        change === null
          ? null
          : {
              ...event(),
              ...change,
              ...(Object.keys(change).length === 0 ? { producer: '' } : {}),
            },
        apply,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
  it.each(['', ' bad', 'a'.repeat(129), 'a\n'])(
    'rejects invalid configured identity (%#)',
    async (name) => {
      await expect(
        service.consume(name, 'core', event(), apply),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.consume('reader', name, event(), apply),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects an unexpected producer before DB access', async () => {
    await expect(
      service.consume('reader', 'notify', event(), apply),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
