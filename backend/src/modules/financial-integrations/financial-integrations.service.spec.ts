import { UnprocessableEntityException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import type { AuditService } from '../audit/audit.service';
import {
  FinancialIntegrationsService,
  FinancialProvider,
} from './financial-integrations.service';

describe('FinancialIntegrationsService', () => {
  const repo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
    findOneBy: jest.fn(),
  } as unknown as Repository<ExternalServiceConfig>;
  const service = new FinancialIntegrationsService(
    repo,
    {} as DataSource,
    { record: jest.fn() } as unknown as AuditService,
  );

  afterEach(() => {
    delete process.env.FINANCE_HOLO_VERIFY_URL;
    delete process.env.FINANCE_HOLO_SYNC_URL;
  });

  it('returns the full provider catalog with no fabricated connections', async () => {
    const result = await service.list();
    expect(result.connectedCount).toBe(0);
    expect(result.providers).toHaveLength(5);
    expect(
      result.providers.every((provider) => provider.connected === false),
    ).toBe(true);
  });

  it('fails closed when a real provider verification endpoint is not configured', async () => {
    await expect(
      service.connect(
        { id: 'u1', role: 'FINANCE_MANAGER', fullName: 'مدیر مالی' },
        FinancialProvider.HOLO,
        'real-secret-key',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
