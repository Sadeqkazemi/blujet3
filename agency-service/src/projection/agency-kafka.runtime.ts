import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { AgencyKafkaConsumerConfig } from '../agency-kafka.config';
import { AgencyKafkaHandler } from './agency-kafka.handler';

export type AgencyKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const AGENCY_KAFKA_CONFIG = Symbol('AGENCY_KAFKA_CONFIG');
export const AGENCY_KAFKA_CLIENT = Symbol('AGENCY_KAFKA_CLIENT');

export type AgencyKafkaRuntimeStatus = {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'running' | 'failed' | 'stopped';
  processingFailures: number;
  lastProcessingFailureAt: string | null;
  lastMessageAt: string | null;
  lastProcessedAt: string | null;
};

export function createAgencyKafkaClient(
  config: AgencyKafkaConsumerConfig,
): AgencyKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class AgencyKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: AgencyKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;

  constructor(
    @Inject(AGENCY_KAFKA_CONFIG)
    private readonly config: AgencyKafkaConsumerConfig,
    @Inject(AGENCY_KAFKA_CLIENT)
    private readonly client: AgencyKafkaRuntimeClient | null,
    private readonly handler: AgencyKafkaHandler,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): AgencyKafkaRuntimeStatus {
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
            this.logger.error('Agency Kafka processing failed');
            throw new Error('Agency Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log('Agency Kafka consumer started');
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.logger.error('Agency Kafka consumer startup failed');
      throw new Error('Agency Kafka consumer startup failed');
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
      this.logger.error('Agency Kafka consumer shutdown failed');
      throw new Error('Agency Kafka consumer shutdown failed');
    }
  }
}
