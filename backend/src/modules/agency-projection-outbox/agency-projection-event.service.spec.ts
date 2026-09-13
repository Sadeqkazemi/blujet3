import { ConflictException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import type { AgencyProjectionEvent } from '../../common/events/agency-events';
import type { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import type { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import type { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyProjectionAudit } from '../../database/entities/agency-projection-audit.entity';
import {
  AgencyCreditRequestStatus,
  AgencyInvoiceStatus,
  AgencyTier,
} from '../../database/enums';
import { AgencyProjectionEventService } from './agency-projection-event.service';

const at = new Date('2030-01-01T00:00:00.000Z');

const profile = {
  userId: 'agency-1',
  version: 2,
  licenseNo: 'LICENSE-1',
  managerName: 'مدیر نمونه',
  phone: '09121234567',
  email: '',
  city: '',
  address: '',
  tier: AgencyTier.NORMAL,
  suspendedAt: null,
  suspendReason: null,
  joinedAt: at,
} as AgencyProfile;

const invoice = {
  id: 'invoice-1',
  version: 3,
  agencyId: profile.userId,
  bookingId: null,
  invoiceNo: 'INV-1',
  issuedById: 'staff-1',
  issuedAt: at,
  dueAt: new Date('2030-01-08T00:00:00.000Z'),
  amountIrr: 12_500_000n,
  descriptionFa: '',
  status: AgencyInvoiceStatus.PAID,
  paidAt: at,
} as AgencyInvoice;

const creditRequest = {
  id: 'credit-1',
  version: 4,
  agencyId: profile.userId,
  requestedLimitIrr: 20_000_000n,
  note: '',
  status: AgencyCreditRequestStatus.PENDING,
  decidedById: null,
  decidedAt: null,
  createdAt: at,
} as AgencyCreditRequest;

function setup(existing: AgencyProjectionAudit | null = null) {
  const findOneBy = jest
    .fn<Promise<AgencyProjectionAudit | null>, [object]>()
    .mockResolvedValue(existing);
  const insert = jest.fn<Promise<object>, [object]>().mockResolvedValue({});
  const audits = {
    findOneBy,
    insert,
  } as unknown as Repository<AgencyProjectionAudit>;
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue(audits),
  } as unknown as EntityManager;
  const enqueueAgency = jest
    .fn<Promise<{ eventId: string }>, [EntityManager, AgencyProjectionEvent]>()
    .mockResolvedValue({ eventId: 'event-1' });
  const service = new AgencyProjectionEventService({
    enqueueAgency,
  } as never);
  return { service, manager, insert, enqueueAgency };
}

describe('AgencyProjectionEventService', () => {
  it('reloads every source snapshot with its hidden database version', async () => {
    const { service, manager, enqueueAgency } = setup();
    const profileBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(profile),
    };
    const invoiceBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(invoice),
    };
    const creditBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(creditRequest),
    };
    const createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(profileBuilder)
      .mockReturnValueOnce(invoiceBuilder)
      .mockReturnValueOnce(creditBuilder);
    Object.assign(manager, { createQueryBuilder });

    await service.recordProfileById(manager, profile.userId, 'SUSPENDED');
    await service.recordInvoiceById(manager, invoice.id, 'PAID');
    await service.recordCreditRequestById(manager, creditRequest.id, 'CREATED');

    expect(profileBuilder.addSelect).toHaveBeenCalledWith('profile.version');
    expect(profileBuilder.where).toHaveBeenCalledWith('profile.userId = :id', {
      id: profile.userId,
    });
    expect(invoiceBuilder.addSelect).toHaveBeenCalledWith('invoice.version');
    expect(creditBuilder.addSelect).toHaveBeenCalledWith(
      'creditRequest.version',
    );
    expect(enqueueAgency.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        aggregateType: 'AgencyProfile',
        idempotencyKey: 'agency-projected:AgencyProfile:agency-1:v2',
      }),
      expect.objectContaining({
        aggregateType: 'AgencyInvoice',
        idempotencyKey: 'agency-projected:AgencyInvoice:invoice-1:v3',
      }),
      expect.objectContaining({
        aggregateType: 'AgencyCreditRequest',
        idempotencyKey: 'agency-projected:AgencyCreditRequest:credit-1:v4',
      }),
    ]);
  });

  it('records exact versioned snapshots for every Agency aggregate', async () => {
    const { service, manager, insert, enqueueAgency } = setup();

    await service.recordProfile(manager, profile, 'UPDATED');
    await service.recordInvoice(manager, invoice, 'PAID');
    await service.recordCreditRequest(manager, creditRequest, 'CREATED');

    expect(insert).toHaveBeenCalledTimes(3);
    expect(enqueueAgency.mock.calls.map((call) => call[1].eventType)).toEqual([
      'AgencyProfileProjected',
      'AgencyInvoiceProjected',
      'AgencyCreditRequestProjected',
    ]);
    expect(enqueueAgency.mock.calls[0][1]).toMatchObject({
      producer: 'core-agency',
      aggregateType: 'AgencyProfile',
      aggregateId: 'agency-1',
      idempotencyKey: 'agency-projected:AgencyProfile:agency-1:v2',
      payload: { recordVersion: 2, email: '', city: '', address: '' },
    });
    expect(enqueueAgency.mock.calls[1][1].payload).toMatchObject({
      amountIrr: '12500000',
      descriptionFa: '',
    });
  });

  it('reuses durable audit evidence for an idempotent replay', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'AgencyProfile',
      aggregateId: profile.userId,
      recordVersion: profile.version,
      mutation: 'UPDATED',
    } as AgencyProjectionAudit;
    const { service, manager, insert, enqueueAgency } = setup(existing);

    const result = await service.recordProfile(manager, profile, 'UPDATED');

    expect(result.auditId).toBe('audit-1');
    expect(insert).not.toHaveBeenCalled();
    expect(enqueueAgency.mock.calls[0][1].payload.auditId).toBe('audit-1');
  });

  it('rejects a different mutation reusing the same aggregate version', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'AgencyProfile',
      aggregateId: profile.userId,
      recordVersion: profile.version,
      mutation: 'UPDATED',
    } as AgencyProjectionAudit;
    const { service, manager, enqueueAgency } = setup(existing);

    await expect(
      service.recordProfile(manager, profile, 'SUSPENDED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enqueueAgency).not.toHaveBeenCalled();
  });

  it('propagates an outbox fingerprint conflict on changed replay content', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'AgencyProfile',
      aggregateId: profile.userId,
      recordVersion: profile.version,
      mutation: 'UPDATED',
    } as AgencyProjectionAudit;
    const { service, manager, enqueueAgency } = setup(existing);
    enqueueAgency.mockRejectedValueOnce(new ConflictException());

    await expect(
      service.recordProfile(
        manager,
        { ...profile, managerName: 'مدیر دیگر' } as AgencyProfile,
        'UPDATED',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the caller transaction', async () => {
    const { service, manager } = setup();
    Object.assign(manager, { queryRunner: undefined });

    await expect(
      service.recordProfile(manager, profile, 'CREATED'),
    ).rejects.toThrow('active Core transaction');
  });
});
