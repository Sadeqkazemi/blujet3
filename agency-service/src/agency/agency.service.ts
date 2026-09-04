import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ErrorCode } from '../common/errors';
import {
  InvoicePage,
  InvoiceView,
  ProfileView,
  PortalInvoiceView,
  PortalProfileView,
} from './agency.dto';

const invoiceColumns = `id, "invoiceNo", "amountIrr"::text, status,
  to_char("issuedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "issuedAt",
  to_char("dueAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueAt",
  to_char("paidAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "paidAt"`;

@Injectable()
export class AgencyService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async portalProfile(
    agencyId: string,
    owner: string | undefined,
  ): Promise<PortalProfileView> {
    this.assertOwner(agencyId, owner);
    const unavailable = () =>
      new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'خواندن پروفایل از این سرویس در دسترس نیست.',
      });
    if (this.config.get<string>('AGENCY_PORTAL_PROFILE_ENABLED') !== 'true')
      throw unavailable();
    return this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      const rows = await tx.query<PortalProfileView[]>(
        `SELECT "userId" AS "agencyId", "managerName", "licenseNo", phone,
          email, city, address, tier, "suspendReason",
          to_char("joinedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "joinedAt",
          to_char("suspendedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "suspendedAt"
         FROM agency.agency_profiles WHERE "userId"=$1`,
        [agencyId],
      );
      const profile = rows[0];
      if (!profile)
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'پروفایل آژانس یافت نشد.',
        });
      if (
        Buffer.byteLength(JSON.stringify({ success: true, data: profile })) >
        64 * 1024
      )
        throw unavailable();
      return profile;
    });
  }

  async portalInvoices(
    agencyId: string,
    owner: string | undefined,
  ): Promise<PortalInvoiceView[]> {
    this.assertOwner(agencyId, owner);
    const unavailable = () =>
      new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'خواندن فاکتورها از این سرویس در دسترس نیست.',
      });
    if (this.config.get<string>('AGENCY_PORTAL_INVOICES_ENABLED') !== 'true')
      throw unavailable();
    return this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      await this.ownProfile(tx, agencyId);
      const rows = await tx.query<PortalInvoiceView[]>(
        `SELECT ${invoiceColumns}, "agencyId", "bookingId", "issuedById", "descriptionFa"
         FROM agency.agency_invoices WHERE "agencyId"=$1 ORDER BY "issuedAt" DESC LIMIT 1001`,
        [agencyId],
      );
      if (
        rows.length > 1000 ||
        Buffer.byteLength(JSON.stringify({ success: true, data: rows })) >
          1024 * 1024
      )
        throw unavailable();
      return rows;
    });
  }

  private assertOwner(agencyId: string, owner: string | undefined): void {
    if (agencyId !== owner)
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'دسترسی به اطلاعات این آژانس مجاز نیست.',
      });
  }

  private async ownProfile(
    tx: EntityManager,
    agencyId: string,
  ): Promise<ProfileView> {
    const rows = await tx.query<ProfileView[]>(
      `
      SELECT "userId" AS "agencyId", city, tier,
        to_char("joinedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "joinedAt",
        to_char("suspendedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "suspendedAt"
      FROM agency.agency_profiles WHERE "userId"=$1`,
      [agencyId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پروفایل آژانس یافت نشد.',
      });
    return rows[0];
  }

  async profile(
    agencyId: string,
    owner: string | undefined,
  ): Promise<ProfileView> {
    this.assertOwner(agencyId, owner);
    return this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      return this.ownProfile(tx, agencyId);
    });
  }

  async invoices(
    agencyId: string,
    owner: string | undefined,
    page: number,
  ): Promise<InvoicePage> {
    this.assertOwner(agencyId, owner);
    return this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      await this.ownProfile(tx, agencyId);
      const counts = await tx.query<Array<{ total: string }>>(
        'SELECT COUNT(*)::text AS total FROM agency.agency_invoices WHERE "agencyId"=$1',
        [agencyId],
      );
      const items = await tx.query<InvoiceView[]>(
        `
        SELECT ${invoiceColumns} FROM agency.agency_invoices WHERE "agencyId"=$1
        ORDER BY "issuedAt" DESC, id DESC LIMIT 10 OFFSET $2`,
        [agencyId, (page - 1) * 10],
      );
      return { items, total: counts[0].total, page, pageSize: 10 };
    });
  }

  async invoice(
    agencyId: string,
    owner: string | undefined,
    invoiceId: string,
  ): Promise<InvoiceView> {
    this.assertOwner(agencyId, owner);
    return this.db.transaction('REPEATABLE READ', async (tx) => {
      await tx.query('SET TRANSACTION READ ONLY');
      await this.ownProfile(tx, agencyId);
      const rows = await tx.query<InvoiceView[]>(
        `
        SELECT ${invoiceColumns} FROM agency.agency_invoices
        WHERE "agencyId"=$1 AND id=$2`,
        [agencyId, invoiceId],
      );
      if (!rows[0])
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'فاکتور یافت نشد.',
        });
      return rows[0];
    });
  }
}
