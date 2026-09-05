import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PriceLockService } from './price-lock.service';

const owner = '00000000-0000-4000-8000-000000000001';
const user = { id: owner } as AuthenticatedUser;

function queryBuilder<T>(result: T) {
  const builder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn().mockResolvedValue(result),
  };
  builder.leftJoinAndSelect.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  return builder;
}

function service(
  remote: unknown,
  flightRows: unknown[] = [],
  localRows: unknown[] = [],
) {
  const remoteClient = { get: jest.fn().mockResolvedValue(remote) };
  const flightRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder(flightRows)),
  };
  const priceRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder(localRows)),
  };
  return {
    subject: new PriceLockService(
      priceRepo as never,
      flightRepo as never,
      {} as never,
      {} as never,
      remoteClient as never,
    ),
    remoteClient,
    priceRepo,
    flightRepo,
  };
}

const wireLock = {
  id: 'lock-1',
  flightInstanceId: 'flight-instance-1',
  cabin: 'ECONOMY',
  lockedPriceIrr: '9223372036854775807',
  feeIrr: '300000',
  status: 'ACTIVE',
  expiresAt: '2026-09-05T12:00:00.000Z',
  createdAt: '2026-09-04T12:00:00.000Z',
  bookingId: null,
};

describe('PriceLockService list cutover', () => {
  it('hydrates the existing public flight summary from Core inventory', async () => {
    const flightRows = [
      {
        id: wireLock.flightInstanceId,
        departureAt: new Date('2026-09-05T12:00:00.000Z'),
        flight: {
          flightNo: 'PE-300',
          route: { originCode: 'THR', destCode: 'IFN' },
        },
      },
    ];
    const setup = service({ userId: owner, locks: [wireLock] }, flightRows);
    await expect(setup.subject.listMine(user, 'request-1')).resolves.toEqual([
      {
        ...wireLock,
        flight: {
          flightNo: 'PE-300',
          originCode: 'THR',
          destCode: 'IFN',
          departureAt: new Date('2026-09-05T12:00:00.000Z'),
        },
      },
    ]);
    expect(setup.remoteClient.get).toHaveBeenCalledWith(owner, 'request-1');
    expect(setup.priceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns an empty remote history without touching Core inventory', async () => {
    const setup = service({ userId: owner, locks: [] });
    await expect(setup.subject.listMine(user)).resolves.toEqual([]);
    expect(setup.flightRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('falls back to the existing Core read when Loyalty is unavailable', async () => {
    const localRows = [
      {
        id: 'local-lock',
        flightInstanceId: 'flight-instance-1',
        cabin: 'ECONOMY',
        lockedPriceIrr: 1n,
        feeIrr: 0n,
        status: 'ACTIVE',
        expiresAt: new Date('2026-09-05T12:00:00.000Z'),
        createdAt: new Date('2026-09-04T12:00:00.000Z'),
        bookingId: null,
        flightInstance: {
          departureAt: new Date('2026-09-05T12:00:00.000Z'),
          flight: {
            flightNo: 'PE-300',
            route: { originCode: 'THR', destCode: 'IFN' },
          },
        },
      },
    ];
    const setup = service(undefined, [], localRows);
    await expect(setup.subject.listMine(user)).resolves.toEqual([
      {
        id: 'local-lock',
        flightInstanceId: 'flight-instance-1',
        cabin: 'ECONOMY',
        lockedPriceIrr: 1n,
        feeIrr: 0n,
        status: 'ACTIVE',
        expiresAt: new Date('2026-09-05T12:00:00.000Z'),
        createdAt: new Date('2026-09-04T12:00:00.000Z'),
        bookingId: null,
        flight: {
          flightNo: 'PE-300',
          originCode: 'THR',
          destCode: 'IFN',
          departureAt: new Date('2026-09-05T12:00:00.000Z'),
        },
      },
    ]);
    expect(setup.priceRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('fails safely when a remote lock cannot be hydrated from Core inventory', async () => {
    const setup = service({ userId: owner, locks: [wireLock] }, []);
    await expect(setup.subject.listMine(user)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
