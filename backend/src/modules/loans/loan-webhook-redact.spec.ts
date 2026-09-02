import { redactWebhookPayload } from './loan-webhook-redact';

describe('redactWebhookPayload', () => {
  it('redacts secrets and keeps safe scalars', () => {
    const out = redactWebhookPayload({
      eventId: 'e1',
      status: 'DISBURSED',
      token: 'super-secret',
      apiKey: 'k',
      nested: { a: 1 },
    }) as Record<string, unknown>;
    expect(out.eventId).toBe('e1');
    expect(out.status).toBe('DISBURSED');
    expect(out.token).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.nested).toBe('[OMITTED_OBJECT]');
  });
});
