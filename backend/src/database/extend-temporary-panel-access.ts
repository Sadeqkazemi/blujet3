import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, In, IsNull } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import type { Role } from './enums';
import { dataSourceOptions } from './data-source.options';
import {
  TEMPORARY_PANEL_ACCESS_MAX_MS,
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PANEL_EXTENSION_MS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
} from './temporary-panel-accounts';

const CONFIRMATION = 'EXTEND_TEMPORARY_PANEL_ACCESS_7_DAYS_V1';

async function main(): Promise<void> {
  const accounts = [
    ...TEMPORARY_PANEL_ACCOUNTS,
    ...TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  ];
  const usernames = accounts.map(({ username }) => username);
  const expectedRoles = new Map<string, Role>(
    accounts.map(({ username, role }) => [username, role] as const),
  );

  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', extensionDays: 7, usernames }, null, 2)}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Extension refused: NODE_ENV must equal production.');
  }
  if (process.env.TEMP_PANEL_EXTENSION_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Extension refused: TEMP_PANEL_EXTENSION_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const result = await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const users = await userRepository.find({
        where: { username: In(usernames) },
      });
      if (users.length !== accounts.length) {
        const found = new Set(users.map(({ username }) => username));
        const missing = usernames.filter((username) => !found.has(username));
        throw new Error(
          `Extension refused: missing temporary accounts (${missing.join(', ')}).`,
        );
      }

      const now = new Date();
      const extended: Array<{
        username: string;
        previousExpiresAt: string;
        expiresAt: string;
      }> = [];

      for (const user of users) {
        if (
          !user.username ||
          expectedRoles.get(user.username) !== user.role ||
          !user.isActive ||
          user.deletedAt !== null ||
          user.passwordHash === null ||
          user.twoFactorEnabled ||
          user.temporaryPasswordOnlyUntil === null
        ) {
          throw new Error(
            `Extension refused: ${user.username ?? user.id} is not an eligible temporary account.`,
          );
        }

        const previousDeadline = user.temporaryPasswordOnlyUntil;
        const absoluteCeiling = new Date(
          user.createdAt.getTime() + TEMPORARY_PANEL_ACCESS_MAX_MS,
        );
        const requestedDeadline = new Date(
          previousDeadline.getTime() + TEMPORARY_PANEL_EXTENSION_MS,
        );
        const extendedDeadline =
          requestedDeadline < absoluteCeiling
            ? requestedDeadline
            : absoluteCeiling;
        if (extendedDeadline <= previousDeadline) {
          throw new Error(
            `Extension refused: ${user.username} already reached its controlled extension ceiling.`,
          );
        }

        user.temporaryPasswordOnlyUntil = extendedDeadline;
        user.updatedAt = now;
        await userRepository.save(user);
        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'Temporary UAT access extended by owner',
            detail: `Temporary UAT access for ${user.username} was extended by seven days.`,
            entityType: 'User',
            entityId: user.id,
            metadata: {
              source: 'temporary-panel-access-extension-v1',
              previousExpiresAt: previousDeadline.toISOString(),
              expiresAt: extendedDeadline.toISOString(),
            },
            requestId: null,
          }),
        );
        extended.push({
          username: user.username,
          previousExpiresAt: previousDeadline.toISOString(),
          expiresAt: extendedDeadline.toISOString(),
        });
      }

      // Existing refresh tokens are capped to the old deadline. Revoking them
      // makes every tester start a clean session within the extended window.
      await manager.getRepository(RefreshToken).update(
        {
          userId: In(users.map(({ id }) => id)),
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );

      return { extendedAt: now.toISOString(), accounts: extended };
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
