import { MockNiraProvider } from './mock-nira.provider';

describe('MockNiraProvider production guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('never reports a fabricated successful submission in production', async () => {
    process.env.NODE_ENV = 'production';
    const provider = new MockNiraProvider();

    await expect(
      provider.submitManifest('BJ-100', new Date('2026-08-05T00:00:00Z'), []),
    ).resolves.toEqual({ success: false });
  });
});
