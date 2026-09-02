import 'dotenv/config';
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DataSource, IsNull } from 'typeorm';
import { normalizeIranPhone } from '../common/normalize-iran-phone';
import { dataSourceOptions } from './data-source.options';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { generateTemporaryPanelPassword } from './temporary-panel-accounts';

const CONFIRMATION = 'CREATE_OR_ROTATE_OWNER_SUPER_ADMIN';

async function main(): Promise<void> {
  const username = (process.env.SUPER_ADMIN_USERNAME ?? 'superadmin').trim();
  const fullName = (process.env.SUPER_ADMIN_FULL_NAME ?? 'مالک سامانه').trim();
  const phoneInput = process.env.SUPER_ADMIN_PHONE?.trim();

  if (!phoneInput) throw new Error('SUPER_ADMIN_PHONE is required.');
  const phone = normalizeIranPhone(phoneInput);

  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', username, fullName, phone, role: 'SITE_ADMIN' }, null, 2)}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Bootstrap refused: NODE_ENV must equal production.');
  }
  if (process.env.SUPER_ADMIN_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Bootstrap refused: SUPER_ADMIN_BOOTSTRAP_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }

  const oneTimePassword = generateTemporaryPanelPassword();
  const passwordHash = await argon2.hash(oneTimePassword);
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const result = await dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const byUsername = await users.findOneBy({ username });
      const byPhone = await users.findOneBy({ phone });
      const existingOwner = await users.findOneBy({
        isSuperAdmin: true,
        deletedAt: IsNull(),
      });

      if (byUsername && byPhone && byUsername.id !== byPhone.id) {
        throw new Error(
          'Bootstrap refused: username and phone belong to different users.',
        );
      }
      const target = byUsername ?? byPhone;
      if (target && !target.isSuperAdmin) {
        throw new Error(
          'Bootstrap refused: existing non-super-admin identity was not converted.',
        );
      }
      if (existingOwner && (!target || existingOwner.id !== target.id)) {
        throw new Error(
          'Bootstrap refused: another active owner super-admin already exists.',
        );
      }

      const now = new Date();
      const user = target
        ? await users.save({
            ...target,
            role: 'SITE_ADMIN',
            phone,
            username,
            fullName,
            passwordHash,
            isSuperAdmin: true,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            temporaryPasswordOnlyUntil: null,
            isActive: true,
            deletedAt: null,
            mustChangePassword: true,
            updatedAt: now,
          })
        : await users.save(
            users.create({
              role: 'SITE_ADMIN',
              phone,
              username,
              passwordHash,
              email: null,
              fullName,
              twoFactorEnabled: false,
              isSuperAdmin: true,
              twoFactorSecret: null,
              temporaryPasswordOnlyUntil: null,
              isActive: true,
              deletedAt: null,
              createdAt: now,
              updatedAt: now,
              createdById: null,
              dept: null,
              lastLoginAt: null,
              mustChangePassword: true,
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

      await manager
        .getRepository(RefreshToken)
        .update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: now });
      await manager.getRepository(AuditLog).save(
        manager.getRepository(AuditLog).create({
          actorId: user.id,
          actorRole: user.role,
          category: 'SECURITY',
          action: target
            ? 'چرخش دسترسی مالک سامانه'
            : 'ایجاد دسترسی مالک سامانه',
          detail:
            'حساب مالک با دسترسی مدیریتی سراسری و الزام تغییر رمز در اولین ورود ثبت شد.',
          entityType: 'User',
          entityId: user.id,
          metadata: {
            source: 'owner-super-admin-bootstrap',
            isSuperAdmin: true,
          },
          requestId: null,
        }),
      );

      return { id: user.id, created: !target };
    });

    process.stdout.write(
      `${JSON.stringify({ mode: 'EXECUTED', ...result, username, phone, oneTimePassword, loginPath: '/login', mustChangePassword: true }, null, 2)}\n`,
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
