import {
  AgencyInvoiceStatus,
  type AggregateInvoiceStatus,
} from '../../database/enums';

/**
 * Wire mapping for GET /agencies/invoices.
 * OVERDUE is preserved in the DB and never mapped to VOIDED.
 */
export function toWireAggregateInvoiceStatus(
  status: AgencyInvoiceStatus,
): AggregateInvoiceStatus {
  if (status === AgencyInvoiceStatus.PAID) return 'PAID';
  if (status === AgencyInvoiceStatus.VOIDED) return 'VOIDED';
  return 'UNPAID';
}
