import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const AGGREGATE_INVOICE_STATUSES = ['UNPAID', 'PAID', 'VOIDED'] as const;
export type AggregateInvoiceStatusFilter =
  (typeof AGGREGATE_INVOICE_STATUSES)[number];

export class ListAggregateInvoicesQueryDto {
  @ApiPropertyOptional({
    enum: AGGREGATE_INVOICE_STATUSES,
    description:
      'صادرشده (UNPAID، شامل OVERDUE داخلی) / پرداخت‌شده / باطل‌شده. OVERDUE هرگز VOIDED نیست.',
  })
  @IsOptional()
  @IsIn(AGGREGATE_INVOICE_STATUSES)
  status?: AggregateInvoiceStatusFilter;
}
