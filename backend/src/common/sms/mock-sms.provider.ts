import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsMessageType,
  SmsProvider,
  SmsSendResult,
} from './sms-provider.interface';

/** Dev/test provider — logs the message instead of sending a real SMS.
 * Never used in production. Always reports success; never fabricates a
 * failure rate (see docs/DB_SCHEMA.md Phase 14). */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  send(
    phone: string,
    message: string,
    messageType: SmsMessageType,
  ): Promise<SmsSendResult> {
    this.logger.log(`SMS (${messageType}) to ${phone}: ${message}`);
    return Promise.resolve({ success: true });
  }
}
