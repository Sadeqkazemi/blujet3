import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PaymentReconciliationReadService } from './payment-reconciliation-read.service';

describe('PaymentReconciliationReadService', () => {
  it('maps pending reconciliation rows without PII', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          id: 'recon-1',
          bookingId: 'booking-1',
          pnr: 'PNR1',
          bookingStatus: 'PAID',
          gatewayRefId: 'gateway-1',
          amountIrr: '1200000',
          createdAt: '2026-09-08T10:00:00.000Z',
        },
      ]),
    } as unknown as DataSource;
    const service = new PaymentReconciliationReadService(dataSource);
    await expect(service.listPending(50)).resolves.toEqual([
      expect.objectContaining({
        id: 'recon-1',
        amountIrr: '1200000',
        currency: 'IRR',
        createdAt: '2026-09-08T10:00:00.000Z',
      }),
    ]);
  });

  it('maps only bounded compensation evidence without idempotency data', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'saga-1',
        sagaType: 'CORE_ITINERARY_REFUND',
        aggregateId: 'order-1',
        correlationId: 'core-itinerary:order-1',
        currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
        failureCode: 'PSP_REFUND_UNKNOWN',
        createdAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
        idempotencyKey: 'must-not-leak',
      },
    ]);
    const service = new PaymentReconciliationReadService({
      query,
    } as unknown as DataSource);

    const result = await service.listCompensationRequired(25);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [25],
    );
    expect(result).toEqual([
      {
        id: 'saga-1',
        sagaType: 'CORE_ITINERARY_REFUND',
        aggregateId: 'order-1',
        correlationId: 'core-itinerary:order-1',
        status: 'COMPENSATION_REQUIRED',
        currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
        failureCode: 'PSP_REFUND_UNKNOWN',
        createdAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
      },
    ]);
    expect(result[0]).not.toHaveProperty('idempotencyKey');
  });

  it('returns payment evidence by PNR and rejects unknown orders', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'booking-1',
            pnr: 'PNR1',
            status: 'PAID',
            totalIrr: '1200000',
            currency: 'IRR',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'attempt-1',
            amountIrr: '1200000',
            status: 'COMPLETED',
            createdAt: '2026-09-08T10:00:00.000Z',
            updatedAt: '2026-09-08T10:01:00.000Z',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'ledger-1',
            type: 'SALE',
            signedAmountIrr: '1200000',
            occurredAt: '2026-09-08T10:01:00.000Z',
          },
        ]),
    } as unknown as DataSource;
    const service = new PaymentReconciliationReadService(dataSource);
    await expect(service.status('PNR1')).resolves.toMatchObject({
      booking: { pnr: 'PNR1', totalIrr: '1200000' },
      attempts: [{ status: 'COMPLETED' }],
      ledger: [{ signedAmountIrr: '1200000' }],
    });

    const missing = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    await expect(
      new PaymentReconciliationReadService(missing).status('MISSING'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
