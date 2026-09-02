import { Repository } from 'typeorm';
import * as kavenegar from 'kavenegar';
import { KavenegarSmsProvider } from './kavenegar-sms.provider';
import { MockSmsProvider } from './mock-sms.provider';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { encryptPii } from '../pii-crypto';

jest.mock('kavenegar');

describe('KavenegarSmsProvider (unit)', () => {
  const originalSender = process.env.KAVENEGAR_SENDER_LINE;
  const originalNodeEnv = process.env.NODE_ENV;
  const kavenegarApiMock = kavenegar.KavenegarApi as jest.Mock;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterEach(() => {
    process.env.KAVENEGAR_SENDER_LINE = originalSender;
    process.env.NODE_ENV = originalNodeEnv;
    kavenegarApiMock.mockReset();
  });

  it('fails closed in production when Kavenegar is not configured', async () => {
    process.env.NODE_ENV = 'production';
    const mock = new MockSmsProvider();
    const mockSend = jest.spyOn(mock, 'send');
    const provider = new KavenegarSmsProvider(makeConfigRepo(null), mock);

    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('Kavenegar');
    expect(mockSend).not.toHaveBeenCalled();
  });

  function makeConfigRepo(config: unknown) {
    return {
      findOneBy: jest.fn().mockResolvedValue(config),
    } as unknown as Repository<ExternalServiceConfig>;
  }

  it('falls back to the mock provider when no ExternalServiceConfig row exists (never a real API call)', async () => {
    const mock = new MockSmsProvider();
    const mockSend = jest.spyOn(mock, 'send');

    const provider = new KavenegarSmsProvider(makeConfigRepo(null), mock);
    const result = await provider.send('09121234567', 'کد شما: 1234', 'OTP');

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledWith('09121234567', 'کد شما: 1234', 'OTP');
    expect(kavenegarApiMock).not.toHaveBeenCalled();
  });

  it('falls back to the mock provider when the IT panel row is disabled', async () => {
    const mock = new MockSmsProvider();

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({
        enabled: false,
        apiKeyEncrypted: encryptPii('real-key'),
      }),
      mock,
    );
    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result).toEqual({ success: true });
    expect(kavenegarApiMock).not.toHaveBeenCalled();
  });

  it('falls back to the mock provider when the row is enabled but has no key configured yet', async () => {
    const mock = new MockSmsProvider();

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({ enabled: true, apiKeyEncrypted: null }),
      mock,
    );
    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result).toEqual({ success: true });
    expect(kavenegarApiMock).not.toHaveBeenCalled();
  });

  it('sends via the official Kavenegar SDK using the decrypted IT-panel key, and reports success on status 200', async () => {
    process.env.KAVENEGAR_SENDER_LINE = '10008663';
    const sendMock = jest.fn(
      (
        _params: unknown,
        callback: (entries: unknown, status: number, message: string) => void,
      ) => {
        callback([], 200, 'تایید شد');
      },
    );
    kavenegarApiMock.mockReturnValue({ Send: sendMock });

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({
        enabled: true,
        apiKeyEncrypted: encryptPii('real-kavenegar-key'),
      }),
      new MockSmsProvider(),
    );
    const result = await provider.send('09121234567', 'کد شما: 1234', 'OTP');

    expect(result).toEqual({ success: true });
    expect(kavenegarApiMock).toHaveBeenCalledWith({
      apikey: 'real-kavenegar-key',
    });
    expect(sendMock).toHaveBeenCalledWith(
      { receptor: '09121234567', message: 'کد شما: 1234', sender: '10008663' },
      expect.any(Function),
    );
  });

  it('reports a real failure (never fabricated) when Kavenegar returns a non-200 status', async () => {
    const sendMock = jest.fn(
      (
        _params: unknown,
        callback: (entries: unknown, status: number, message: string) => void,
      ) => {
        callback(undefined, 412, 'اعتبار حساب کافی نیست');
      },
    );
    kavenegarApiMock.mockReturnValue({ Send: sendMock });

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({
        enabled: true,
        apiKeyEncrypted: encryptPii('real-key'),
      }),
      new MockSmsProvider(),
    );
    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('اعتبار حساب کافی نیست');
  });

  it('reports a network-error callback (single-argument, per the SDK) as a failure instead of throwing', async () => {
    const sendMock = jest.fn(
      (
        _params: unknown,
        callback: (entries: unknown, status: number, message: string) => void,
      ) => {
        callback(
          JSON.stringify({ error: 'network unreachable' }),
          undefined as unknown as number,
          undefined as unknown as string,
        );
      },
    );
    kavenegarApiMock.mockReturnValue({ Send: sendMock });

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({
        enabled: true,
        apiKeyEncrypted: encryptPii('real-key'),
      }),
      new MockSmsProvider(),
    );
    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('network unreachable');
  });

  it('reports a JSON-parse-error callback (plain message, status 500, per the SDK) as a failure', async () => {
    const sendMock = jest.fn(
      (
        _params: unknown,
        callback: (entries: unknown, status: number, message: string) => void,
      ) => {
        callback(
          'Unexpected token in JSON',
          500,
          undefined as unknown as string,
        );
      },
    );
    kavenegarApiMock.mockReturnValue({ Send: sendMock });

    const provider = new KavenegarSmsProvider(
      makeConfigRepo({
        enabled: true,
        apiKeyEncrypted: encryptPii('real-key'),
      }),
      new MockSmsProvider(),
    );
    const result = await provider.send('09121234567', 'پیام', 'OTP');

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('Unexpected token in JSON');
  });
});
