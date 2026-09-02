import { generateOtpCode } from './generate-otp-code';

describe('generateOtpCode', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'development' };
    delete process.env.DEV_FIXED_OTP_CODE;
    delete process.env.AUTH_SANDBOX_ENABLED;
    delete process.env.AUTH_SANDBOX_OTP;
  });

  afterAll(() => {
    process.env = env;
  });

  it('returns fixed 123456 in non-production by default', () => {
    expect(generateOtpCode()).toBe('123456');
  });

  it('honours DEV_FIXED_OTP_CODE override in development', () => {
    process.env.DEV_FIXED_OTP_CODE = '654321';
    expect(generateOtpCode()).toBe('654321');
  });

  it('uses random codes in production', () => {
    process.env.NODE_ENV = 'production';
    const a = generateOtpCode();
    const b = generateOtpCode();
    expect(a).toMatch(/^\d{6}$/);
    expect(b).toMatch(/^\d{6}$/);
  });

  it('uses 123456 in an explicitly enabled production-mode sandbox', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    expect(generateOtpCode()).toBe('123456');
  });
});
