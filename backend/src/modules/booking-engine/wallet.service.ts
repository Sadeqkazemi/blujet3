import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { User } from '../../database/entities/user.entity';
import { ErrorCode } from '../../common/errors';
import { type Irr, ZERO_IRR, negateIrr } from '../../common/money';

/** Balance is ALWAYS SUM(signedAmountIrr) — never a mutable column
 * (CLAUDE.md). Top-up is a sandbox "always succeeds" gateway, matching the
 * rest of Phase 13's payment flow. */
@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntry)
    private readonly walletRepo: Repository<WalletEntry>,
  ) {}

  private async sumBalance(
    manager: EntityManager,
    userId: string,
  ): Promise<Irr> {
    const row = await manager
      .createQueryBuilder(WalletEntry, 'w')
      .select('SUM(w."signedAmountIrr")', 'sum')
      .where('w."userId" = :userId', { userId })
      .getRawOne<{ sum: string | null }>();
    return row?.sum ? BigInt(row.sum) : ZERO_IRR;
  }

  async getBalance(userId: string): Promise<Irr> {
    return this.sumBalance(this.walletRepo.manager, userId);
  }

  async getWallet(userId: string) {
    const [balanceIrr, entries] = await Promise.all([
      this.getBalance(userId),
      this.walletRepo
        .createQueryBuilder('w')
        .leftJoin('w.booking', 'booking')
        .select([
          'w.id',
          'w.type',
          'w.signedAmountIrr',
          'w.bookingId',
          'w.createdAt',
          'booking.id',
          'booking.pnr',
        ])
        .where('w.userId = :userId', { userId })
        .orderBy('w.createdAt', 'DESC')
        .take(50)
        .getMany(),
    ]);
    return {
      balanceIrr,
      entries: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        signedAmountIrr: entry.signedAmountIrr,
        bookingId: entry.bookingId,
        pnr: entry.booking?.pnr ?? null,
        createdAt: entry.createdAt,
      })),
    };
  }

  async topup(userId: string, amountIrr: Irr) {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException({
        code: 'WALLET_TOPUP_UNAVAILABLE',
        message:
          'شارژ کیف پول تا اتصال و تأیید درگاه پرداخت واقعی غیرفعال است.',
      });
    }
    const entry = await this.walletRepo.save(
      this.walletRepo.create({
        userId,
        type: 'TOPUP',
        signedAmountIrr: amountIrr,
      }),
    );
    return {
      balanceIrr: await this.getBalance(userId),
      entryId: entry.id,
    };
  }

  /**
   * Takes the single per-customer lock used by every wallet debit.
   *
   * Callers that need to write other rows referencing the user before the
   * debit must take this lock first. Otherwise two transactions can each
   * hold an FK key-share lock and then deadlock while upgrading to FOR UPDATE.
   */
  async lockForDebit(manager: EntityManager, userId: string): Promise<void> {
    await manager
      .createQueryBuilder(User, 'user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOneOrFail();
  }

  /** Debits the wallet inside an existing transaction — throws if the
   * balance (computed from committed rows only) can't cover the charge. */
  async charge(
    manager: EntityManager,
    userId: string,
    amountIrr: Irr,
    bookingId: string | null,
    accountAlreadyLocked = false,
  ) {
    // Wallet balances are ledger-derived, so serialize all debits on the
    // owning user row before reading SUM(entries). This prevents two bookings
    // from both spending the same committed balance concurrently.
    if (!accountAlreadyLocked) {
      await this.lockForDebit(manager, userId);
    }
    const balance = await this.sumBalance(manager, userId);
    if (balance < amountIrr) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'موجودی کیف پول کافی نیست.',
      });
    }
    return manager.save(
      manager.create(WalletEntry, {
        userId,
        type: 'PURCHASE',
        signedAmountIrr: negateIrr(amountIrr),
        bookingId,
      }),
    );
  }

  /** Credits the wallet (e.g. refunding a previously charged price-lock fee). */
  async credit(
    manager: EntityManager,
    userId: string,
    amountIrr: Irr,
    bookingId: string | null = null,
  ) {
    await manager.save(
      manager.create(WalletEntry, {
        userId,
        type: 'TOPUP',
        signedAmountIrr: amountIrr,
        bookingId,
      }),
    );
  }
}
