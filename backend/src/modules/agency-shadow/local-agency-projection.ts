import { DataSource } from 'typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import {
  validateSample,
  type AgencyProjection,
  type ProfileProjection,
  type InvoiceProjection,
} from './agency-shadow';

/** Independent ORM projection for offline comparison, never portal authorization. */
export async function readLocalAgency(
  db: DataSource,
  agencyId: string,
  page: number,
  invoiceId?: string,
): Promise<AgencyProjection> {
  validateSample(agencyId, page, invoiceId);
  return db.transaction('REPEATABLE READ', async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY');
    const profile = await tx
      .getRepository(AgencyProfile)
      .createQueryBuilder('profile')
      .select('profile.userId', 'agencyId')
      .addSelect('profile.city', 'city')
      .addSelect('profile.tier', 'tier')
      .addSelect(
        `to_char(profile.joinedAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'joinedAt',
      )
      .addSelect(
        `to_char(profile.suspendedAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'suspendedAt',
      )
      .where('profile.userId = :agencyId', { agencyId })
      .getRawOne<ProfileProjection>();
    if (!profile)
      return {
        profile: null,
        invoices: null,
        ...(invoiceId === undefined ? {} : { invoice: null }),
      };
    const count = await tx
      .getRepository(AgencyInvoice)
      .createQueryBuilder('invoice')
      .select('COUNT(*)::text', 'total')
      .where('invoice.agencyId = :agencyId', { agencyId })
      .getRawOne<{ total: string }>();
    const invoiceQuery = tx
      .getRepository(AgencyInvoice)
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNo', 'invoiceNo')
      .addSelect('"invoice"."amountIrr"::text', 'amountIrr')
      .addSelect('invoice.status', 'status')
      .addSelect(
        `to_char(invoice.issuedAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'issuedAt',
      )
      .addSelect(
        `to_char(invoice.dueAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'dueAt',
      )
      .addSelect(
        `to_char(invoice.paidAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'paidAt',
      )
      .where('invoice.agencyId = :agencyId', { agencyId });
    const items = await invoiceQuery
      .clone()
      .orderBy('invoice.issuedAt', 'DESC')
      .addOrderBy('invoice.id', 'DESC')
      .limit(10)
      .offset((page - 1) * 10)
      .getRawMany<InvoiceProjection>();
    if (!count) throw new Error('Agency count unavailable');
    const selected =
      invoiceId === undefined
        ? undefined
        : await invoiceQuery
            .clone()
            .andWhere('invoice.id = :invoiceId', { invoiceId })
            .getRawOne<InvoiceProjection>();
    return {
      profile,
      invoices: { items, total: count.total, page, pageSize: 10 },
      ...(invoiceId === undefined ? {} : { invoice: selected ?? null }),
    };
  });
}
