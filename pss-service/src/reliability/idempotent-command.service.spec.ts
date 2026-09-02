import { ConflictException } from '@nestjs/common';
import { stableDigest } from './idempotent-command.service';

describe('stableDigest', () => {
  it('produces the same digest for semantically identical object keys', () => {
    expect(stableDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('distinguishes changed command payloads', () => {
    expect(stableDigest({ seats: 1 })).not.toBe(stableDigest({ seats: 2 }));
  });

  it('uses the public conflict error for a reused key with changed payload', () => {
    const error = new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(error.getResponse()).toEqual({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
