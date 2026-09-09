import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  CommerceSagaExecution,
  type CommerceSagaStatus,
  type CommerceSagaType,
} from '../../database/entities/commerce-saga-execution.entity';

interface StartSagaInput {
  sagaType: CommerceSagaType;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  currentStep: string;
}

interface AdvanceSagaInput {
  sagaType: CommerceSagaType;
  aggregateId: string;
  currentStep: string;
  status: CommerceSagaStatus;
  failureCode?: string;
}

@Injectable()
export class CommerceSagaService {
  async start(
    manager: EntityManager,
    input: StartSagaInput,
  ): Promise<CommerceSagaExecution> {
    this.assertTransaction(manager);
    await this.lock(manager, input.sagaType, input.aggregateId);
    const repository = manager.getRepository(CommerceSagaExecution);
    const existing = await repository.findOneBy({
      sagaType: input.sagaType,
      aggregateId: input.aggregateId,
    });
    if (existing) {
      if (
        existing.correlationId !== input.correlationId ||
        existing.idempotencyKey !== input.idempotencyKey
      ) {
        throw new ConflictException({
          code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          message: 'شناسه Saga با فرمان ثبت‌شده تطابق ندارد.',
        });
      }
      return existing;
    }
    return repository.save(
      repository.create({
        ...input,
        status: 'STARTED',
        failureCode: null,
      }),
    );
  }

  async advance(
    manager: EntityManager,
    input: AdvanceSagaInput,
  ): Promise<CommerceSagaExecution> {
    this.assertTransaction(manager);
    await this.lock(manager, input.sagaType, input.aggregateId);
    const repository = manager.getRepository(CommerceSagaExecution);
    const saga = await repository.findOne({
      where: {
        sagaType: input.sagaType,
        aggregateId: input.aggregateId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!saga) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'روند Saga سفارش یافت نشد.',
      });
    }
    if (saga.status === 'COMPLETED') {
      if (
        input.status === 'COMPLETED' &&
        saga.currentStep === input.currentStep
      )
        return saga;
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'روند Saga قبلاً تکمیل شده است.',
      });
    }
    saga.currentStep = input.currentStep;
    saga.status = input.status;
    saga.failureCode =
      input.status === 'COMPENSATION_REQUIRED'
        ? input.failureCode?.trim() || 'UNSPECIFIED_FAILURE'
        : null;
    return repository.save(saga);
  }

  private assertTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Commerce saga requires an active Core transaction');
    }
  }

  private async lock(
    manager: EntityManager,
    sagaType: CommerceSagaType,
    aggregateId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['commerce-saga', sagaType, aggregateId])],
    );
  }
}
