import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import { User } from './entities/user.entity';
import { AgencyProfile } from './entities/agency-profile.entity';
import { AgencyCreditLine } from './entities/agency-credit-line.entity';
import { WalletEntry } from './entities/wallet-entry.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RefundPenaltyRule } from './entities/refund-penalty-rule.entity';
import { AgencyTier, WalletEntryType } from './enums';

const CONFIRMATION = 'PROVISION_UAT_SANDBOX_COMMERCE_V1';
const SANDBOX_BALANCE_IRR = 1_000_000_000n; // 100,000,000 toman

const WALLET_GRANTS = [
  { username: 'uat.customer', id: 'uat-customer-wallet-grant-v1' },
  { username: 'uat.agency', id: 'uat-agency-wallet-grant-v1' },
] as const;

async function main(): Promise<void> {
  if (!process.argv.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({
        mode: 'DRY_RUN',
        accounts: WALLET_GRANTS.map(({ username }) => username),
        balanceIrr: SANDBOX_BALANCE_IRR.toString(),
      })}\n`,
    );
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Provision refused: NODE_ENV must equal production.');
  }
  if (process.env.UAT_COMMERCE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Provision refused: UAT_COMMERCE_CONFIRM must equal ${CONFIRMATION}.`,
    );
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const result = await dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const walletRepo = manager.getRepository(WalletEntry);
      const profileRepo = manager.getRepository(AgencyProfile);
      const creditRepo = manager.getRepository(AgencyCreditLine);
      const auditRepo = manager.getRepository(AuditLog);
      const refundRuleRepo = manager.getRepository(RefundPenaltyRule);

      const customer = await userRepo.findOneBy({ username: 'uat.customer' });
      const agency = await userRepo.findOneBy({ username: 'uat.agency' });
      if (!customer || customer.role !== 'USER') {
        throw new Error(
          'Provision refused: uat.customer USER account missing.',
        );
      }
      if (!agency || agency.role !== 'AGENCY' || !agency.phone) {
        throw new Error(
          'Provision refused: uat.agency AGENCY account missing.',
        );
      }

      await profileRepo.save(
        profileRepo.create({
          userId: agency.id,
          licenseNo: 'UAT-SANDBOX-AGENCY-001',
          managerName: 'UAT Sandbox Manager',
          phone: agency.phone,
          email: 'uat-agency@blujet.example',
          city: 'تهران',
          address: 'محیط آزمایشی UAT',
          tier: AgencyTier.GOLD,
          suspendedAt: null,
          suspendReason: null,
        }),
      );
      await creditRepo.save(
        creditRepo.create({
          agencyId: agency.id,
          limitIrr: SANDBOX_BALANCE_IRR,
          updatedById: null,
          updatedAt: new Date(),
        }),
      );

      const usersByUsername = new Map([
        ['uat.customer', customer],
        ['uat.agency', agency],
      ]);
      const grants: string[] = [];
      for (const grant of WALLET_GRANTS) {
        if (await walletRepo.exist({ where: { id: grant.id } })) continue;
        const user = usersByUsername.get(grant.username)!;
        await walletRepo.save(
          walletRepo.create({
            id: grant.id,
            userId: user.id,
            type: WalletEntryType.ADJUST,
            signedAmountIrr: SANDBOX_BALANCE_IRR,
            bookingId: null,
          }),
        );
        grants.push(grant.username);
      }

      if ((await refundRuleRepo.count()) === 0) {
        await refundRuleRepo.save(
          [
            [72, 30, 'بیش از ۷۲ ساعت مانده به پرواز'],
            [24, 50, 'بین ۲۴ تا ۷۲ ساعت مانده'],
            [3, 70, 'بین ۳ تا ۲۴ ساعت مانده'],
            [0, 100, 'کمتر از ۳ ساعت / پس از پرواز'],
          ].map(([minHoursBeforeDeparture, penaltyPct, labelFa]) =>
            refundRuleRepo.create({
              minHoursBeforeDeparture: Number(minHoursBeforeDeparture),
              penaltyPct: Number(penaltyPct),
              labelFa: String(labelFa),
            }),
          ),
        );
      }

      await auditRepo.save(
        auditRepo.create({
          actorId: agency.id,
          actorRole: agency.role,
          category: 'FINANCE',
          action: 'فعال‌سازی خرید آزمایشی UAT',
          detail:
            'پروفایل عملیاتی آژانس، خط اعتبار و کیف پول‌های آزمایشی مشتری و آژانس فعال شد.',
          entityType: 'AgencyProfile',
          entityId: agency.id,
          metadata: {
            source: 'provision-uat-sandbox-commerce-v1',
            balanceIrr: SANDBOX_BALANCE_IRR.toString(),
            walletGrantsCreated: grants,
          },
          requestId: null,
        }),
      );

      return { agencyId: agency.id, walletGrantsCreated: grants };
    });
    process.stdout.write(`${JSON.stringify({ success: true, ...result })}\n`);
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
