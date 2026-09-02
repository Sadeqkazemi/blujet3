import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, In, IsNull } from 'typeorm';
import { normalizeIranPhone } from '../common/normalize-iran-phone';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import type { Role } from './enums';
import { dataSourceOptions } from './data-source.options';
import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  createTemporaryPanelV2ExtensionExpiry,
} from './temporary-panel-accounts';

const CONFIRMATION = 'EXTEND_TEMPORARY_PANEL_ACCESS_7_DAYS_V3';
const TRUSTED_PROVENANCE_SOURCES = [
  'temporary-panel-account-bootstrap',
  'temporary-panel-access-extension-v1',
  'temporary-panel-access-extension-v2',
] as const;

async function main(): Promise<void> {
  const accounts = [
    ...TEMPORARY_PANEL_ACCOUNTS,
    ...TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  ];
  const usernames = accounts.map(({ username }) => username);
  const expectedRoles = new Map<string, Role>(
    accounts.map(({ username, role }) => [username, role] as const),
  );
  const expectedAccounts = new Map<string, (typeof accounts)[number]>(
    accounts.map((account) => [account.username, account] as const),
  );

  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', extensionDays: 7, version: 3, usernames }, null, 2)}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Extension v3 refused: NODE_ENV must equal production.');
  }
  if (process.env.TEMP_PANEL_EXTENSION_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Extension v3 refused: TEMP_PANEL_EXTENSION_CONFIRM must equal ${CONFIRMATION}.`,
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
          `Extension v3 refused: missing temporary accounts (${missing.join(', ')}).`,
        );
      }

      const now = new Date();
      const extended: Array<{
        username: string;
        previousExpiresAt: string | null;
        expiresAt: string;
      }> = [];

      for (const user of users) {
        const expectedRole = user.username
          ? expectedRoles.get(user.username)
          : undefined;
        const expectedAccount = user.username
          ? expectedAccounts.get(user.username)
          : undefined;
        const trustedAuditCount = await manager
          .getRepository(AuditLog)
          .createQueryBuilder('audit')
          .where('audit.entityId = :entityId', { entityId: user.id })
          .andWhere('audit.entityType = :entityType', { entityType: 'User' })
          .andWhere("audit.metadata ->> 'source' IN (:...sources)", {
            sources: TRUSTED_PROVENANCE_SOURCES,
          })
          .getCount();
        const refusalReasons = [
          !user.username || expectedRole === undefined || !expectedAccount
            ? 'reserved identity mismatch'
            : null,
          user.passwordHash === null ? 'password hash missing' : null,
          trustedAuditCount < 1 ? 'trusted UAT audit provenance missing' : null,
        ].filter((reason): reason is string => reason !== null);
        if (refusalReasons.length > 0 || !expectedAccount || !expectedRole) {
          throw new Error(
            `Extension v3 refused: ${user.username ?? user.id} is not an eligible temporary account (${refusalReasons.join(', ')}).`,
          );
        }

        const expectedPhone =
          'phone' in expectedAccount
            ? normalizeIranPhone(expectedAccount.phone)
            : null;

        const previousDeadline = user.temporaryPasswordOnlyUntil;
        const extendedDeadline = createTemporaryPanelV2ExtensionExpiry(
          user.createdAt,
          previousDeadline ?? now,
          now,
        );
        if (
          (previousDeadline !== null && extendedDeadline <= previousDeadline) ||
          extendedDeadline <= now
        ) {
          throw new Error(
            `Extension v3 refused: ${user.username} already reached its controlled extension ceiling.`,
          );
        }

        const restoredState = {
          role: user.role !== expectedRole,
          active: !user.isActive,
          deleted: user.deletedAt !== null,
          temporaryDeadline: previousDeadline === null,
          twoFactor: user.twoFactorEnabled || user.twoFactorSecret !== null,
          superAdmin: user.isSuperAdmin,
          panelPermissions: user.panelPermissions !== null,
          fullName: user.fullName !== expectedAccount.fullName,
          phone: user.phone !== expectedPhone,
          dept:
            user.dept !==
            ('dept' in expectedAccount ? expectedAccount.dept : null),
        };
        user.role = expectedRole;
        user.fullName = expectedAccount.fullName;
        user.phone = expectedPhone;
        user.dept = 'dept' in expectedAccount ? expectedAccount.dept : null;
        user.isActive = true;
        user.deletedAt = null;
        user.isSuperAdmin = false;
        user.panelPermissions = null;
        user.temporaryPasswordOnlyUntil = extendedDeadline;
        // These are exact, reserved synthetic identities. A prior UAT flow may
        // have changed lifecycle/role/2FA fields. Bootstrap audit provenance is
        // required above before restoring the approved sandbox state, so no
        // ordinary or look-alike account can enter this recovery path.
        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        user.mustChangePassword = false;
        user.updatedAt = now;
        await userRepository.save(user);
        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'Temporary UAT access extended by owner (v3)',
            detail: `Temporary UAT access for ${user.username} was extended by seven days under owner approval v3.`,
            entityType: 'User',
            entityId: user.id,
            metadata: {
              source: 'temporary-panel-access-extension-v3',
              previousExpiresAt: previousDeadline?.toISOString() ?? null,
              expiresAt: extendedDeadline.toISOString(),
              restoredState,
            },
            requestId: null,
          }),
        );
        extended.push({
          username: user.username!,
          previousExpiresAt: previousDeadline?.toISOString() ?? null,
          expiresAt: extendedDeadline.toISOString(),
        });
      }

      // Existing refresh tokens retain the old deadline. Revoking them forces
      // every tester to authenticate inside the newly approved v3 window.
      await manager.getRepository(RefreshToken).update(
        {
          userId: In(users.map(({ id }) => id)),
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );

      return { version: 3, extendedAt: now.toISOString(), accounts: extended };
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
