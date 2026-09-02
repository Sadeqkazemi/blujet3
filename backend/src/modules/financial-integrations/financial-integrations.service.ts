import {
  BadGatewayException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';
import { encryptPii, tryDecryptPii } from '../../common/pii-crypto';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';

export enum FinancialProvider {
  HOLO = 'HOLO',
  SEPIDAR = 'SEPIDAR',
  HESABFA = 'HESABFA',
  RAHKARAN = 'RAHKARAN',
  PARMIS = 'PARMIS',
}
export const FINANCIAL_PROVIDERS = Object.values(FinancialProvider);

const CATALOG: Record<
  FinancialProvider,
  { key: string; nameFa: string; descriptionFa: string }
> = {
  HOLO: {
    key: 'finance_holo',
    nameFa: 'هلو',
    descriptionFa: 'نرم‌افزار حسابداری فروشگاهی و مالی',
  },
  SEPIDAR: {
    key: 'finance_sepidar',
    nameFa: 'سپیدار سیستم',
    descriptionFa: 'سیستم یکپارچه مالی و انبارداری',
  },
  HESABFA: {
    key: 'finance_hesabfa',
    nameFa: 'حسابفا',
    descriptionFa: 'حسابداری آنلاین ابری',
  },
  RAHKARAN: {
    key: 'finance_rahkaran',
    nameFa: 'راهکاران',
    descriptionFa: 'ERP مالی و منابع انسانی',
  },
  PARMIS: {
    key: 'finance_parmis',
    nameFa: 'پارمیس',
    descriptionFa: 'نرم‌افزار حسابداری و دریافت و پرداخت',
  },
};

function configuredUrl(
  provider: FinancialProvider,
  purpose: 'VERIFY' | 'SYNC',
): string | null {
  const value = process.env[`FINANCE_${provider}_${purpose}_URL`]?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production')
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function headers(provider: FinancialProvider, apiKey: string): HeadersInit {
  const headerName =
    process.env[`FINANCE_${provider}_AUTH_HEADER`]?.trim() || 'Authorization';
  const scheme = process.env[`FINANCE_${provider}_AUTH_SCHEME`]?.trim();
  const value = scheme === '' ? apiKey : `${scheme ?? 'Bearer'} ${apiKey}`;
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    [headerName]: value,
  };
}

function maskedKey(encrypted: string | null): string | null {
  const plain = tryDecryptPii(encrypted);
  if (!plain) return null;
  return `••••••••${plain.slice(-4)}`;
}

@Injectable()
export class FinancialIntegrationsService {
  constructor(
    @InjectRepository(ExternalServiceConfig)
    private readonly configs: Repository<ExternalServiceConfig>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  private async rows() {
    const keys = FINANCIAL_PROVIDERS.map((provider) => CATALOG[provider].key);
    const existing = await this.configs
      .createQueryBuilder('config')
      .where('config.key IN (:...keys)', { keys })
      .getMany();
    return new Map(existing.map((row) => [row.key, row]));
  }

  async list() {
    const rows = await this.rows();
    const providers = FINANCIAL_PROVIDERS.map((provider) => {
      const definition = CATALOG[provider];
      const row = rows.get(definition.key);
      const connected = Boolean(
        row?.enabled && row.apiKeyEncrypted && row.lastTestOk,
      );
      return {
        provider,
        nameFa: definition.nameFa,
        descriptionFa: definition.descriptionFa,
        connected,
        maskedKey: connected ? maskedKey(row?.apiKeyEncrypted ?? null) : null,
        lastSyncedAt: row?.lastTestAt?.toISOString() ?? null,
        lastSyncOk: row?.lastTestOk ?? null,
        lastSyncMessage: row?.lastTestMessage ?? null,
        configured: Boolean(
          configuredUrl(provider, 'VERIFY') && configuredUrl(provider, 'SYNC'),
        ),
      };
    });
    return {
      providers,
      connectedCount: providers.filter((provider) => provider.connected).length,
    };
  }

  private async call(
    provider: FinancialProvider,
    purpose: 'VERIFY' | 'SYNC',
    apiKey: string,
    body?: unknown,
  ) {
    const url = configuredUrl(provider, purpose);
    if (!url) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `نشانی ${purpose === 'VERIFY' ? 'اعتبارسنجی' : 'همگام‌سازی'} ${CATALOG[provider].nameFa} در سرور تنظیم نشده است.`,
      });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: purpose === 'VERIFY' ? 'GET' : 'POST',
        headers: headers(provider, apiKey),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException({
          code: 'FINANCIAL_PROVIDER_REJECTED',
          message: `${CATALOG[provider].nameFa} پاسخ ناموفق HTTP ${response.status} برگرداند.`,
        });
      }
      return `پاسخ موفق HTTP ${response.status}`;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException({
        code: 'FINANCIAL_PROVIDER_UNAVAILABLE',
        message:
          error instanceof Error && error.name === 'AbortError'
            ? `مهلت ارتباط با ${CATALOG[provider].nameFa} به پایان رسید.`
            : `ارتباط با ${CATALOG[provider].nameFa} برقرار نشد.`,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect(
    actor: AuthenticatedUser,
    provider: FinancialProvider,
    apiKey: string,
  ) {
    const message = await this.call(provider, 'VERIFY', apiKey);
    const definition = CATALOG[provider];
    const existing = await this.configs.findOneBy({ key: definition.key });
    const now = new Date();
    const row = await this.configs.save(
      this.configs.create({
        ...(existing ?? {}),
        key: definition.key,
        nameFa: definition.nameFa,
        provider,
        endpoint: configuredUrl(provider, 'SYNC')!,
        method: 'POST',
        timeoutMs: 20_000,
        apiKeyEncrypted: encryptPii(apiKey),
        sandbox: false,
        enabled: true,
        lastTestAt: now,
        lastTestOk: true,
        lastTestMessage: message,
        updatedAt: now,
      }),
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'FINANCE',
      action: 'اتصال نرم‌افزار مالی',
      detail: `اتصال واقعی «${definition.nameFa}» توسط ${actor.fullName} تأیید شد.`,
      entityType: 'ExternalServiceConfig',
      entityId: row.id,
    });
    return this.list();
  }

  private async snapshot() {
    const [sales] = await this.dataSource.query<
      [{ totalIrr: string; bookingCount: string; passengerCount: string }]
    >(
      `SELECT
         (SELECT COALESCE(SUM(b."priceIrr" + b."taxIrr" + b."extrasIrr"), 0)::text FROM bookings b WHERE b.status IN ('PAID','TICKETED') AND b."deletedAt" IS NULL) AS "totalIrr",
         (SELECT COUNT(*)::text FROM bookings b WHERE b.status IN ('PAID','TICKETED') AND b."deletedAt" IS NULL) AS "bookingCount",
         (SELECT COUNT(*)::text FROM passengers p INNER JOIN bookings b ON b.id = p."bookingId" WHERE b.status IN ('PAID','TICKETED') AND b."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p."occupiesSeat" = true) AS "passengerCount"`,
    );
    return {
      generatedAt: new Date().toISOString(),
      currency: 'IRR',
      sales: {
        totalIrr: sales?.totalIrr ?? '0',
        bookingCount: Number(sales?.bookingCount ?? 0),
        passengerCount: Number(sales?.passengerCount ?? 0),
      },
    };
  }

  async sync(actor: AuthenticatedUser, provider: FinancialProvider) {
    const definition = CATALOG[provider];
    const row = await this.configs.findOneBy({ key: definition.key });
    const apiKey = tryDecryptPii(row?.apiKeyEncrypted);
    if (!row?.enabled || !row.lastTestOk || !apiKey) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: `ابتدا اتصال ${definition.nameFa} را برقرار کنید.`,
      });
    }
    try {
      const message = await this.call(
        provider,
        'SYNC',
        apiKey,
        await this.snapshot(),
      );
      await this.configs.update(
        { id: row.id },
        {
          lastTestAt: new Date(),
          lastTestOk: true,
          lastTestMessage: message,
          updatedAt: new Date(),
        },
      );
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'FINANCE',
        action: 'همگام‌سازی نرم‌افزار مالی',
        detail: `اطلاعات مالی با «${definition.nameFa}» توسط ${actor.fullName} همگام شد.`,
        entityType: 'ExternalServiceConfig',
        entityId: row.id,
      });
    } catch (error) {
      await this.configs.update(
        { id: row.id },
        {
          lastTestAt: new Date(),
          lastTestOk: false,
          lastTestMessage: 'همگام‌سازی ناموفق بود.',
          updatedAt: new Date(),
        },
      );
      throw error;
    }
    return this.list();
  }

  async disconnect(actor: AuthenticatedUser, provider: FinancialProvider) {
    const definition = CATALOG[provider];
    const row = await this.configs.findOneBy({ key: definition.key });
    if (row) {
      await this.configs.update(
        { id: row.id },
        {
          apiKeyEncrypted: null,
          enabled: false,
          lastTestAt: new Date(),
          lastTestOk: false,
          lastTestMessage: 'اتصال توسط مدیر مالی قطع شد.',
          updatedAt: new Date(),
        },
      );
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        category: 'FINANCE',
        action: 'قطع اتصال نرم‌افزار مالی',
        detail: `اتصال «${definition.nameFa}» توسط ${actor.fullName} قطع شد.`,
        entityType: 'ExternalServiceConfig',
        entityId: row.id,
      });
    }
    return this.list();
  }
}
