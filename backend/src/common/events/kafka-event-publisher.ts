import { Injectable } from '@nestjs/common';
import { Kafka, logLevel, type Producer } from 'kafkajs';
import { kafkaEventsConfig } from '../../config/kafka-events.config';
import { isCanonicalEvent, type CanonicalEvent } from './canonical-events';

@Injectable()
export class KafkaEventPublisher {
  private readonly config = kafkaEventsConfig();
  private readonly producer: Producer | null;
  private connection?: Promise<void>;
  private stopping = false;
  private readonly pending = new Set<Promise<boolean>>();

  constructor() {
    this.producer = this.config.enabled
      ? new Kafka({
          ...this.config.client,
          logLevel: logLevel.NOTHING,
        }).producer({
          idempotent: true,
          maxInFlightRequests: 1,
          allowAutoTopicCreation: false,
          retry: { retries: 0 },
        })
      : null;
  }

  enabled(): boolean {
    return this.config.enabled && !this.stopping;
  }

  async publish(event: CanonicalEvent): Promise<boolean> {
    if (this.stopping) throw new Error('Kafka publisher is stopping');
    if (!this.producer || !this.config.enabled) return false;
    if (!isCanonicalEvent(event)) throw new Error('Invalid canonical event');
    const value = JSON.stringify(event);
    if (Buffer.byteLength(value, 'utf8') > 256 * 1024)
      throw new Error('Canonical event exceeds limit');
    const task = this.send(event, value);
    this.pending.add(task);
    try {
      return await task;
    } finally {
      this.pending.delete(task);
    }
  }

  private async send(event: CanonicalEvent, value: string): Promise<boolean> {
    if (!this.producer || !this.config.enabled) return false;
    this.connection ??= this.producer.connect().catch(() => {
      this.connection = undefined;
      throw new Error('Kafka connection failed');
    });
    try {
      await this.connection;
      await this.producer.send({
        topic: this.config.topic,
        acks: -1,
        timeout: 10000,
        messages: [
          {
            key: `${event.producer}:${event.aggregateType}:${event.aggregateId}`,
            value,
            headers: {
              'event-id': event.eventId,
              'correlation-id': event.correlationId,
              'event-version': '1',
            },
          },
        ],
      });
    } catch {
      // Raw Kafka errors can contain broker details or credentials.
      throw new Error('Kafka delivery failed');
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
    try {
      if (this.producer) await this.producer.disconnect();
    } catch {
      throw new Error('Kafka disconnect failed');
    }
  }
}
