import 'dotenv/config';
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DataSource, In, IsNull } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { dataSourceOptions } from './data-source.options';
import { resolveUatSharedPassword } from '../common/uat-shared-password';
import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  getTemporaryPanelAccessState,
} from './temporary-panel-accounts';

const CONFIRMATION = 'ROTATE_TEMPORARY_PANEL_PASSWORDS_SHARED_V1';

async function main(): Promise<void> {
  const allAccounts: ReadonlyArray<{ username: string; role: string }> = [
    ...TEMPORARY_PANEL_ACCOUNTS,
    ...TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  ];

  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'DRY_RUN',
          usernames: allAccounts.map(({ username }) => username),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Rotation refused: NODE_ENV must equal production.');
  }
  if (process.env.TEMP_PANEL_ROTATE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Rotation refused: TEMP_PANEL_ROTATE_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }
  const sharedPassword = resolveUatSharedPassword();

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const result = await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const users = await userRepository.find({
        where: { username: In(allAccounts.map(({ username }) => username)) },
      });
      if (users.length !== allAccounts.length) {
        const found = new Set(users.map((u) => u.username));
        const missing = allAccounts
          .map(({ username }) => username)
          .filter((username) => !found.has(username));
        throw new Error(
          `Rotation refused: missing temporary accounts (${missing.join(', ')}). Run bootstrap first.`,
        );
      }

      const now = new Date();
      const usersByUsername = new Map(
        users.map((user) => [user.username, user] as const),
      );
      for (const account of allAccounts) {
        const user = usersByUsername.get(account.username);
        if (
          !user ||
          user.role !== account.role ||
          !user.isActive ||
          user.deletedAt !== null ||
          user.passwordHash === null ||
          getTemporaryPanelAccessState(user, now) !== 'ACTIVE'
        ) {
          throw new Error(
            `Rotation refused: ${account.username} is not an active, unexpired temporary ${account.role} account.`,
          );
        }
      }

      for (const account of allAccounts) {
        const user = usersByUsername.get(account.username)!;
        // Same shared password, fresh argon2 hash (own salt) per account.
        user.passwordHash = await argon2.hash(sharedPassword);
        user.updatedAt = now;
        await userRepository.save(user);
        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'Temporary panel password rotated',
            detail: `Shared UAT password rotated for ${user.username}; expiry was preserved.`,
            entityType: 'User',
            entityId: user.id,
            metadata: {
              source: 'temporary-panel-shared-password-rotation',
              expiresAt: user.temporaryPasswordOnlyUntil!.toISOString(),
            },
            requestId: null,
          }),
        );
      }

      // Every previously-issued session/refresh token for these accounts is
      // invalidated the instant the shared password changes.
      await manager.getRepository(RefreshToken).update(
        {
          userId: In(users.map(({ id }) => id)),
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );

      return {
        rotatedAt: now.toISOString(),
        accounts: allAccounts.map(({ username, role }) => {
          const user = usersByUsername.get(username)!;
          return {
            username,
            role,
            expiresAt: user.temporaryPasswordOnlyUntil!.toISOString(),
            status: 'rotated' as const,
          };
        }),
      };
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          ...result,
          loginPath: '/login',
        },
        null,
        2,
      )}\n`,
    );
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
