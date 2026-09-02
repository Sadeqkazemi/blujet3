import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KavenegarApi } from 'kavenegar';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { decryptPii } from '../pii-crypto';
import { MockSmsProvider } from './mock-sms.provider';
import type {
  SmsMessageType,
  SmsProvider,
  SmsSendResult,
} from './sms-provider.interface';

const KAVENEGAR_SERVICE_KEY = 'ext_kavenegar';

/** Failure reason extraction for the two callback shapes the SDK produces
 * when it never reaches a real `return.status`/`return.message` pair:
 * a JSON-parse error calls back with `(e.message, 500)` (a plain string,
 * usable as-is), and a network/transport error calls back with just
 * `(JSON.stringify({ error: e.message }))` — no status/message at all. */
function extractFailureReason(
  entries: unknown,
  statusMessage: string | undefined,
): string {
  if (statusMessage) return statusMessage;
  if (typeof entries === 'string') {
    try {
      const parsed = JSON.parse(entries) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // Not JSON (the parse-error path) — the raw string is already the
      // human-readable message.
    }
    return entries;
  }
  return 'خطای ناشناخته در ارسال پیامک';
}

/** Real vendor per docs/DB_SCHEMA.md Phase 14's `ExternalServiceConfig
 * (key: "ext_kavenegar")` row — the SAME encrypted-at-rest, IT-Manager-
 * editable mechanism already used for the zarinpal/amadeus/neshan rows
 * (Phase 28's services tab), not a server env var. IT_MANAGER sets/
 * rotates the key live from the panel; no server access or restart
 * needed. Falls back to MockSmsProvider (log-only, always success)
 * whenever the row is disabled or has no key configured — the same
 * "vendor not connected yet" graceful-degradation posture already used
 * for the AI summary/ML pricing providers.
 *
 * Sends through the official `kavenegar` SDK (https://github.com/kavenegar/
 * kavenegar-node) rather than a hand-rolled REST call, so the request
 * shape (path, host, POST body) always matches the vendor's own contract.
 * The SDK is callback-based; `send()` wraps it in a Promise. */
@Injectable()
export class KavenegarSmsProvider implements SmsProvider {
  private readonly logger = new Logger(KavenegarSmsProvider.name);

  constructor(
    @InjectRepository(ExternalServiceConfig)
    private readonly configRepo: Repository<ExternalServiceConfig>,
    private readonly mock: MockSmsProvider,
  ) {}

  async send(
    phone: string,
    message: string,
    messageType: SmsMessageType,
  ): Promise<SmsSendResult> {
    const config = await this.configRepo.findOneBy({
      key: KAVENEGAR_SERVICE_KEY,
    });
    if (!config?.enabled || !config.apiKeyEncrypted) {
      if (process.env.NODE_ENV === 'production') {
        const failureReason =
          'Kavenegar is disabled or missing an API key in ExternalServiceConfig.';
        this.logger.error(failureReason);
        return { success: false, failureReason };
      }
      return this.mock.send(phone, message, messageType);
    }

    const apiKey = decryptPii(config.apiKeyEncrypted);
    const api = KavenegarApi({ apikey: apiKey });
    const senderLine = process.env.KAVENEGAR_SENDER_LINE || undefined;

    return new Promise((resolve) => {
      api.Send(
        { receptor: phone, message, sender: senderLine },
        (entries: unknown, status: number, statusMessage: string) => {
          if (status === 200) {
            resolve({ success: true });
            return;
          }
          const failureReason =
            extractFailureReason(entries, statusMessage) ||
            `کاوه‌نگار خطای ${status} برگرداند.`;
          this.logger.warn(
            `SMS (${messageType}) to ${phone} failed: ${failureReason}`,
          );
          resolve({ success: false, failureReason });
        },
      );
    });
  }
}
