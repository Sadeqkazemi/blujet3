import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, In, IsNull } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { dataSourceOptions } from './data-source.options';
import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
} from './temporary-panel-accounts';

const CONFIRMATION = 'DISABLE_TEMPORARY_PANEL_TEST_ACCOUNTS';
const ALL_TEMPORARY_USERNAMES = [
  ...TEMPORARY_PANEL_ACCOUNTS,
  ...TEMPORARY_PHONE_LOGIN_ACCOUNTS,
].map(({ username }) => username);

async function main(): Promise<void> {
  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', usernames: ALL_TEMPORARY_USERNAMES }, null, 2)}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Cleanup refused: NODE_ENV must equal production.');
  }
  if (process.env.TEMP_PANEL_CLEANUP_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Cleanup refused: TEMP_PANEL_CLEANUP_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const disabled = await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const users = await userRepository.find({
        where: { username: In(ALL_TEMPORARY_USERNAMES) },
      });
      if (users.length === 0) return 0;

      const now = new Date();
      const userIds = users.map(({ id }) => id);
      await manager
        .getRepository(RefreshToken)
        .update(
          { userId: In(userIds), revokedAt: IsNull() },
          { revokedAt: now },
        );
      await userRepository.update(
        { id: In(userIds) },
        {
          isActive: false,
          passwordHash: null,
          temporaryPasswordOnlyUntil: null,
          deletedAt: now,
          updatedAt: now,
        },
      );

      for (const user of users) {
        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'غیرفعال‌سازی دسترسی آزمایشی موقت پنل',
            detail: `حساب موقت ${user.username} غیرفعال و همه نشست‌های آن باطل شد.`,
            entityType: 'User',
            entityId: user.id,
            metadata: { source: 'temporary-panel-account-cleanup' },
            requestId: null,
          }),
        );
      }
      return users.length;
    });
    process.stdout.write(`${JSON.stringify({ disabled })}\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
