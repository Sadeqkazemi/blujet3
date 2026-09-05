import { Injectable, Logger } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import type { CanonicalEvent } from './canonical-events';

@Injectable()
export class KafkaEventPublisher {
  private readonly logger = new Logger(KafkaEventPublisher.name);
  private readonly producer: Producer | null;
  private readonly topic = process.env.KAFKA_EVENTS_TOPIC ?? 'blujet.events.v1';

  constructor() {
    if (process.env.KAFKA_EVENTS_ENABLED !== 'true') { this.producer = null; return; }
    const brokers = (process.env.KAFKA_BROKERS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    if (!brokers.length) throw new Error('KAFKA_BROKERS is required when Kafka events are enabled');
    this.producer = new Kafka({ clientId: process.env.KAFKA_CLIENT_ID ?? 'blujet-core', brokers }).producer({ idempotent: true, maxInFlightRequests: 1 });
  }

  async publish(event: CanonicalEvent): Promise<boolean> {
    if (!this.producer) return false;
    await this.producer.connect();
    await this.producer.send({ topic: this.topic, messages: [{ key: event.aggregateId, value: JSON.stringify(event) }] });
    this.logger.debug(`Published ${event.eventType} ${event.eventId}`);
    return true;
  }

  async disconnect(): Promise<void> { if (this.producer) await this.producer.disconnect(); }
}
