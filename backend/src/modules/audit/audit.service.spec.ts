import type { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('serializes nested bigint metadata before writing jsonb', async () => {
    const save = jest.fn((entry: AuditLog) => Promise.resolve(entry));
    const create = jest.fn((entry: Partial<AuditLog>) => entry as AuditLog);
    const service = new AuditService({
      save,
      create,
    } as unknown as Repository<AuditLog>);

    await service.record({
      actorId: 'finance-1',
      actorRole: 'FINANCE_MANAGER',
      category: 'FINANCE',
      action: 'financial event',
      detail: 'financial event with bigint values',
      metadata: {
        priceIrr: 252_100_000n,
        nested: { refundableIrr: 50_000_000n },
        amounts: [1n, 2n],
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          priceIrr: '252100000',
          nested: { refundableIrr: '50000000' },
          amounts: ['1', '2'],
        },
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });
});
