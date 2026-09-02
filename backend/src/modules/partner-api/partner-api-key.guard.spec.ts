import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Repository } from 'typeorm';
import type { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import { AgencyApiKeyStatus, AgencyApiScope } from '../../database/enums';
import type { RedisService } from '../../redis/redis.service';
import {
  PartnerApiKeyGuard,
  type PartnerApiRequest,
} from './partner-api-key.guard';

describe('PartnerApiKeyGuard', () => {
  const originalPiiKey = process.env.PII_ENCRYPTION_KEY;
  const request = { headers: {} } as PartnerApiRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => PartnerApiKeyGuard,
    getClass: () => PartnerApiKeyGuard,
  } as unknown as ExecutionContext;
  const findOne = jest.fn();
  const increment = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue(undefined);
  const getAllAndOverride = jest.fn();
  const repo = {
    findOne,
    increment,
    update,
  } as unknown as Repository<AgencyApiKey>;
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;
  const redis = {
    incrWithTtl: jest.fn().mockResolvedValue(1),
  } as unknown as RedisService;
  const guard = new PartnerApiKeyGuard(repo, reflector, redis);

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalPiiKey === undefined) {
      delete process.env.PII_ENCRYPTION_KEY;
    } else {
      process.env.PII_ENCRYPTION_KEY = originalPiiKey;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    request.headers = {};
    delete request.partnerApi;
  });

  it('rejects a missing key without querying the database', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findOne).not.toHaveBeenCalled();
  });

  it('authenticates an active agency key and records its usage', async () => {
    request.headers['x-api-key'] = 'raw-key';
    getAllAndOverride.mockReturnValue([AgencyApiScope.SEARCH_BOOK]);
    findOne.mockResolvedValue({
      id: 'key-1',
      agencyId: 'agency-1',
      scope: AgencyApiScope.SEARCH_BOOK,
      status: AgencyApiKeyStatus.ACTIVE,
      expiresAt: null,
      agency: {
        suspendedAt: null,
        user: {
          fullName: 'Agency One',
          isActive: true,
          deletedAt: null,
        },
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.partnerApi?.actor.id).toBe('agency-1');
    expect(increment).toHaveBeenCalledWith({ id: 'key-1' }, 'callCount', 1);
    expect(update).toHaveBeenCalled();
  });

  it('fails closed when the agency account is suspended', async () => {
    request.headers['x-api-key'] = 'raw-key';
    findOne.mockResolvedValue({
      id: 'key-1',
      scope: AgencyApiScope.FULL,
      status: AgencyApiKeyStatus.ACTIVE,
      expiresAt: null,
      agency: {
        suspendedAt: new Date(),
        user: { isActive: true, deletedAt: null },
      },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects operations outside the key scope', async () => {
    request.headers['x-api-key'] = 'raw-key';
    getAllAndOverride.mockReturnValue([AgencyApiScope.SEARCH_BOOK]);
    findOne.mockResolvedValue({
      id: 'key-1',
      scope: AgencyApiScope.SEARCH_ONLY,
      status: AgencyApiKeyStatus.ACTIVE,
      expiresAt: null,
      agency: {
        suspendedAt: null,
        user: { isActive: true, deletedAt: null },
      },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
