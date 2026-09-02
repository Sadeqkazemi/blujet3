import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { FinanceReportsService } from './finance-reports.service';
import {
  FinanceExportFormat,
  FinanceReportPeriod,
  FinanceReportScope,
} from './dto/finance-report-query.dto';

describe('FinanceReportsService', () => {
  it('builds CSV from the exact filtered real report result', async () => {
    const service = new FinanceReportsService({} as DataSource);
    jest.spyOn(service, 'report').mockResolvedValue({
      kind: 'partners',
      scope: FinanceReportScope.AGENCIES,
      period: FinanceReportPeriod.MONTH,
      rows: [
        {
          id: 'a1',
          name: 'آژانس سپهر',
          totalIrr: '3100000000',
          paidIrr: '2800000000',
          outstandingIrr: '300000000',
          soldSeats: 12,
        },
      ],
      summary: { totalIrr: '3100000000', paidIrr: '2800000000' },
    });

    const file = await service.export(
      { scope: FinanceReportScope.AGENCIES, period: FinanceReportPeriod.MONTH },
      FinanceExportFormat.CSV,
    );

    expect(file.contentType).toContain('text/csv');
    expect(file.body).toContain('آژانس سپهر');
    expect(file.body).toContain('3100000000,2800000000,300000000,12');
  });

  it('rejects a half-specified date range', async () => {
    const service = new FinanceReportsService({} as DataSource);
    try {
      await service.report({
        scope: FinanceReportScope.CUSTOMERS,
        period: FinanceReportPeriod.DAY,
        from: '2026-08-13T00:00:00.000Z',
      });
      throw new Error('Expected report() to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('VALIDATION_FAILED');
    }
  });

  it('builds a real PDF file signature for the filtered summary', async () => {
    const service = new FinanceReportsService({} as DataSource);
    jest.spyOn(service, 'report').mockResolvedValue({
      kind: 'partners',
      scope: FinanceReportScope.AGENCIES,
      period: FinanceReportPeriod.MONTH,
      rows: [],
      summary: { totalIrr: '0', paidIrr: '0' },
    });
    jest.spyOn(service, 'salesReport').mockResolvedValue({
      rows: [
        {
          bookingId: 'b-pdf',
          pnr: 'PDF001',
          bookedAt: '2026-08-01T00:00:00.000Z',
          bookingStatus: 'TICKETED',
          paymentStatus: 'PAID',
          channel: 'AGENCY',
          flightInstanceId: 'fi-pdf',
          flightNo: 'XY100',
          originCode: 'THR',
          destCode: 'MHD',
          departureAt: '2026-08-02T08:00:00.000Z',
          arrivalAt: '2026-08-02T09:00:00.000Z',
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          passengerCount: 2,
          baseFareIrr: '1000000',
          taxIrr: '100000',
          extrasIrr: '50000',
          totalIrr: '1150000',
          agencyId: 'agency-1',
          agencyName: 'Agency One',
        },
      ],
      summary: {
        orderCount: 1,
        passengerCount: 2,
        grossIrr: '1150000',
        netRevenueIrr: '1150000',
        averageOrderIrr: '1150000',
      },
    });

    const file = await service.export(
      { scope: FinanceReportScope.AGENCIES, period: FinanceReportPeriod.MONTH },
      FinanceExportFormat.PDF,
    );

    expect(file.contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(file.body)).toBe(true);
    expect((file.body as Buffer).subarray(0, 5).toString('ascii')).toBe(
      '%PDF-',
    );
    const pdf = (file.body as Buffer).toString('ascii');
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('(NIRA-PRA) Tj');
    expect(pdf).toContain('(RTRD) Tj');
    expect(pdf).toContain('(BLUJET AIRLINE) Tj');
    expect(pdf).toContain('(Total Debit:) Tj');
    expect(pdf).toContain('(Total Credit:) Tj');
    expect(pdf).toContain('(1,150,000.00) Tj');
  });

  it('applies detailed booking, route, cabin and channel filters server-side', async () => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'orderBy',
      'limit',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    const service = new FinanceReportsService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as DataSource);

    await service.salesReport({
      bookedFrom: '2026-08-01T00:00:00.000Z',
      bookedTo: '2026-09-01T00:00:00.000Z',
      bookingStatus: 'TICKETED',
      originCode: 'thr',
      destCode: 'mhd',
      cabin: 'BUSINESS',
      channel: 'AGENCY',
      flightInstanceId: '11111111-1111-4111-8111-111111111111',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('b.status = :bookingStatus', {
      bookingStatus: 'TICKETED',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'UPPER(r."originCode") = :originCode',
      { originCode: 'THR' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('b.cabin = :cabin', {
      cabin: 'BUSINESS',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('b."agencyId" IS NOT NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'b."flightInstanceId" = :flightInstanceId',
      { flightInstanceId: '11111111-1111-4111-8111-111111111111' },
    );
  });

  it('attributes public-inventory purchases with an agency owner to agency finance', async () => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'setParameters',
      'groupBy',
      'addGroupBy',
      'orderBy',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    const service = new FinanceReportsService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as DataSource);

    await service.report({
      scope: FinanceReportScope.AGENCIES,
      period: FinanceReportPeriod.MONTH,
    });

    expect(qb.where).toHaveBeenCalledWith('b."agencyId" IS NOT NULL');
  });

  it('treats priceIrr as the all-in booking total without adding tax and extras twice', async () => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'orderBy',
      'limit',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([
      {
        bookingId: 'booking-1',
        pnr: 'BJTOTAL',
        bookedAt: '2026-08-30T10:00:00.000Z',
        bookingStatus: 'TICKETED',
        channel: 'SYSTEM',
        flightInstanceId: 'flight-1',
        flightNo: 'KL2550',
        originCode: 'IKA',
        destCode: 'FRA',
        departureAt: '2026-09-01T04:30:00.000Z',
        arrivalAt: '2026-09-01T07:30:00.000Z',
        cabin: 'FIRST',
        fareClassCode: 'F',
        passengerCount: '1',
        baseFareIrr: '100',
        taxIrr: '10',
        extrasIrr: '5',
        totalIrr: '115',
        agencyId: null,
        agencyName: null,
      },
    ]);
    const service = new FinanceReportsService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as DataSource);

    const result = await service.salesReport({
      flightInstanceId: 'flight-1',
    });

    expect(qb.addSelect).toHaveBeenCalledWith(
      'GREATEST(b."priceIrr" - b."taxIrr" - b."extrasIrr", 0)',
      'baseFareIrr',
    );
    expect(qb.addSelect).toHaveBeenCalledWith('b."priceIrr"', 'totalIrr');
    expect(result.rows[0]).toMatchObject({
      baseFareIrr: '100',
      taxIrr: '10',
      extrasIrr: '5',
      totalIrr: '115',
    });
    expect(result.summary).toMatchObject({
      grossIrr: '115',
      netRevenueIrr: '115',
    });
  });

  it('exports the same detailed result as CSV and Excel', async () => {
    const service = new FinanceReportsService({} as DataSource);
    jest.spyOn(service, 'salesReport').mockResolvedValue({
      rows: [
        {
          bookingId: 'b1',
          pnr: 'BJTEST',
          bookedAt: '2026-08-01T00:00:00.000Z',
          bookingStatus: 'TICKETED',
          paymentStatus: 'PAID',
          channel: 'SYSTEM',
          flightInstanceId: 'fi1',
          flightNo: 'XY123',
          originCode: 'THR',
          destCode: 'MHD',
          departureAt: '2026-08-02T08:00:00.000Z',
          arrivalAt: '2026-08-02T09:00:00.000Z',
          cabin: 'ECONOMY',
          fareClassCode: 'Y',
          passengerCount: 1,
          baseFareIrr: '100',
          taxIrr: '10',
          extrasIrr: '5',
          totalIrr: '115',
          agencyId: null,
          agencyName: null,
        },
      ],
      summary: {
        orderCount: 1,
        passengerCount: 1,
        grossIrr: '115',
        netRevenueIrr: '115',
        averageOrderIrr: '115',
      },
    });

    const csv = await service.salesExport({}, FinanceExportFormat.CSV);
    const excel = await service.salesExport({}, FinanceExportFormat.EXCEL);

    expect(csv.body).toContain('BJTEST');
    expect(csv.body).toContain('ECONOMY,Y');
    expect(excel.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(excel.extension).toBe('xlsx');
    expect(Buffer.isBuffer(excel.body)).toBe(true);
    expect((excel.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');
    const workbook = (excel.body as Buffer).toString('utf8');
    expect(workbook).toContain('xl/worksheets/sheet8.xml');
    expect(workbook).toContain('BJTEST');
    for (let sheet = 1; sheet <= 8; sheet += 1) {
      const xmlStart = workbook.indexOf(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet`,
        workbook.indexOf(`xl/worksheets/sheet${sheet}.xml`),
      );
      const xmlEnd = workbook.indexOf('</worksheet>', xmlStart);
      const worksheet = workbook.slice(xmlStart, xmlEnd);
      const filter = worksheet.indexOf('<autoFilter');
      const merges = worksheet.indexOf('<mergeCells');
      if (filter >= 0 && merges >= 0) expect(filter).toBeLessThan(merges);
    }
  });

  it('does not apply the on-screen preview cap to operational exports', async () => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'orderBy',
      'limit',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    const service = new FinanceReportsService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as DataSource);

    await service.salesExport({}, FinanceExportFormat.EXCEL);

    expect(qb.orderBy).toHaveBeenCalled();
    expect(qb.limit).not.toHaveBeenCalled();
  });
});
