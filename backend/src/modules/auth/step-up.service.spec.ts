import type { Repository } from 'typeorm';
import type { User } from '../../database/entities/user.entity';
import type { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import type { AuditService } from '../audit/audit.service';
import type { TwoFactorProvider } from './providers/two-factor-provider.interface';
import { StepUpService } from './step-up.service';

describe('StepUpService sandbox OTP', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSandbox = process.env.AUTH_SANDBOX_ENABLED;
  const previousOtp = process.env.AUTH_SANDBOX_OTP;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.AUTH_SANDBOX_ENABLED = previousSandbox;
    process.env.AUTH_SANDBOX_OTP = previousOtp;
  });

  it('uses and consumes the configured fixed code only in an explicit hosted sandbox', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    process.env.AUTH_SANDBOX_OTP = '654321';

    const user = {
      id: 'finance-user',
      fullName: 'UAT Finance',
      phone: null,
    } as User;
    let stored: TwoFactorChallenge | null = null;
    let deliveredCode: string | null = null;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
    } as unknown as Repository<User>;
    const challengeRepo = {
      create: jest.fn(
        (value: Partial<TwoFactorChallenge>): TwoFactorChallenge =>
          ({
            id: 'challenge-1',
            attempts: 0,
            consumedAt: null,
            ...value,
          }) as TwoFactorChallenge,
      ),
      save: jest.fn((value: TwoFactorChallenge) => {
        stored = value;
        return Promise.resolve(stored);
      }),
      findOneBy: jest.fn(() => Promise.resolve(stored)),
      update: jest.fn((_where, value: Partial<TwoFactorChallenge>) => {
        Object.assign(stored!, value);
        return Promise.resolve({ affected: 1, generatedMaps: [], raw: [] });
      }),
      increment: jest.fn(),
    } as unknown as Repository<TwoFactorChallenge>;
    const auditRecord = jest.fn();
    const audit = { record: auditRecord } as unknown as AuditService;
    const provider = {
      sendCode: jest.fn((_user, code: string) => {
        deliveredCode = code;
        return Promise.resolve();
      }),
    } as unknown as TwoFactorProvider;
    const service = new StepUpService(userRepo, challengeRepo, audit, provider);

    const challenge = await service.request(
      {
        id: user.id,
        role: 'FINANCE_MANAGER',
        fullName: user.fullName,
      },
      'REFUND_PAYOUT',
    );

    expect(deliveredCode).toBe('654321');
    await service.verify(
      {
        id: user.id,
        role: 'FINANCE_MANAGER',
        fullName: user.fullName,
      },
      challenge.challengeId,
      '654321',
      'REFUND_PAYOUT',
    );
    expect(stored?.consumedAt).toBeInstanceOf(Date);
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });
});
