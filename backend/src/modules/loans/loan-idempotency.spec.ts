import { bankScopedIdempotencyKey } from './loan-idempotency';

describe('bankScopedIdempotencyKey', () => {
  it('namespaces by user so identical client keys diverge', () => {
    const a = bankScopedIdempotencyKey('user-a', 'same-key');
    const b = bankScopedIdempotencyKey('user-b', 'same-key');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
    expect(bankScopedIdempotencyKey('user-a', 'same-key')).toBe(a);
  });
});
