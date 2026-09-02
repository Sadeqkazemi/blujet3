/* eslint-disable @typescript-eslint/no-unsafe-return -- Nest ExecutionContext and TypeORM fluent mocks intentionally return partial test doubles. */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { EmployeePermission } from '../../database/entities/employee-permission.entity';
import { EmployeePermissionGuard } from './employee-permission.guard';
import type { AuthenticatedUser } from '../types/authenticated-user';

function contextFor(user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardFor(required: string[], granted: string[]) {
  let queriedKeys: string[] = [];
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn((_sql: string, params: { keys: string[] }) => {
      queriedKeys = params.keys;
      return queryBuilder;
    }),
    getOne: jest.fn(() =>
      Promise.resolve(
        queriedKeys.some((key) => granted.includes(key))
          ? ({ id: 'grant' } as EmployeePermission)
          : null,
      ),
    ),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as Repository<EmployeePermission>;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;

  return new EmployeePermissionGuard(reflector, repo);
}

const employee: AuthenticatedUser = {
  id: 'employee-1',
  role: 'EMPLOYEE',
  fullName: 'کارمند بازرگانی',
};

describe('EmployeePermissionGuard permission dependencies', () => {
  it('lets a flight manager load the read data required by the same surface', async () => {
    const guard = guardFor(['fl_view'], ['fl_manage']);

    await expect(guard.canActivate(contextFor(employee))).resolves.toBe(true);
  });

  it('does not let a read-only flight grant perform a management mutation', async () => {
    const guard = guardFor(['fl_manage'], ['fl_view']);

    await expect(
      guard.canActivate(contextFor(employee)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('continues to require an explicitly related grant', async () => {
    const guard = guardFor(['ag_requests'], ['fl_manage']);

    await expect(
      guard.canActivate(contextFor(employee)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['ct_list', 'ct_process'],
    ['rf_list', 'rf_details'],
    ['rf_list', 'rf_process'],
    ['rf_details', 'rf_process'],
  ])(
    'lets %s read dependency be satisfied by %s',
    async (required, granted) => {
      const guard = guardFor([required], [granted]);

      await expect(guard.canActivate(contextFor(employee))).resolves.toBe(true);
    },
  );

  it('does not let refund detail access process a refund', async () => {
    const guard = guardFor(['rf_process'], ['rf_details']);

    await expect(
      guard.canActivate(contextFor(employee)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
