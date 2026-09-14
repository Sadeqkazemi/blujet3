import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import type { OpsAdminKafkaConsumerConfig } from '../../config/ops-admin-kafka-consumer.config';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';

export type OpsAdminKafkaRuntimeClient = Pick<
  Consumer,
  'connect' | 'subscribe' | 'run' | 'stop' | 'disconnect' | 'commitOffsets'
>;

export const OPS_ADMIN_KAFKA_CONFIG = Symbol('OPS_ADMIN_KAFKA_CONFIG');
export const OPS_ADMIN_KAFKA_CLIENT = Symbol('OPS_ADMIN_KAFKA_CLIENT');

export type OpsAdminKafkaRuntimeStatus = {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'running' | 'failed' | 'stopped';
  processingFailures: number;
  lastProcessingFailureAt: string | null;
  lastMessageAt: string | null;
  lastProcessedAt: string | null;
};

export function createOpsAdminKafkaClient(
  config: OpsAdminKafkaConsumerConfig,
): OpsAdminKafkaRuntimeClient | null {
  if (!config.enabled) return null;
  return new Kafka({
    ...config.client,
    logLevel: logLevel.NOTHING,
  }).consumer(config.consumer);
}

@Injectable()
export class OpsAdminKafkaRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private started = false;
  private stopped = false;
  private state: OpsAdminKafkaRuntimeStatus['state'];
  private processingFailures = 0;
  private lastProcessingFailureAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastProcessedAt: string | null = null;

  constructor(
    @Inject(OPS_ADMIN_KAFKA_CONFIG)
    private readonly config: OpsAdminKafkaConsumerConfig,
    @Inject(OPS_ADMIN_KAFKA_CLIENT)
    private readonly client: OpsAdminKafkaRuntimeClient | null,
    private readonly handler: OpsAdminKafkaHandler,
    private readonly logger: Logger,
  ) {
    this.state = config.enabled ? 'stopped' : 'disabled';
  }

  getStatus(): OpsAdminKafkaRuntimeStatus {
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
    return !this.config.enabled || this.state === 'running';
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
            this.state = 'failed';
            this.logger.error('Ops/Admin Kafka processing failed');
            throw new Error('Ops/Admin Kafka processing failed');
          }
        };
      }
      await this.client.run(runConfig);
      this.started = true;
      this.state = 'running';
      this.logger.log('Ops/Admin Kafka consumer started');
    } catch {
      this.state = 'failed';
      await this.client.disconnect().catch(() => undefined);
      this.stopped = true;
      this.logger.error('Ops/Admin Kafka consumer startup failed');
      throw new Error('Ops/Admin Kafka consumer startup failed');
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
      this.logger.error('Ops/Admin Kafka consumer shutdown failed');
      throw new Error('Ops/Admin Kafka consumer shutdown failed');
    }
  }
}
