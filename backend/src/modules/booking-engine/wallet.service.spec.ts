import { ServiceUnavailableException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { WalletService } from './wallet.service';

describe('WalletService production guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not mint wallet credit without a real production gateway', async () => {
    process.env.NODE_ENV = 'production';
    const save = jest.fn();
    const repo = {
      save,
      create: jest.fn(),
    } as unknown as Repository<WalletEntry>;
    const service = new WalletService(repo);

    await expect(service.topup('user-1', 1000n)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(save).not.toHaveBeenCalled();
  });
});
