import 'dotenv/config';
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DataSource, In } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from './entities/user.entity';
import { dataSourceOptions } from './data-source.options';
import { normalizeIranPhone } from '../common/normalize-iran-phone';
import { resolveUatSharedPassword } from '../common/uat-shared-password';
import {
  TEMPORARY_PANEL_ACCOUNTS,
  TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  createTemporaryPanelExpiry,
} from './temporary-panel-accounts';

const CONFIRMATION = 'CREATE_7_DAY_PANEL_TEST_ACCOUNTS';

interface BootstrapResult {
  username: string;
  role: string;
  fullName: string;
  status: 'created' | 'already_exists';
}

async function main(): Promise<void> {
  const allAccounts = [
    ...TEMPORARY_PANEL_ACCOUNTS,
    ...TEMPORARY_PHONE_LOGIN_ACCOUNTS,
  ];

  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'DRY_RUN',
          accounts: allAccounts.map(({ username, role, fullName }) => ({
            username,
            role,
            fullName,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Bootstrap refused: NODE_ENV must equal production.');
  }
  if (process.env.TEMP_PANEL_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Bootstrap refused: TEMP_PANEL_BOOTSTRAP_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }
  // Never generated/echoed — resolved once, hashed per account below, never
  // written to a log line, error message, or the stdout summary.
  const sharedPassword = resolveUatSharedPassword();

  const createdAt = new Date();
  const expiresAt = createTemporaryPanelExpiry(createdAt);
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const results = await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const out: BootstrapResult[] = [];

      // Username-login accounts (SITE_ADMIN..BOARD_CHAIR, EMPLOYEE).
      const existingUsernameAccounts = await userRepository.find({
        where: {
          username: In(
            TEMPORARY_PANEL_ACCOUNTS.map(({ username }) => username),
          ),
        },
        select: { username: true },
      });
      const existingUsernames = new Set(
        existingUsernameAccounts.map((u) => u.username),
      );

      for (const account of TEMPORARY_PANEL_ACCOUNTS) {
        if (existingUsernames.has(account.username)) {
          out.push({
            username: account.username,
            role: account.role,
            fullName: account.fullName,
            status: 'already_exists',
          });
          continue;
        }
        // Same shared password, but a fresh argon2 hash (own salt) per
        // account — hashes never match each other even though the
        // underlying password is intentionally identical.
        const passwordHash = await argon2.hash(sharedPassword);
        const user = await userRepository.save(
          userRepository.create({
            role: account.role,
            phone: null,
            username: account.username,
            passwordHash,
            email: null,
            fullName: account.fullName,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            temporaryPasswordOnlyUntil: expiresAt,
            isActive: true,
            deletedAt: null,
            createdAt,
            updatedAt: createdAt,
            createdById: null,
            dept: 'dept' in account ? account.dept : null,
            lastLoginAt: null,
            mustChangePassword: false,
            rank: null,
            referralScope: null,
            nationalIdEnc: null,
            nationalIdHash: null,
            passportNoEnc: null,
            birthDate: null,
            emailVerifiedAt: null,
            preferredLocale: 'FA',
            referralCode: null,
          }),
        );
        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'ایجاد دسترسی آزمایشی موقت پنل',
            detail: `حساب ${user.username} فقط برای UAT و تا ${expiresAt.toISOString()} ایجاد شد.`,
            entityType: 'User',
            entityId: user.id,
            metadata: {
              source: 'temporary-panel-account-bootstrap',
              expiresAt: expiresAt.toISOString(),
            },
            requestId: null,
          }),
        );
        out.push({
          username: account.username,
          role: account.role,
          fullName: account.fullName,
          status: 'created',
        });
      }

      // Phone-login accounts (AGENCY, USER).
      for (const account of TEMPORARY_PHONE_LOGIN_ACCOUNTS) {
        const normalizedPhone = normalizeIranPhone(account.phone);
        const existingByUsername = await userRepository.findOneBy({
          username: account.username,
        });
        if (existingByUsername) {
          out.push({
            username: account.username,
            role: account.role,
            fullName: account.fullName,
            status: 'already_exists',
          });
          continue;
        }
        const phoneOwner = await userRepository.findOneBy({
          phone: normalizedPhone,
        });
        if (phoneOwner) {
          throw new Error(
            `Bootstrap refused: reserved UAT phone ${account.phone} is already assigned to another account.`,
          );
        }

        // Same shared password, fresh argon2 hash per account.
        const passwordHash = await argon2.hash(sharedPassword);
        const user = await userRepository.save(
          userRepository.create({
            role: account.role,
            phone: normalizedPhone,
            username: account.username,
            passwordHash,
            email: null,
            fullName: account.fullName,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            temporaryPasswordOnlyUntil: expiresAt,
            isActive: true,
            deletedAt: null,
            createdAt,
            updatedAt: createdAt,
            createdById: null,
            dept: null,
            lastLoginAt: null,
            mustChangePassword: false,
            rank: null,
            referralScope: null,
            nationalIdEnc: null,
            nationalIdHash: null,
            passportNoEnc: null,
            birthDate: null,
            emailVerifiedAt: null,
            preferredLocale: 'FA',
            referralCode: null,
          }),
        );

        // Deliberately NOT creating an AgencyProfile/AgencyCreditLine here —
        // this is identity/access infrastructure only, never business data.
        // The agency portal must show a real empty state for this account,
        // not a fabricated profile (see agency-portal.service.ts).

        await manager.getRepository(AuditLog).save(
          manager.getRepository(AuditLog).create({
            actorId: user.id,
            actorRole: user.role,
            category: 'SECURITY',
            action: 'ایجاد دسترسی آزمایشی موقت پنل',
            detail: `حساب ${user.username} فقط برای UAT و تا ${expiresAt.toISOString()} ایجاد شد.`,
            entityType: 'User',
            entityId: user.id,
            metadata: {
              source: 'temporary-panel-account-bootstrap',
              expiresAt: expiresAt.toISOString(),
            },
            requestId: null,
          }),
        );
        out.push({
          username: account.username,
          role: account.role,
          fullName: account.fullName,
          status: 'created',
        });
      }

      return out;
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          loginPath: '/login',
          // Password is never included — it is the operator's already-known
          // UAT_PANEL_SHARED_PASSWORD secret, not a per-account generated
          // value that needs to be surfaced.
          accounts: results,
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
