import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { ReportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import { ReportingKafkaHandler } from './reporting-kafka.handler';

export type ReportingKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const REPORTING_KAFKA_CONFIG = Symbol('REPORTING_KAFKA_CONFIG');
export const REPORTING_KAFKA_CLIENT = Symbol('REPORTING_KAFKA_CLIENT');

export type ReportingKafkaRuntimeStatus = {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'running' | 'failed' | 'stopped';
  processingFailures: number;
  lastProcessingFailureAt: string | null;
  lastMessageAt: string | null;
  lastProcessedAt: string | null;
};

export function createReportingKafkaClient(
  config: ReportingKafkaConsumerConfig,
): ReportingKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class ReportingKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: ReportingKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;

  constructor(
    @Inject(REPORTING_KAFKA_CONFIG)
    private readonly config: ReportingKafkaConsumerConfig,
    @Inject(REPORTING_KAFKA_CLIENT)
    private readonly client: ReportingKafkaRuntimeClient | null,
    private readonly handler: ReportingKafkaHandler,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): ReportingKafkaRuntimeStatus {
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
      });
      const eachMessage = runConfig.eachMessage;
      if (eachMessage) {
        runConfig.eachMessage = async (payload) => {
          this.lastMessageAt = new Date().toISOString();
          try {
            await eachMessage(payload);
            this.lastProcessedAt = new Date().toISOString();
          } catch {
            // Kafka logging is disabled; report failure without broker/PII data.
            this.processingFailures += 1;
            this.lastProcessingFailureAt = new Date().toISOString();
            this.logger.error('Reporting Kafka processing failed');
            throw new Error('Reporting Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log(
        { groupId: this.config.consumer.groupId },
        'Reporting Kafka consumer started',
      );
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.logger.error('Reporting Kafka consumer startup failed');
      throw new Error('Reporting Kafka consumer startup failed');
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
      this.logger.error('Reporting Kafka consumer shutdown failed');
      throw new Error('Reporting Kafka consumer shutdown failed');
    }
  }
}
