import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { LoyaltyKafkaConsumerConfig } from '../loyalty-kafka.config';
import { LoyaltyKafkaHandler } from './loyalty-kafka.handler';

export type LoyaltyKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const LOYALTY_KAFKA_CONFIG = Symbol('LOYALTY_KAFKA_CONFIG');
export const LOYALTY_KAFKA_CLIENT = Symbol('LOYALTY_KAFKA_CLIENT');

export type LoyaltyKafkaRuntimeStatus = {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'running' | 'failed' | 'stopped';
  processingFailures: number;
  lastProcessingFailureAt: string | null;
  lastMessageAt: string | null;
  lastProcessedAt: string | null;
};

export function createLoyaltyKafkaClient(
  config: LoyaltyKafkaConsumerConfig,
): LoyaltyKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class LoyaltyKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: LoyaltyKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;

  constructor(
    @Inject(LOYALTY_KAFKA_CONFIG)
    private readonly config: LoyaltyKafkaConsumerConfig,
    @Inject(LOYALTY_KAFKA_CLIENT)
    private readonly client: LoyaltyKafkaRuntimeClient | null,
    private readonly handler: LoyaltyKafkaHandler,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): LoyaltyKafkaRuntimeStatus {
    return {
      enabled: this.config.enabled,
      state: this.state,
      processingFailures: this.processingFailures,
      lastProcessingFailureAt: this.lastProcessingFailureAt,
      lastMessageAt: this.lastMessageAt,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  isReady(): boolean {
    return !this.config.enabled || (this.started && !this.stopped);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled || !this.client || this.started) return;
    this.state = 'starting';
    try {
      await this.client.connect();
      await this.client.subscribe({
        topic: this.config.topic,
        fromBeginning: this.config.fromBeginning,
      });
      const runConfig = this.handler.runConfig(this.client, {
        topic: this.config.topic,
        maxBytes: this.config.maxBytes,
        requireSchemaId: this.config.requireSchemaId,
      });
      const eachMessage = runConfig.eachMessage;
      if (eachMessage) {
        runConfig.eachMessage = async (payload) => {
          this.lastMessageAt = new Date().toISOString();
          try {
            await eachMessage(payload);
            this.lastProcessedAt = new Date().toISOString();
          } catch {
            this.processingFailures += 1;
            this.lastProcessingFailureAt = new Date().toISOString();
            this.logger.error('Loyalty Kafka processing failed');
            throw new Error('Loyalty Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log('Loyalty Kafka consumer started');
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.logger.error('Loyalty Kafka consumer startup failed');
      throw new Error('Loyalty Kafka consumer startup failed');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client || this.stopped) return;
    this.stopped = true;
    this.state = 'stopped';
    let failed = false;
    if (this.started) {
      try {
        await this.client.stop();
      } catch {
        failed = true;
      }
    }
    try {
      await this.client.disconnect();
    } catch {
      failed = true;
    }
    if (failed) {
      this.logger.error('Loyalty Kafka consumer shutdown failed');
      throw new Error('Loyalty Kafka consumer shutdown failed');
    }
  }
}
