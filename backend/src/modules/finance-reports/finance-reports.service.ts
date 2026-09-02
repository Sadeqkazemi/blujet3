import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import {
  FinanceExportFormat,
  FinanceReportQueryDto,
  FinanceReportScope,
  FinanceFlightSearchQueryDto,
  FinanceSalesQueryDto,
} from './dto/finance-report-query.dto';
import { buildFinanceXlsx, financeXlsxContentType } from './xlsx-export';

type RawPartner = {
  id: string;
  name: string;
  totalIrr: string;
  agencyOutstandingIrr: string;
  agencySalesIrr: string;
  soldSeats: string;
};

type RawFlight = {
  flightInstanceId: string;
  flightNo: string;
  departureAt: Date | string;
  originCode: string;
  destCode: string;
  originCityFa: string | null;
  destCityFa: string | null;
  capacity: string;
  soldSeats: string;
  totalIrr: string;
  agencyCount: string;
  agencySeats: string;
};

type RawSale = {
  bookingId: string;
  pnr: string;
  bookedAt: Date | string;
  bookingStatus: string;
  channel: string;
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: Date | string;
  arrivalAt: Date | string;
  cabin: string;
  fareClassCode: string | null;
  passengerCount: string;
  baseFareIrr: string;
  taxIrr: string;
  extrasIrr: string;
  totalIrr: string;
  agencyId: string | null;
  agencyName: string | null;
};

type SalesReportOptions = {
  /** Exporters must include every row matching the server-side filters. */
  unbounded?: boolean;
};

const PAID_BOOKING_STATUSES = ['PAID', 'TICKETED'];

function bigintString(
  value: string | number | bigint | null | undefined,
): string {
  return String(value ?? '0');
}

function escapeCsv(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapePdfText(value: string | number): string {
  return String(value)
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

type RtrdLine = {
  no: number;
  code: string;
  description: string;
  debit: bigint;
  credit: bigint;
};

type RtrdSaleRow = {
  bookedAt: string;
  paymentStatus: string;
  passengerCount: number;
  baseFareIrr: string;
  taxIrr: string;
  extrasIrr: string;
};

function formatRtrdAmount(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.00`;
}

function pdfText(
  commands: string[],
  value: string | number,
  x: number,
  y: number,
  size = 9,
  bold = false,
) {
  commands.push(
    'BT',
    `/${bold ? 'F2' : 'F1'} ${size} Tf`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${escapePdfText(value)}) Tj`,
    'ET',
  );
}

function rightPdfText(
  commands: string[],
  value: string | number,
  right: number,
  y: number,
  size = 9,
  bold = false,
) {
  const text = String(value);
  pdfText(
    commands,
    text,
    Math.max(0, right - text.length * size * 0.51),
    y,
    size,
    bold,
  );
}

function drawBlujetLogo(commands: string[]) {
  commands.push('q', '0.086 0.408 0.769 rg', '451 744 38 38 re', 'f', 'Q');
  commands.push(
    'q',
    '1 1 1 rg',
    '470 750 m',
    '473 753 l',
    '473 761 l',
    '485 768 l',
    '485 772 l',
    '473 768 l',
    '473 776 l',
    '477 779 l',
    '477 782 l',
    '470 780 l',
    '463 782 l',
    '463 779 l',
    '467 776 l',
    '467 768 l',
    '455 772 l',
    '455 768 l',
    '467 761 l',
    '467 753 l',
    'h',
    'f',
    'Q',
  );
  pdfText(commands, 'blujet', 495, 758, 17, true);
}

function tableHeader(commands: string[], y: number) {
  commands.push('0.7 G', `48 ${y - 6} m`, `548 ${y - 6} l`, 'S', '0 G');
  pdfText(commands, 'No', 55, y, 8, true);
  pdfText(commands, 'Code', 106, y, 8, true);
  pdfText(commands, 'Description', 202, y, 8, true);
  pdfText(commands, 'Debit', 389, y, 8, true);
  pdfText(commands, 'Credit', 472, y, 8, true);
  pdfText(commands, 'CUR', 530, y, 8, true);
}

function drawRtrdRow(commands: string[], line: RtrdLine, y: number) {
  pdfText(commands, line.no, 58, y, 7.7, true);
  pdfText(commands, line.code, 101, y, 7.7, line.no === 22);
  pdfText(
    commands,
    line.description,
    190,
    y,
    line.no === 22 ? 10 : 7.5,
    line.no === 22,
  );
  rightPdfText(
    commands,
    formatRtrdAmount(line.debit),
    452,
    y,
    7.5,
    line.no === 22,
  );
  rightPdfText(
    commands,
    formatRtrdAmount(line.credit),
    527,
    y,
    7.5,
    line.no === 22,
  );
  pdfText(commands, 'IRR', 534, y, 7.5, line.no === 22);
  commands.push('0.9 G', `48 ${y - 6} m`, `548 ${y - 6} l`, 'S', '0 G');
}

function buildRtrdLines(rows: RtrdSaleRow[]): RtrdLine[] {
  const paid = rows.filter((row) => row.paymentStatus === 'PAID');
  const refunded = rows.filter((row) => row.paymentStatus === 'REFUNDED');
  const sum = (
    source: typeof rows,
    key: 'baseFareIrr' | 'taxIrr' | 'extrasIrr',
  ) => source.reduce((total, row) => total + BigInt(row[key]), 0n);
  const paidBase = sum(paid, 'baseFareIrr') + sum(paid, 'extrasIrr');
  const paidTax = sum(paid, 'taxIrr');
  const refundBase = sum(refunded, 'baseFareIrr') + sum(refunded, 'extrasIrr');
  const refundTax = sum(refunded, 'taxIrr');
  const creditBeforeSettlement = paidBase + paidTax;
  const debitBeforeSettlement = refundBase + refundTax;
  const totalPaid =
    creditBeforeSettlement >= debitBeforeSettlement
      ? creditBeforeSettlement - debitBeforeSettlement
      : 0n;
  const totalPayable =
    debitBeforeSettlement > creditBeforeSettlement
      ? debitBeforeSettlement - creditBeforeSettlement
      : 0n;
  const paidCount = paid.reduce((total, row) => total + row.passengerCount, 0);
  const refundCount = refunded.reduce(
    (total, row) => total + row.passengerCount,
    0,
  );
  const line = (
    no: number,
    code: string,
    description: string,
    debit = 0n,
    credit = 0n,
  ): RtrdLine => ({ no, code, description, debit, credit });
  return [
    line(1, 'Sales', `Total Sales for ${paidCount} Tickets`, 0n, paidBase),
    line(2, 'SalesTax-HL', `Total HL Sales Tax for ${paidCount} Tickets`),
    line(3, 'SalesTax-I6', `Total I6 Sales Tax for ${paidCount} Tickets`),
    line(
      4,
      'SalesTax-IR',
      `Total IR Sales Tax for ${paidCount} Tickets`,
      0n,
      paidTax,
    ),
    line(5, 'SalesTax-LP', `Total LP Sales Tax for ${paidCount} Tickets`),
    line(6, 'SalesTax-RI', `Total RI Sales Tax for ${paidCount} Tickets`),
    line(7, 'SalesTax-V0', `Total V0 Sales Tax for ${paidCount} Tickets`),
    line(8, 'SalesTax-YQ', `Total YQ Sales Tax for ${paidCount} Tickets`),
    line(
      9,
      'RefundFare',
      `Total Ticket Refund for ${refundCount} Tickets`,
      refundBase,
    ),
    line(10, 'RefundTax-HL', `Total HL Refund Tax for ${refundCount} Tickets`),
    line(11, 'RefundTax-I6', `Total I6 Refund Tax for ${refundCount} Tickets`),
    line(
      12,
      'RefundTax-IR',
      `Total IR Refund Tax for ${refundCount} Tickets`,
      refundTax,
    ),
    line(13, 'RefundTax-LP', `Total LP Refund Tax for ${refundCount} Tickets`),
    line(14, 'RefundTax-RI', `Total RI Refund Tax for ${refundCount} Tickets`),
    line(15, 'RefundTax-V0', `Total V0 Refund Tax for ${refundCount} Tickets`),
    line(16, 'RefundTax-YQ', `Total YQ Refund Tax for ${refundCount} Tickets`),
    line(17, 'CRCN', `Total Agent CRCN for ${refundCount} Tickets`),
    line(
      18,
      'SalesCommission',
      `Total Sales Commission for ${paidCount} Tickets`,
    ),
    line(
      19,
      'RefundCommission',
      `Total Refund Commission for ${refundCount} Tickets`,
    ),
    line(20, 'TotalVAT', 'Total VAT'),
    line(21, 'TotalPaid', 'Total Paid', totalPaid),
    line(22, 'TotalPayable', 'Total Payable', 0n, totalPayable),
  ];
}

function buildRtrdPdf(
  rows: RtrdSaleRow[],
  options: { from?: string; to?: string; salesType?: string } = {},
): Buffer {
  const lines = buildRtrdLines(rows);
  const generated = new Date();
  const firstDate =
    options.from ?? rows.at(-1)?.bookedAt ?? generated.toISOString();
  const lastDate = options.to ?? rows[0]?.bookedAt ?? generated.toISOString();
  const reportNo = generated.toISOString().replace(/\D/g, '').slice(2, 14);
  const page1: string[] = [];
  pdfText(page1, 'Blujet', 48, 759, 16, true);
  drawBlujetLogo(page1);
  pdfText(page1, 'NIRA-PRA', 48, 705, 12, true);
  pdfText(page1, 'RTRD', 137, 705, 12, true);
  pdfText(page1, 'BLJ001', 355, 705, 12, true);
  pdfText(page1, 'BLUJET AIRLINE', 430, 705, 11, true);
  page1.push('0 G', '48 698 m', '548 698 l', 'S');
  const meta = [
    [
      'User:',
      'BLUJET.FINANCE',
      'Time:',
      generated.toISOString().replace('T', ' ').slice(0, 19),
    ],
    ['RTRD From:', firstDate.slice(0, 10), 'RTRD To:', lastDate.slice(0, 10)],
    ['Report Number:', reportNo, 'Sales Type:', options.salesType ?? 'All'],
    ['Journey Type:', 'All', 'Ticket Type:', 'All'],
  ];
  meta.forEach((entry, index) => {
    const y = 675 - index * 21;
    pdfText(page1, entry[0], 48, y, 8.5, true);
    pdfText(page1, entry[1], 137, y, 8.5, index === 0);
    pdfText(page1, entry[2], 355, y, 8.5, true);
    pdfText(page1, entry[3], 430, y, 8.5, index === 0);
  });
  page1.push('0 G', '48 580 m', '548 580 l', 'S');
  tableHeader(page1, 565);
  lines
    .slice(0, 20)
    .forEach((line, index) => drawRtrdRow(page1, line, 538 - index * 23));
  pdfText(page1, 'Blujet Financial Reporting Engine', 405, 35, 7, true);

  const page2: string[] = [];
  tableHeader(page2, 780);
  drawRtrdRow(page2, lines[20], 750);
  drawRtrdRow(page2, lines[21], 722);
  const totalDebit = lines.reduce((total, line) => total + line.debit, 0n);
  const totalCredit = lines.reduce((total, line) => total + line.credit, 0n);
  pdfText(page2, 'Total Debit:', 48, 675, 14);
  rightPdfText(page2, formatRtrdAmount(totalDebit), 300, 675, 14);
  page2.push('0 G', '303 662 m', '303 700 l', 'S');
  pdfText(page2, 'Total Credit:', 328, 675, 14);
  rightPdfText(page2, formatRtrdAmount(totalCredit), 548, 675, 14);
  page2.push('0.85 G', '48 640 500 26 re', 'S', '0 G');
  pdfText(page2, 'Powered by Blujet', 454, 618, 8, true);

  const pageStreams = [page1.join('\n'), page2.join('\n')];
  const fontRegularId = 3 + pageStreams.length * 2;
  const fontBoldId = fontRegularId + 1;
  const pageIds = pageStreams.map((_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
  ];
  pageStreams.forEach((commands, index) => {
    const contentId = pageIds[index] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'ascii');
}

@Injectable()
export class FinanceReportsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private assertRange(query: FinanceReportQueryDto) {
    if ((query.from && !query.to) || (!query.from && query.to)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'ابتدا و انتهای بازه باید با هم ارسال شوند.',
      });
    }
    if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'انتهای بازه باید بعد از ابتدای آن باشد.',
      });
    }
  }

  private applyRange(
    qb: ReturnType<DataSource['createQueryBuilder']>,
    query: FinanceReportQueryDto,
  ) {
    if (query.from && query.to) {
      qb.andWhere('fi."departureAt" >= :from AND fi."departureAt" < :to', {
        from: query.from,
        to: query.to,
      });
    }
    if (query.flightInstanceId) {
      qb.andWhere('fi.id = :flightInstanceId', {
        flightInstanceId: query.flightInstanceId,
      });
    }
  }

  async report(query: FinanceReportQueryDto) {
    this.assertRange(query);
    if (query.scope === FinanceReportScope.CUSTOMERS)
      return this.customerReport(query);
    return this.partnerReport(query);
  }

  private async partnerReport(query: FinanceReportQueryDto) {
    const channel =
      query.scope === FinanceReportScope.AGENCIES ? 'AGENCY' : 'CHARTER';
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(ap."userId", :fallbackId)', 'id')
      .addSelect('COALESCE(u."fullName", :fallbackName)', 'name')
      .addSelect('COALESCE(SUM(b."priceIrr"), 0)', 'totalIrr')
      .addSelect(
        `COALESCE((SELECT GREATEST(SUM(le."signedAmountIrr"), 0) FROM ledger_entries le WHERE le."agencyId" = ap."userId" AND le.type IN ('SALE','SETTLEMENT')), 0)`,
        'agencyOutstandingIrr',
      )
      .addSelect(
        `COALESCE((SELECT SUM(ABS(le."signedAmountIrr")) FROM ledger_entries le WHERE le."agencyId" = ap."userId" AND le.type = 'SALE'), 0)`,
        'agencySalesIrr',
      )
      .addSelect(
        'COALESCE(SUM((SELECT COUNT(*) FROM passengers p WHERE p."bookingId" = b.id AND p."deletedAt" IS NULL AND p."occupiesSeat" = true)), 0)',
        'soldSeats',
      )
      .from('bookings', 'b')
      .innerJoin('flight_instances', 'fi', 'fi.id = b."flightInstanceId"')
      .leftJoin('agency_profiles', 'ap', 'ap."userId" = b."agencyId"')
      .leftJoin('users', 'u', 'u.id = ap."userId"');
    if (query.scope === FinanceReportScope.AGENCIES) {
      qb.where('b."agencyId" IS NOT NULL');
    } else {
      qb.where('b.channel = :channel', { channel });
    }
    qb.andWhere('b.status IN (:...statuses)', {
      statuses: PAID_BOOKING_STATUSES,
    })
      .andWhere('b."deletedAt" IS NULL')
      .setParameters({
        fallbackId: channel,
        fallbackName: channel === 'CHARTER' ? 'فروش چارتر' : 'فروش آژانسی',
      })
      .groupBy('ap."userId"')
      .addGroupBy('u."fullName"')
      .orderBy('"totalIrr"', 'DESC');
    this.applyRange(qb, query);
    const raw = await qb.getRawMany<RawPartner>();
    const rows = raw.map((row) => {
      const total = BigInt(bigintString(row.totalIrr));
      const agencySales = BigInt(bigintString(row.agencySalesIrr));
      const agencyOutstanding = BigInt(bigintString(row.agencyOutstandingIrr));
      const outstanding =
        row.id === channel || agencySales === 0n
          ? 0n
          : (total * agencyOutstanding) / agencySales;
      const paid = total > outstanding ? total - outstanding : 0n;
      return {
        id: row.id,
        name: row.name,
        totalIrr: total.toString(),
        paidIrr: paid.toString(),
        outstandingIrr: outstanding.toString(),
        soldSeats: Number(row.soldSeats),
      };
    });
    return {
      kind: 'partners' as const,
      scope: query.scope,
      period: query.period,
      rows,
      summary: {
        totalIrr: rows
          .reduce((sum, row) => sum + BigInt(row.totalIrr), 0n)
          .toString(),
        paidIrr: rows
          .reduce((sum, row) => sum + BigInt(row.paidIrr), 0n)
          .toString(),
      },
    };
  }

  private async customerReport(query: FinanceReportQueryDto) {
    const qb = this.flightBaseQuery();
    this.applyRange(qb, query);
    const raw = await qb
      .orderBy('fi."departureAt"', 'DESC')
      .limit(200)
      .getRawMany<RawFlight>();
    const rows = raw.map((row) => this.toFlight(row));
    return {
      kind: 'customers' as const,
      scope: query.scope,
      period: query.period,
      rows,
      summary: {
        totalIrr: rows
          .reduce((sum, row) => sum + BigInt(row.totalIrr), 0n)
          .toString(),
        soldSeats: rows.reduce((sum, row) => sum + row.soldSeats, 0),
      },
    };
  }

  private flightBaseQuery() {
    return this.dataSource
      .createQueryBuilder()
      .select('fi.id', 'flightInstanceId')
      .addSelect('f."flightNo"', 'flightNo')
      .addSelect('fi."departureAt"', 'departureAt')
      .addSelect('r."originCode"', 'originCode')
      .addSelect('r."destCode"', 'destCode')
      .addSelect('oa."cityFa"', 'originCityFa')
      .addSelect('da."cityFa"', 'destCityFa')
      .addSelect('fi.capacity', 'capacity')
      .addSelect(
        `(SELECT COUNT(*) FROM passengers p INNER JOIN bookings b ON b.id = p."bookingId" WHERE b."flightInstanceId" = fi.id AND b.status IN ('PAID','TICKETED') AND b."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p."occupiesSeat" = true)`,
        'soldSeats',
      )
      .addSelect(
        `(SELECT COALESCE(SUM(b."priceIrr"), 0) FROM bookings b WHERE b."flightInstanceId" = fi.id AND b.status IN ('PAID','TICKETED') AND b."deletedAt" IS NULL)`,
        'totalIrr',
      )
      .addSelect(
        `(SELECT COUNT(DISTINCT b."agencyId") FROM bookings b WHERE b."flightInstanceId" = fi.id AND b.status IN ('PAID','TICKETED') AND b."agencyId" IS NOT NULL AND b."deletedAt" IS NULL)`,
        'agencyCount',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM passengers p INNER JOIN bookings b ON b.id = p."bookingId" WHERE b."flightInstanceId" = fi.id AND b.status IN ('PAID','TICKETED') AND b."agencyId" IS NOT NULL AND b."deletedAt" IS NULL AND p."deletedAt" IS NULL AND p."occupiesSeat" = true)`,
        'agencySeats',
      )
      .from('flight_instances', 'fi')
      .innerJoin('flights', 'f', 'f.id = fi."flightId"')
      .innerJoin('routes', 'r', 'r.id = f."routeId"')
      .leftJoin('airports', 'oa', 'oa.code = r."originCode"')
      .leftJoin('airports', 'da', 'da.code = r."destCode"')
      .where('fi."departureAt" <= NOW()')
      .groupBy('fi.id')
      .addGroupBy('f."flightNo"')
      .addGroupBy('r."originCode"')
      .addGroupBy('r."destCode"')
      .addGroupBy('oa."cityFa"')
      .addGroupBy('da."cityFa"');
  }

  private toFlight(row: RawFlight) {
    return {
      flightInstanceId: row.flightInstanceId,
      flightNo: row.flightNo,
      departureAt: new Date(row.departureAt).toISOString(),
      originCode: row.originCode,
      destCode: row.destCode,
      originCityFa: row.originCityFa ?? row.originCode,
      destCityFa: row.destCityFa ?? row.destCode,
      capacity: Number(row.capacity),
      soldSeats: Number(row.soldSeats),
      unsoldSeats: Math.max(0, Number(row.capacity) - Number(row.soldSeats)),
      totalIrr: bigintString(row.totalIrr),
      agencyCount: Number(row.agencyCount),
      agencySeats: Number(row.agencySeats),
    };
  }

  async searchFlights(query: FinanceFlightSearchQueryDto) {
    const qb = this.flightBaseQuery();
    if (query.q?.trim()) {
      qb.andWhere(
        `(f."flightNo" ILIKE :q OR r."originCode" ILIKE :q OR r."destCode" ILIKE :q OR oa."cityFa" ILIKE :q OR da."cityFa" ILIKE :q)`,
        { q: `%${query.q.trim()}%` },
      );
    }
    if (query.from && query.to) {
      qb.andWhere('fi."departureAt" >= :from AND fi."departureAt" < :to', {
        from: query.from,
        to: query.to,
      });
    }
    const rows = await qb
      .orderBy('fi."departureAt"', 'DESC')
      .limit(query.limit ?? 12)
      .getRawMany<RawFlight>();
    return { rows: rows.map((row) => this.toFlight(row)) };
  }

  async flightDetail(flightInstanceId: string) {
    const summaryRaw = await this.flightBaseQuery()
      .andWhere('fi.id = :flightInstanceId', { flightInstanceId })
      .getRawOne<RawFlight>();
    if (!summaryRaw) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد.',
      });
    }
    const agencies = await this.dataSource
      .createQueryBuilder()
      .select('ap."userId"', 'agencyId')
      .addSelect('u."fullName"', 'agencyName')
      .addSelect(
        'COALESCE(SUM((SELECT COUNT(*) FROM passengers p WHERE p."bookingId" = b.id AND p."deletedAt" IS NULL AND p."occupiesSeat" = true)), 0)',
        'soldSeats',
      )
      .addSelect('COALESCE(SUM(b."priceIrr"), 0)', 'salesIrr')
      .addSelect(
        `COALESCE((SELECT GREATEST(SUM(le."signedAmountIrr"), 0) FROM ledger_entries le WHERE le."agencyId" = ap."userId" AND le.type IN ('SALE','SETTLEMENT')), 0)`,
        'agencyOutstandingIrr',
      )
      .addSelect(
        `COALESCE((SELECT SUM(ABS(le."signedAmountIrr")) FROM ledger_entries le WHERE le."agencyId" = ap."userId" AND le.type = 'SALE'), 0)`,
        'agencySalesIrr',
      )
      .from('bookings', 'b')
      .innerJoin('agency_profiles', 'ap', 'ap."userId" = b."agencyId"')
      .innerJoin('users', 'u', 'u.id = ap."userId"')
      .where('b."flightInstanceId" = :flightInstanceId', { flightInstanceId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: PAID_BOOKING_STATUSES,
      })
      .groupBy('ap."userId"')
      .addGroupBy('u."fullName"')
      .orderBy('"salesIrr"', 'DESC')
      .getRawMany<{
        agencyId: string;
        agencyName: string;
        soldSeats: string;
        salesIrr: string;
        agencyOutstandingIrr: string;
        agencySalesIrr: string;
      }>();
    const agencyRows = agencies.map((row) => {
      const sales = BigInt(bigintString(row.salesIrr));
      const agencySales = BigInt(bigintString(row.agencySalesIrr));
      const agencyOutstanding = BigInt(bigintString(row.agencyOutstandingIrr));
      const outstanding =
        agencySales === 0n ? 0n : (sales * agencyOutstanding) / agencySales;
      const paid = sales > outstanding ? sales - outstanding : 0n;
      return {
        ...row,
        soldSeats: Number(row.soldSeats),
        salesIrr: sales.toString(),
        paidIrr: paid.toString(),
        outstandingIrr: outstanding.toString(),
      };
    });
    const sales = await this.salesReport({ flightInstanceId, limit: 1000 });
    return {
      summary: this.toFlight(summaryRaw),
      agencies: agencyRows,
      bookings: sales.rows,
    };
  }

  private assertPairedRange(from?: string, to?: string, label = 'بازه') {
    if ((from && !to) || (!from && to)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `ابتدا و انتهای ${label} باید با هم ارسال شوند.`,
      });
    }
    if (from && to && new Date(from) >= new Date(to)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `انتهای ${label} باید بعد از ابتدای آن باشد.`,
      });
    }
  }

  private paymentStatusFor(bookingStatus: string) {
    if (bookingStatus === 'REFUNDED') return 'REFUNDED';
    if (['PAID', 'TICKETED', 'FLOWN', 'NO_SHOW'].includes(bookingStatus))
      return 'PAID';
    if (['CANCELLED', 'EXPIRED'].includes(bookingStatus)) return 'CANCELLED';
    return 'PENDING';
  }

  async salesReport(
    query: FinanceSalesQueryDto,
    options: SalesReportOptions = {},
  ) {
    this.assertPairedRange(query.bookedFrom, query.bookedTo, 'تاریخ رزرو');
    this.assertPairedRange(query.flightFrom, query.flightTo, 'تاریخ پرواز');
    const qb = this.dataSource
      .createQueryBuilder()
      .select('b.id', 'bookingId')
      .addSelect('b.pnr', 'pnr')
      .addSelect('b."createdAt"', 'bookedAt')
      .addSelect('b.status', 'bookingStatus')
      .addSelect(
        `CASE WHEN b."agencyId" IS NOT NULL THEN 'AGENCY' ELSE b.channel::text END`,
        'channel',
      )
      .addSelect('fi.id', 'flightInstanceId')
      .addSelect('f."flightNo"', 'flightNo')
      .addSelect('r."originCode"', 'originCode')
      .addSelect('r."destCode"', 'destCode')
      .addSelect('fi."departureAt"', 'departureAt')
      .addSelect('fi."arrivalAt"', 'arrivalAt')
      .addSelect('b.cabin', 'cabin')
      .addSelect('b."fareClassCode"', 'fareClassCode')
      .addSelect(
        '(SELECT COUNT(*) FROM passengers p WHERE p."bookingId" = b.id AND p."deletedAt" IS NULL)',
        'passengerCount',
      )
      // Booking.priceIrr is the immutable all-in amount captured by checkout;
      // taxIrr/extrasIrr are disclosure components, not amounts to add again.
      .addSelect(
        'GREATEST(b."priceIrr" - b."taxIrr" - b."extrasIrr", 0)',
        'baseFareIrr',
      )
      .addSelect('b."taxIrr"', 'taxIrr')
      .addSelect('b."extrasIrr"', 'extrasIrr')
      .addSelect('b."priceIrr"', 'totalIrr')
      .addSelect('b."agencyId"', 'agencyId')
      .addSelect('u."fullName"', 'agencyName')
      .from('bookings', 'b')
      .innerJoin('flight_instances', 'fi', 'fi.id = b."flightInstanceId"')
      .innerJoin('flights', 'f', 'f.id = fi."flightId"')
      .innerJoin('routes', 'r', 'r.id = f."routeId"')
      .leftJoin('users', 'u', 'u.id = b."agencyId"')
      .where('b."deletedAt" IS NULL');

    if (query.bookedFrom && query.bookedTo) {
      qb.andWhere(
        'b."createdAt" >= :bookedFrom AND b."createdAt" < :bookedTo',
        {
          bookedFrom: query.bookedFrom,
          bookedTo: query.bookedTo,
        },
      );
    }
    if (query.flightFrom && query.flightTo) {
      qb.andWhere(
        'fi."departureAt" >= :flightFrom AND fi."departureAt" < :flightTo',
        {
          flightFrom: query.flightFrom,
          flightTo: query.flightTo,
        },
      );
    }
    if (query.flightInstanceId)
      qb.andWhere('b."flightInstanceId" = :flightInstanceId', {
        flightInstanceId: query.flightInstanceId,
      });
    if (query.bookingStatus)
      qb.andWhere('b.status = :bookingStatus', {
        bookingStatus: query.bookingStatus,
      });
    if (query.originCode)
      qb.andWhere('UPPER(r."originCode") = :originCode', {
        originCode: query.originCode.trim().toUpperCase(),
      });
    if (query.destCode)
      qb.andWhere('UPPER(r."destCode") = :destCode', {
        destCode: query.destCode.trim().toUpperCase(),
      });
    if (query.cabin) qb.andWhere('b.cabin = :cabin', { cabin: query.cabin });
    if (query.channel === 'AGENCY') {
      qb.andWhere('b."agencyId" IS NOT NULL');
    } else if (query.channel === 'SYSTEM') {
      qb.andWhere('b."agencyId" IS NULL AND b.channel = :channel', {
        channel: query.channel,
      });
    } else if (query.channel) {
      qb.andWhere('b.channel = :channel', { channel: query.channel });
    }
    if (query.agencyId)
      qb.andWhere('b."agencyId" = :agencyId', { agencyId: query.agencyId });
    if (query.paymentStatus) {
      const statusMap = {
        PAID: ['PAID', 'TICKETED', 'FLOWN', 'NO_SHOW'],
        REFUNDED: ['REFUNDED'],
        CANCELLED: ['CANCELLED', 'EXPIRED'],
        PENDING: ['DRAFT', 'HELD'],
      } as const;
      qb.andWhere('b.status IN (:...paymentBookingStatuses)', {
        paymentBookingStatuses: statusMap[query.paymentStatus],
      });
    }

    const orderedQuery = qb.orderBy('b."createdAt"', 'DESC');
    if (!options.unbounded) orderedQuery.limit(query.limit ?? 250);
    const raw = await orderedQuery.getRawMany<RawSale>();
    const rows = raw.map((row) => ({
      bookingId: row.bookingId,
      pnr: row.pnr,
      bookedAt: new Date(row.bookedAt).toISOString(),
      bookingStatus: row.bookingStatus,
      paymentStatus: this.paymentStatusFor(row.bookingStatus),
      channel: row.channel,
      flightInstanceId: row.flightInstanceId,
      flightNo: row.flightNo,
      originCode: row.originCode,
      destCode: row.destCode,
      departureAt: new Date(row.departureAt).toISOString(),
      arrivalAt: new Date(row.arrivalAt).toISOString(),
      cabin: row.cabin,
      fareClassCode: row.fareClassCode,
      passengerCount: Number(row.passengerCount),
      baseFareIrr: bigintString(row.baseFareIrr),
      taxIrr: bigintString(row.taxIrr),
      extrasIrr: bigintString(row.extrasIrr),
      totalIrr: bigintString(row.totalIrr),
      agencyId: row.agencyId,
      agencyName: row.agencyName,
    }));
    const grossIrr = rows.reduce((sum, row) => sum + BigInt(row.totalIrr), 0n);
    const paidRows = rows.filter((row) => row.paymentStatus === 'PAID');
    const netRevenueIrr = paidRows.reduce(
      (sum, row) => sum + BigInt(row.totalIrr),
      0n,
    );
    return {
      rows,
      summary: {
        orderCount: rows.length,
        passengerCount: rows.reduce((sum, row) => sum + row.passengerCount, 0),
        grossIrr: grossIrr.toString(),
        netRevenueIrr: netRevenueIrr.toString(),
        averageOrderIrr: rows.length
          ? (grossIrr / BigInt(rows.length)).toString()
          : '0',
      },
    };
  }

  async salesExport(query: FinanceSalesQueryDto, format: FinanceExportFormat) {
    const result = await this.salesReport(query, { unbounded: true });
    const headers = [
      'Booking ID',
      'PNR',
      'Booked At',
      'Booking Status',
      'Payment Status',
      'Channel',
      'Flight',
      'Origin',
      'Destination',
      'Departure',
      'Arrival',
      'Cabin',
      'Fare Class',
      'Passengers',
      'Base Fare IRR',
      'Tax IRR',
      'Ancillary IRR',
      'Grand Total IRR',
      'Agency',
    ];
    const rows = result.rows.map((row) => [
      row.bookingId,
      row.pnr,
      row.bookedAt,
      row.bookingStatus,
      row.paymentStatus,
      row.channel,
      row.flightNo,
      row.originCode,
      row.destCode,
      row.departureAt,
      row.arrivalAt,
      row.cabin,
      row.fareClassCode ?? '',
      row.passengerCount,
      row.baseFareIrr,
      row.taxIrr,
      row.extrasIrr,
      row.totalIrr,
      row.agencyName ?? '',
    ]);
    if (format === FinanceExportFormat.PDF) {
      return {
        body: buildRtrdPdf(result.rows, {
          from: query.bookedFrom ?? query.flightFrom,
          to: query.bookedTo ?? query.flightTo,
          salesType: query.channel ?? 'All',
        }),
        contentType: 'application/pdf',
        extension: 'pdf',
      };
    }
    if (format === FinanceExportFormat.CSV) {
      return {
        body: `\ufeff${[headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`,
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    }
    return {
      body: buildFinanceXlsx({
        salesRows: result.rows,
        filters: `Sales detail • ${query.bookedFrom ?? query.flightFrom ?? 'all dates'}`,
      }),
      contentType: financeXlsxContentType,
      extension: 'xlsx',
    };
  }

  async export(query: FinanceReportQueryDto, format: FinanceExportFormat) {
    const result = await this.report(query);
    const partner = result.kind === 'partners';
    const headers = partner
      ? [
          'نام',
          'فروش کل (ریال)',
          'پرداخت‌شده (ریال)',
          'مانده (ریال)',
          'صندلی فروخته‌شده',
        ]
      : [
          'شماره پرواز',
          'تاریخ',
          'مسیر',
          'فروش (ریال)',
          'صندلی فروخته‌شده',
          'صندلی فروش‌نرفته',
        ];
    const rows = partner
      ? result.rows.map((row) => [
          row.name,
          row.totalIrr,
          row.paidIrr,
          row.outstandingIrr,
          row.soldSeats,
        ])
      : result.rows.map((row) => [
          row.flightNo,
          row.departureAt,
          `${row.originCode}-${row.destCode}`,
          row.totalIrr,
          row.soldSeats,
          row.unsoldSeats,
        ]);
    if (
      format === FinanceExportFormat.PDF ||
      format === FinanceExportFormat.EXCEL
    ) {
      const salesType =
        query.scope === FinanceReportScope.AGENCIES
          ? 'AGENCY'
          : query.scope === FinanceReportScope.CHARTERS
            ? 'CHARTER'
            : undefined;
      const sales = await this.salesReport(
        {
          flightFrom: query.from,
          flightTo: query.to,
          flightInstanceId: query.flightInstanceId,
          channel: salesType,
        },
        { unbounded: true },
      );
      if (format === FinanceExportFormat.EXCEL) {
        return {
          body: buildFinanceXlsx({
            salesRows: sales.rows,
            summaries: partner
              ? result.rows.map((row) => ({
                  name: row.name,
                  totalIrr: row.totalIrr,
                  paidIrr: row.paidIrr,
                  outstandingIrr: row.outstandingIrr,
                  soldSeats: row.soldSeats,
                }))
              : undefined,
            filters: `${query.scope} • ${query.from ?? 'all dates'} → ${query.to ?? 'all dates'}`,
          }),
          contentType: financeXlsxContentType,
          extension: 'xlsx',
        };
      }
      return {
        body: buildRtrdPdf(sales.rows, {
          from: query.from,
          to: query.to,
          salesType: salesType ?? 'All',
        }),
        contentType: 'application/pdf',
        extension: 'pdf',
      };
    }
    if (format === FinanceExportFormat.CSV) {
      return {
        body: `\ufeff${[headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`,
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    }
    return {
      body: buildFinanceXlsx({
        salesRows: [],
        summaries: partner
          ? result.rows.map((row) => ({
              name: row.name,
              totalIrr: row.totalIrr,
              paidIrr: row.paidIrr,
              outstandingIrr: row.outstandingIrr,
              soldSeats: row.soldSeats,
            }))
          : undefined,
        filters: `${query.scope} • ${query.from ?? 'all dates'} → ${query.to ?? 'all dates'}`,
      }),
      contentType: financeXlsxContentType,
      extension: 'xlsx',
    };
  }
}
