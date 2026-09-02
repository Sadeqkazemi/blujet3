import { ServiceUnavailableException } from '@nestjs/common';
import type { SmsService } from '../../sms/sms.service';
import { MockTwoFactorProvider } from './mock-two-factor.provider';

describe('MockTwoFactorProvider production guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.AUTH_SANDBOX_ENABLED;
  });

  it('does not retain an OTP and rejects failed real delivery in production', async () => {
    process.env.NODE_ENV = 'production';
    const sms = {
      send: jest.fn().mockResolvedValue({ success: false }),
    } as unknown as SmsService;
    const provider = new MockTwoFactorProvider(sms);

    await expect(
      provider.sendCode(
        { id: 'user-1', fullName: 'Real User', phone: '09121234567' },
        '123456',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(provider.getLastCode('user-1')).toBeUndefined();
  });

  it('keeps the mock challenge usable when SMS fails in an explicit sandbox', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const sms = {
      send: jest.fn().mockResolvedValue({ success: false }),
    } as unknown as SmsService;
    const provider = new MockTwoFactorProvider(sms);

    await expect(
      provider.sendCode(
        { id: 'user-1', fullName: 'Sandbox User', phone: '09121234567' },
        '123456',
      ),
    ).resolves.toBeUndefined();
  });
});
