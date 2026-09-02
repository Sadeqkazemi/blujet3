import type { Repository } from 'typeorm';
import type { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import type { AgencyProfile } from '../../database/entities/agency-profile.entity';
import type { AgencyWebserviceRequest } from '../../database/entities/agency-webservice-request.entity';
import type { AuditLog } from '../../database/entities/audit-log.entity';
import { Role } from '../../database/enums';
import type { AgenciesService } from '../agencies/agencies.service';
import { ItWebservicesService } from './it-webservices.service';

function queryBuilderResult<T>(rows: T[]) {
  const builder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orWhere: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orWhere',
    'orderBy',
    'take',
  ] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

describe('ItWebservicesService', () => {
  it('builds the IT overview from existing entities without exposing keyHash', async () => {
    const requests = [
      {
        id: 'request-1',
        agencyId: 'agency-1',
        agency: { user: { fullName: 'آژانس سپهر' } },
        scope: 'SEARCH_BOOK',
        months: 6,
        priceIrr: 12_000_000n,
        note: null,
        status: 'PENDING',
        createdAt: new Date('2026-08-19T08:00:00.000Z'),
        decidedAt: null,
      },
    ];
    const keys = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        agencyId: 'agency-1',
        agency: { user: { fullName: 'آژانس سپهر' } },
        keyHash: 'must-never-leave-the-server',
        scope: 'SEARCH_BOOK',
        capabilities: [
          'RESERVATION',
          'TICKETING',
          'FLIGHT_INFO',
          'AVAILABILITY',
        ],
        environment: 'SANDBOX',
        flightDomain: 'ALL',
        ipWhitelist: [],
        rateLimitPerMinute: null,
        status: 'ACTIVE',
        activatedAt: new Date('2026-08-19T08:00:00.000Z'),
        expiresAt: null,
        lastUsedAt: null,
        callCount: 42,
      },
    ];
    const requestRepo = {
      find: jest.fn().mockResolvedValue(requests),
      countBy: jest.fn().mockResolvedValue(1),
    };
    const keyRepo = {
      find: jest.fn().mockResolvedValue(keys),
      count: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const agencyRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(
        queryBuilderResult([
          {
            userId: 'agency-1',
            licenseNo: 'L1',
            user: { fullName: 'آژانس سپهر' },
          },
        ]),
      ),
    };
    const auditRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderResult([])),
      count: jest.fn().mockResolvedValue(0),
    };
    const agencies = {};
    const service = new ItWebservicesService(
      requestRepo as unknown as Repository<AgencyWebserviceRequest>,
      keyRepo as unknown as Repository<AgencyApiKey>,
      agencyRepo as unknown as Repository<AgencyProfile>,
      auditRepo as unknown as Repository<AuditLog>,
      {} as never,
      {} as never,
      {} as never,
      agencies as AgenciesService,
    );

    const result = await service.overview();

    expect(result.kpis).toMatchObject({
      activeClients: 1,
      issuedKeys: 1,
      pendingRequests: 1,
    });
    expect(result.clients[0]).toMatchObject({
      agency: 'آژانس سپهر',
      keyHint: 'bjk_••••1111',
      callCount: 42,
    });
    expect(result.clients[0]).not.toHaveProperty('keyHash');
    expect(result.requests[0]).toMatchObject({
      priceIrr: '12000000',
      status: 'PENDING',
    });
  });

  it('delegates key lifecycle mutations to the established agency security service', async () => {
    const keyRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'key-1', agencyId: 'agency-1' }),
    };
    const agencies = {
      updateApiKey: jest
        .fn()
        .mockResolvedValue({ id: 'key-1', status: 'REVOKED' }),
    };
    const service = new ItWebservicesService(
      {} as Repository<AgencyWebserviceRequest>,
      keyRepo as unknown as Repository<AgencyApiKey>,
      {} as Repository<AgencyProfile>,
      {} as Repository<AuditLog>,
      {} as never,
      {} as never,
      {} as never,
      agencies as unknown as AgenciesService,
    );
    const actor = { id: 'it-1', role: Role.IT_MANAGER, fullName: 'مدیر IT' };

    await service.updateClient(actor, 'key-1', {
      status: 'REVOKED',
      stepUpChallengeId: 'challenge-1',
      stepUpCode: '482913',
    });

    expect(agencies.updateApiKey).toHaveBeenCalledWith(
      actor,
      'agency-1',
      'key-1',
      expect.objectContaining({ status: 'REVOKED', stepUpCode: '482913' }),
    );
  });
});
