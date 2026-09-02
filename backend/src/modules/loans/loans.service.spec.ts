import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoansService } from './loans.service';

describe('LoansService webhook signature', () => {
  it('accepts a valid HMAC and rejects a bad one', () => {
    const secret = 'test-webhook-secret';
    const svc = new LoansService(
      {} as never,
      {
        get: (k: string) => (k === 'BANK_LOAN_WEBHOOK_SECRET' ? secret : ''),
      } as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const raw = Buffer.from('{"eventId":"e1"}');
    const sig = createHmac('sha256', secret).update(raw).digest('hex');
    expect(() => svc.verifyWebhookSignature(raw, sig)).not.toThrow();
    expect(() => svc.verifyWebhookSignature(raw, 'deadbeef')).toThrow(
      UnauthorizedException,
    );
  });
});
