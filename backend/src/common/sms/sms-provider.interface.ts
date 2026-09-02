export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export type SmsMessageType =
  | 'OTP'
  | 'TEMP_PASSWORD'
  | 'SURVEY_INVITE'
  | 'FLIGHT_CANCELLED';

export interface SmsSendResult {
  success: boolean;
  failureReason?: string;
}

/** Vendor-swappable SMS dispatch — CLAUDE.md: behind an interface, mock
 * provider in dev/tests. Never called directly by callers; always through
 * SmsService, which also writes the real send log. */
export interface SmsProvider {
  send(
    phone: string,
    message: string,
    messageType: SmsMessageType,
  ): Promise<SmsSendResult>;
}
