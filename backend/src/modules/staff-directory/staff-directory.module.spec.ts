import type { Repository } from 'typeorm';
import { StaffDirectoryService } from './staff-directory.module';
import type { User } from '../../database/entities/user.entity';

describe('StaffDirectoryService', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSandbox = process.env.AUTH_SANDBOX_ENABLED;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousSandbox === undefined) delete process.env.AUTH_SANDBOX_ENABLED;
    else process.env.AUTH_SANDBOX_ENABLED = previousSandbox;
  });

  function serviceWith(users: Partial<User>[]) {
    const repository = {
      find: jest.fn().mockResolvedValue(users),
    } as unknown as Repository<User>;
    return new StaffDirectoryService(repository);
  }

  it('keeps UAT managers selectable while sandbox authentication is enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SANDBOX_ENABLED = 'true';
    const service = serviceWith([
      { id: 'u1', username: 'uat.finance', fullName: 'UAT Finance Manager', role: 'FINANCE_MANAGER' },
    ]);

    await expect(service.list('actor', 'CEO')).resolves.toEqual([
      { id: 'u1', fullName: 'UAT Finance Manager', role: 'FINANCE_MANAGER', roleLabelFa: 'مدیر مالی' },
    ]);
  });

  it('still excludes temporary panel accounts outside the sandbox', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SANDBOX_ENABLED;
    const service = serviceWith([
      { id: 'u1', username: 'uat.finance', fullName: 'UAT Finance Manager', role: 'FINANCE_MANAGER' },
    ]);

    await expect(service.list('actor', 'CEO')).resolves.toEqual([]);
  });
});
