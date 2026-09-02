import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import { AuditLog } from './entities/audit-log.entity';
import { User } from './entities/user.entity';
import { WalletEntry } from './entities/wallet-entry.entity';
import { WalletEntryType } from './enums';
import {
  UAT_WALLET_TARGET_IRR,
  uatWalletAdjustmentIrr,
} from './uat-wallet-reconciliation.contract';

const CONFIRMATION = 'RECONCILE_UAT_WALLETS_TO_100M_TOMAN_V2';
const TARGETS = [
  {
    username: 'uat.customer',
    role: 'USER',
    entryId: 'uat-customer-wallet-reconcile-100m-v2',
  },
  {
    username: 'uat.agency',
    role: 'AGENCY',
    entryId: 'uat-agency-wallet-reconcile-100m-v2',
  },
] as const;

async function balance(manager: DataSource['manager'], userId: string) {
  const row = await manager
    .createQueryBuilder(WalletEntry, 'wallet')
    .select('COALESCE(SUM(wallet."signedAmountIrr"), 0)', 'sum')
    .where('wallet."userId" = :userId', { userId })
    .getRawOne<{ sum: string }>();
  return BigInt(row?.sum ?? '0');
}

async function main() {
  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', targetIrr: UAT_WALLET_TARGET_IRR.toString(), accounts: TARGETS.map((target) => target.username) })}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Wallet reconciliation refused: NODE_ENV must equal production.',
    );
  }
  if (process.env.AUTH_SANDBOX_ENABLED !== 'true') {
    throw new Error(
      'Wallet reconciliation refused: sandbox authentication must be enabled.',
    );
  }
  if (process.env.UAT_WALLET_RECONCILE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Wallet reconciliation refused: confirmation must equal ${CONFIRMATION}.`,
    );
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const result = await dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const walletRepo = manager.getRepository(WalletEntry);
      const auditRepo = manager.getRepository(AuditLog);
      const updates: Array<{
        username: string;
        beforeIrr: string;
        adjustmentIrr: string;
        afterIrr: string;
      }> = [];

      for (const target of TARGETS) {
        const user = await userRepo.findOneBy({ username: target.username });
        if (
          !user ||
          user.role !== target.role ||
          !user.isActive ||
          user.deletedAt
        ) {
          throw new Error(
            `Wallet reconciliation refused: exact active ${target.username}/${target.role} account is missing.`,
          );
        }
        const before = await balance(manager, user.id);
        const delta = uatWalletAdjustmentIrr(before);
        const priorAdjustment = await walletRepo.findOneBy({
          id: target.entryId,
        });
        if (delta !== 0n) {
          if (priorAdjustment) {
            throw new Error(
              `Wallet reconciliation refused: ${target.username} changed after its one-time adjustment.`,
            );
          }
          await walletRepo.save(
            walletRepo.create({
              id: target.entryId,
              userId: user.id,
              type: WalletEntryType.ADJUST,
              signedAmountIrr: delta,
              bookingId: null,
            }),
          );
        }
        const after = await balance(manager, user.id);
        if (after !== UAT_WALLET_TARGET_IRR) {
          throw new Error(
            `Wallet reconciliation failed for ${target.username}.`,
          );
        }
        updates.push({
          username: target.username,
          beforeIrr: before.toString(),
          adjustmentIrr: delta.toString(),
          afterIrr: after.toString(),
        });
      }

      const actor = await userRepo.findOneByOrFail({ username: 'uat.agency' });
      await auditRepo.save(
        auditRepo.create({
          actorId: actor.id,
          actorRole: actor.role,
          category: 'FINANCE',
          action: 'همسان‌سازی کنترل‌شده کیف پول‌های UAT',
          detail:
            'موجودی کیف پول مشتری و آژانس آزمایشی دقیقاً به ۱۰۰ میلیون تومان همسان شد.',
          entityType: 'WalletEntry',
          entityId: actor.id,
          metadata: {
            source: 'uat-wallet-reconcile-100m-v2',
            targetIrr: UAT_WALLET_TARGET_IRR.toString(),
            updates,
          },
          requestId: null,
        }),
      );
      return updates;
    });
    process.stdout.write(
      `${JSON.stringify({ success: true, targetIrr: UAT_WALLET_TARGET_IRR.toString(), updates: result })}\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
