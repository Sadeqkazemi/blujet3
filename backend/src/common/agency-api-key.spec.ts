import { hashAgencyApiKey } from './agency-api-key';

describe('hashAgencyApiKey', () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  it('creates a stable, non-reversible lookup token', () => {
    const first = hashAgencyApiKey('bjk_example');
    const second = hashAgencyApiKey('bjk_example');

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain('bjk_example');
  });

  it('changes when either the raw key or server pepper changes', () => {
    const first = hashAgencyApiKey('bjk_first');
    expect(hashAgencyApiKey('bjk_second')).not.toBe(first);

    process.env.PII_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(hashAgencyApiKey('bjk_first')).not.toBe(first);
  });

  it('fails closed without a valid server pepper', () => {
    process.env.PII_ENCRYPTION_KEY = 'invalid';
    expect(() => hashAgencyApiKey('bjk_example')).toThrow(
      'PII_ENCRYPTION_KEY must be 32 bytes of hex',
    );
  });
});
