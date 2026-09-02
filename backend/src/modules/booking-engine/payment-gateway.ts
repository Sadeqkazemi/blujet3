import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Irr } from '../../common/money';

/**
 * Shetab/IPG abstraction (CLAUDE.md Financial Rules): request → redirect →
 * verify → reverse. Card data never touches our servers — a real driver
 * only ever exchanges an authority token and a verification handshake with
 * the PSP. The sandbox driver approves synchronously so dev/tests can run
 * the full HELD→PAID→TICKETED path without a PSP contract.
 */
export interface GatewayRequestResult {
  authority: string;
  /** Real drivers return the PSP redirect URL; sandbox has none. */
  redirectUrl: string | null;
}

export interface GatewayVerifyResult {
  ok: boolean;
  refId: string;
}

export interface PaymentGateway {
  request(amountIrr: Irr, bookingId: string): Promise<GatewayRequestResult>;
  verify(authority: string, amountIrr: Irr): Promise<GatewayVerifyResult>;
  reverse(refId: string): Promise<void>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

@Injectable()
export class UnavailablePaymentGateway implements PaymentGateway {
  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'PAYMENT_GATEWAY_UNAVAILABLE',
      message:
        'درگاه پرداخت واقعی هنوز پیکربندی نشده است؛ هیچ مبلغی کسر نشده است.',
    });
  }

  request(): Promise<GatewayRequestResult> {
    return Promise.reject(this.unavailable());
  }

  verify(): Promise<GatewayVerifyResult> {
    return Promise.reject(this.unavailable());
  }

  reverse(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
}

@Injectable()
export class SandboxPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(SandboxPaymentGateway.name);

  request(amountIrr: Irr, bookingId: string): Promise<GatewayRequestResult> {
    const authority = `SBX-${randomUUID()}`;
    this.logger.log(
      `sandbox gateway request: booking=${bookingId} amountIrr=${amountIrr} authority=${authority}`,
    );
    return Promise.resolve({ authority, redirectUrl: null });
  }

  verify(authority: string, amountIrr: Irr): Promise<GatewayVerifyResult> {
    this.logger.log(
      `sandbox gateway verify: authority=${authority} amountIrr=${amountIrr}`,
    );
    return Promise.resolve({
      ok: true,
      refId: authority.replace('SBX-', 'SBXREF-'),
    });
  }

  reverse(refId: string): Promise<void> {
    this.logger.log(`sandbox gateway reverse: refId=${refId}`);
    return Promise.resolve();
  }
}
