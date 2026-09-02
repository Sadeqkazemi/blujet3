import { AgencyInvoiceStatus } from '../../database/enums';
import { toWireAggregateInvoiceStatus } from './agency-invoice-aggregate';

describe('toWireAggregateInvoiceStatus', () => {
  it('keeps PAID and VOIDED, and maps OVERDUE to UNPAID rather than VOIDED', () => {
    expect(toWireAggregateInvoiceStatus(AgencyInvoiceStatus.PAID)).toBe('PAID');
    expect(toWireAggregateInvoiceStatus(AgencyInvoiceStatus.VOIDED)).toBe(
      'VOIDED',
    );
    expect(toWireAggregateInvoiceStatus(AgencyInvoiceStatus.UNPAID)).toBe(
      'UNPAID',
    );
    expect(toWireAggregateInvoiceStatus(AgencyInvoiceStatus.OVERDUE)).toBe(
      'UNPAID',
    );
  });
});
