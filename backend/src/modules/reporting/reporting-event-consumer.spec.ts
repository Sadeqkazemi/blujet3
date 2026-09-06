import { BadRequestException } from '@nestjs/common';
import {
  createItineraryOrderCreated,
  type CoreItineraryEvent,
} from '../../common/events/core-itinerary-events';
import { ReportingEventConsumer } from './reporting-event-consumer';

const event = () =>
  createItineraryOrderCreated(
    {
      id: 'order-1',
      version: 3,
      status: 'HELD',
      channel: 'SYSTEM',
      currency: 'IRR',
      fareIrr: 100n,
      taxIrr: 20n,
      extrasIrr: 0n,
      totalIrr: 120n,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      holdExpiresAt: new Date('2026-09-06T00:15:00.000Z'),
    },
    {
      auditId: 'audit-1',
      correlationId: 'request-1',
      idempotencyKey: 'event-1',
    },
  );

describe('ReportingEventConsumer', () => {
  it('validates and forwards a detached typed event to the read-model sink', async () => {
    const project = jest.fn<Promise<'applied'>, [CoreItineraryEvent]>();
    project.mockResolvedValue('applied');
    const consumer = new ReportingEventConsumer({ project });
    const input = event();
    await expect(consumer.consume(input)).resolves.toBe('applied');
    input.payload.totalIrr = '0';
    expect(project).toHaveBeenCalledTimes(1);
    expect(project.mock.calls[0][0].payload.totalIrr).toBe('120');
  });

  it('rejects malformed events before touching the read model', async () => {
    const project = jest.fn<Promise<'applied'>, [CoreItineraryEvent]>();
    const consumer = new ReportingEventConsumer({ project });
    await expect(
      consumer.consume({ ...event(), payload: { totalIrr: '120' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(project).not.toHaveBeenCalled();
  });

  it('does not swallow projection failures', async () => {
    const failure = new Error('projection unavailable');
    const project = jest.fn<Promise<'applied'>, [CoreItineraryEvent]>();
    project.mockRejectedValue(failure);
    const consumer = new ReportingEventConsumer({ project });
    await expect(consumer.consume(event())).rejects.toBe(failure);
  });
});
