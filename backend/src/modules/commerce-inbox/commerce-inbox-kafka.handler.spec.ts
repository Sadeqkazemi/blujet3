import { BadRequestException } from '@nestjs/common';
import type { EachMessagePayload } from 'kafkajs';
import {
  createCanonicalEvent,
  CanonicalEventType,
} from '../../common/events/canonical-events';
import { CommerceInboxKafkaHandler } from './commerce-inbox-kafka.handler';
import { CommerceInboxService } from './commerce-inbox.service';
import { DataSource, EntityManager } from 'typeorm';

describe('CommerceInboxKafkaHandler', () => {
  const event = createCanonicalEvent({
    eventType: CanonicalEventType.ORDER_CREATED,
    producer: 'core-commerce',
    aggregateType: 'Order',
    aggregateId: 'order-1',
    correlationId: 'request-1',
    idempotencyKey: 'order-1-created',
    payload: { status: 'HELD' },
  });
  const subscription = {
    topic: 'commerce-events',
    consumer: 'core-reader',
    expectedProducer: 'core-commerce',
  };
  const inbox = {
    consume: jest
      .fn<
        ReturnType<CommerceInboxService['consume']>,
        Parameters<CommerceInboxService['consume']>
      >()
      .mockResolvedValue('processed'),
  };
  const commitOffsets = jest.fn().mockResolvedValue(undefined);
  const handler = new CommerceInboxKafkaHandler(
    inbox as unknown as CommerceInboxService,
  );
  function payload(
    overrides: Partial<EachMessagePayload> = {},
  ): EachMessagePayload {
    return {
      topic: subscription.topic,
      partition: 0,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      message: {
        offset: '4',
        key: Buffer.from(
          event.producer + ':' + event.aggregateType + ':' + event.aggregateId,
        ),
        value: Buffer.from(JSON.stringify(event)),
        headers: {
          'event-id': Buffer.from(event.eventId),
          'correlation-id': Buffer.from(event.correlationId),
          'event-version': Buffer.from('1'),
        },
      },
      ...overrides,
    } as unknown as EachMessagePayload;
  }
  beforeEach(() => {
    jest.resetAllMocks();
    inbox.consume.mockResolvedValue('processed');
    commitOffsets.mockResolvedValue(undefined);
  });
  it('uses manual acknowledgement and commits only after the DB inbox', async () => {
    const order: string[] = [];
    inbox.consume.mockImplementation(
      async (...args: Parameters<CommerceInboxService['consume']>) => {
        order.push('db');
        await args[3](
          Object.create(EntityManager.prototype) as EntityManager,
          event,
        );
        order.push('commit');
        return 'processed';
      },
    );
    const client = {
      commitOffsets: jest.fn(() => {
        order.push('ack');
        return Promise.resolve();
      }),
    };
    const config = handler.runConfig(client, subscription, () => {
      order.push('apply');
      return Promise.resolve();
    });
    expect(config.autoCommit).toBe(false);
    expect(config.partitionsConsumedConcurrently).toBe(1);
    await config.eachMessage!(payload());
    expect(order).toEqual(['db', 'apply', 'commit', 'ack']);
    expect(client.commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });
  it('acknowledges an inbox duplicate', async () => {
    inbox.consume.mockResolvedValue('duplicate');
    const apply = jest.fn();
    await handler.runConfig({ commitOffsets }, subscription, apply)
      .eachMessage!(payload());
    expect(apply).not.toHaveBeenCalled();
    expect(commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });
  it('passes the transaction manager to the actual callback', async () => {
    const manager = Object.create(EntityManager.prototype) as EntityManager;
    inbox.consume.mockImplementation(
      async (...args: Parameters<CommerceInboxService['consume']>) => {
        await args[3](manager, event);
        return 'processed';
      },
    );
    const apply = jest
      .fn<Promise<void>, [unknown, unknown]>()
      .mockResolvedValue(undefined);
    await handler.runConfig({ commitOffsets }, subscription, apply)
      .eachMessage!(payload());
    expect(apply).toHaveBeenCalledWith(manager, event);
  });
  it.each([
    { topic: 'other-topic' },
    { partition: -1 },
    { partition: 0.5 },
    { message: { ...payload().message, headers: {} } },
    {
      message: {
        ...payload().message,
        headers: {
          ...payload().message.headers,
          'correlation-id': Buffer.from('wrong'),
        },
      },
    },
    { message: { ...payload().message, value: null } },
    { message: { ...payload().message, key: Buffer.from('wrong') } },
    { message: { ...payload().message, offset: '4x' } },
    {
      message: {
        ...payload().message,
        headers: {
          ...payload().message.headers,
          'event-id': [Buffer.from(event.eventId)],
        },
      },
    },
    {
      message: {
        ...payload().message,
        headers: {
          ...payload().message.headers,
          'event-version': Buffer.from('2'),
        },
      },
    },
    { message: { ...payload().message, value: Buffer.from('{') } },
  ])('rejects malformed transport before DB access (%#)', async (change) => {
    await expect(
      handler.runConfig({ commitOffsets }, subscription, jest.fn())
        .eachMessage!(payload(change)),
    ).rejects.toThrow('Kafka inbox processing failed');
    expect(inbox.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });
  it('does not acknowledge when inbox processing fails', async () => {
    inbox.consume.mockRejectedValue(new Error('db unavailable'));
    await expect(
      handler.runConfig({ commitOffsets }, subscription, jest.fn())
        .eachMessage!(payload()),
    ).rejects.toThrow('Kafka inbox processing failed');
    expect(commitOffsets).not.toHaveBeenCalled();
  });
  it('propagates an offset commit failure after DB success', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));
    await expect(
      handler.runConfig({ commitOffsets }, subscription, jest.fn())
        .eachMessage!(payload()),
    ).rejects.toThrow('Kafka inbox processing failed');
    expect(inbox.consume).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid subscription configuration', () => {
    expect(() =>
      handler.runConfig(
        { commitOffsets },
        { ...subscription, consumer: '' },
        jest.fn(),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      handler.runConfig(
        { commitOffsets },
        { ...subscription, maxBytes: 0 },
        jest.fn(),
      ),
    ).toThrow(BadRequestException);
  });
  it.each(['9007199254740993', '9223372036854775806'])(
    'increments offset %s without rounding',
    async (offset) => {
      await handler.runConfig({ commitOffsets }, subscription, jest.fn())
        .eachMessage!(payload({ message: { ...payload().message, offset } }));
      expect(commitOffsets).toHaveBeenCalledWith([
        {
          topic: subscription.topic,
          partition: 0,
          offset: (BigInt(offset) + 1n).toString(),
        },
      ]);
    },
  );
  it.each(['-1', '01', '1.5', '9223372036854775807', '9'.repeat(1000)])(
    'rejects unsafe offset (%#)',
    async (offset) => {
      await expect(
        handler.runConfig({ commitOffsets }, subscription, jest.fn())
          .eachMessage!(payload({ message: { ...payload().message, offset } })),
      ).rejects.toThrow('Kafka inbox processing failed');
      expect(inbox.consume).not.toHaveBeenCalled();
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );
  it.each([1, 2])(
    'does not ack on heartbeat failure at stage %s',
    async (stage) => {
      const heartbeat = jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined);
      if (stage === 1) heartbeat.mockRejectedValueOnce(new Error('secret'));
      else
        heartbeat
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('secret'));
      await expect(
        handler.runConfig({ commitOffsets }, subscription, jest.fn())
          .eachMessage!(payload({ heartbeat })),
      ).rejects.toThrow('Kafka inbox processing failed');
      expect(commitOffsets).not.toHaveBeenCalled();
      expect(inbox.consume).toHaveBeenCalledTimes(stage - 1);
    },
  );
  it.each([
    Buffer.alloc(256 * 1024 + 1, 32),
    Buffer.from(JSON.stringify({ ...event, eventVersion: 2 })),
    // Otherwise valid JSON with one invalid UTF-8 byte in a payload string.
    Buffer.concat([
      Buffer.from(JSON.stringify(event).split('HELD')[0]),
      Buffer.from([0xff]),
      Buffer.from(JSON.stringify(event).split('HELD')[1]),
    ]),
  ])('rejects invalid bytes/size/envelope (%#)', async (value) => {
    await expect(
      handler.runConfig({ commitOffsets }, subscription, jest.fn())
        .eachMessage!(payload({ message: { ...payload().message, value } })),
    ).rejects.toThrow('Kafka inbox processing failed');
    expect(inbox.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });
  it('honors the configured byte cap and snapshots trusted configuration', async () => {
    const config = { ...subscription, maxBytes: 10 };
    const run = handler.runConfig({ commitOffsets }, config, jest.fn());
    config.maxBytes = 256 * 1024;
    await expect(run.eachMessage!(payload())).rejects.toThrow(
      'Kafka inbox processing failed',
    );
    expect(inbox.consume).not.toHaveBeenCalled();
  });
  it('sanitizes producer rejection without acknowledging', async () => {
    inbox.consume.mockRejectedValue(new Error('fixture secret and SQL'));
    const error: unknown = await handler.runConfig(
      { commitOffsets },
      subscription,
      jest.fn(),
    ).eachMessage!(payload()).catch((err: unknown) => err);
    expect(error).toEqual(new Error('Kafka inbox processing failed'));
    expect(error).not.toHaveProperty('cause');
    expect(commitOffsets).not.toHaveBeenCalled();
  });
  it('rejects an unauthorized producer in the real inbox before DB access', async () => {
    const transaction = jest.fn();
    const actual = new CommerceInboxKafkaHandler(
      new CommerceInboxService({ transaction } as unknown as DataSource),
    );
    const apply = jest.fn();
    await expect(
      actual.runConfig(
        { commitOffsets },
        { ...subscription, expectedProducer: 'other-service' },
        apply,
      ).eachMessage!(payload()),
    ).rejects.toThrow('Kafka inbox processing failed');
    expect(transaction).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });
});
