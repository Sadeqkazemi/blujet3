import 'dotenv/config';
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DataSource, In, type Repository } from 'typeorm';
import { encryptPii } from '../common/pii-crypto';
import { AuditLog } from './entities/audit-log.entity';
import { ExternalServiceConfig } from './entities/external-service-config.entity';
import { User } from './entities/user.entity';
import { dataSourceOptions } from './data-source.options';
import {
  generatePanelTemporaryPassword,
  parsePanelAccountsJson,
  toPanelAccountDryRun,
  type PanelAccountInput,
} from './production-panel-accounts';

const EXECUTE_FLAG = '--execute';
const CONFIRMATION = 'CREATE_BLUJET_PANEL_ACCOUNTS';

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function assertNoExistingIdentity(
  repository: Repository<User>,
  accounts: PanelAccountInput[],
): Promise<void> {
  const usernames = accounts.map((account) => account.username);
  const phones = accounts.map((account) => account.phone);
  const emails = accounts.flatMap((account) =>
    account.email === null ? [] : [account.email],
  );
  const where = [
    { username: In(usernames) },
    { phone: In(phones) },
    ...(emails.length > 0 ? [{ email: In(emails) }] : []),
  ];
  const conflicts = await repository.find({
    where,
    select: { username: true, phone: true, email: true },
  });

  if (conflicts.length > 0) {
    const identities = conflicts.map((user) =>
      [user.username, user.phone, user.email].filter(Boolean).join(' / '),
    );
    throw new Error(
      `Bootstrap refused: an account identity already exists (${identities.join(', ')}). Existing accounts were not changed.`,
    );
  }
}

async function ensureKavenegarIsConfigured(
  repository: Repository<ExternalServiceConfig>,
): Promise<void> {
  const existing = await repository.findOneBy({ key: 'ext_kavenegar' });
  if (existing?.enabled && existing.apiKeyEncrypted) return;

  const apiKey = process.env.PANEL_ACCOUNT_BOOTSTRAP_KAVENEGAR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Bootstrap refused: staff login requires SMS 2FA, but Kavenegar is not active. Supply PANEL_ACCOUNT_BOOTSTRAP_KAVENEGAR_API_KEY without placing it in shell history.',
    );
  }

  await repository.save(
    repository.create({
      ...(existing ?? {}),
      key: 'ext_kavenegar',
      nameFa: 'سرویس پیامک کاوه‌نگار',
      provider: 'Kavenegar',
      endpoint: 'https://api.kavenegar.com/v1/sms/send.json',
      method: 'POST',
      timeoutMs: 30000,
      apiKeyEncrypted: encryptPii(apiKey),
      sandbox: false,
      enabled: true,
      lastTestAt: null,
      lastTestOk: null,
      lastTestMessage: null,
      updatedAt: new Date(),
    }),
  );
}

async function main(): Promise<void> {
  const accounts = parsePanelAccountsJson(await readStandardInput());
  const execute = process.argv.includes(EXECUTE_FLAG);

  if (!execute) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'DRY_RUN', accounts: toPanelAccountDryRun(accounts) }, null, 2)}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Bootstrap refused: NODE_ENV must equal production.');
  }
  if (process.env.PANEL_ACCOUNT_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Bootstrap refused: PANEL_ACCOUNT_BOOTSTRAP_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }

  const credentials = accounts.map((account) => ({
    ...account,
    temporaryPassword: generatePanelTemporaryPassword(),
  }));
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const auditRepository = manager.getRepository(AuditLog);
      const externalServiceRepository = manager.getRepository(
        ExternalServiceConfig,
      );

      await assertNoExistingIdentity(userRepository, accounts);
      await ensureKavenegarIsConfigured(externalServiceRepository);

      for (const credential of credentials) {
        const user = await userRepository.save(
          userRepository.create({
            role: credential.role,
            phone: credential.phone,
            username: credential.username,
            passwordHash: await argon2.hash(credential.temporaryPassword),
            email: credential.email,
            fullName: credential.fullName,
            twoFactorEnabled: true,
            twoFactorSecret: null,
            isActive: true,
            deletedAt: null,
            updatedAt: new Date(),
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

        await auditRepository.save(
          auditRepository.create({
            actorId: user.id,
            actorRole: user.role,
            category: 'ACCOUNT',
            action: 'راه‌اندازی اولیه حساب پنل',
            detail: `حساب پنل ${user.fullName} با نقش ${user.role} توسط عملیات کنترل‌شده راه‌اندازی تولید ایجاد شد.`,
            entityType: 'User',
            entityId: user.id,
            metadata: { source: 'production-panel-account-bootstrap' },
            requestId: null,
          }),
        );
      }
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          mustChangePassword: true,
          accounts: credentials.map(
            ({ fullName, username, role, phone, temporaryPassword }) => ({
              fullName,
              username,
              role,
              phone,
              temporaryPassword,
            }),
          ),
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
