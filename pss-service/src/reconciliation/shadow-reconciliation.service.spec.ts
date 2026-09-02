import { DataSource } from 'typeorm';
import { ShadowReconciliationService } from './shadow-reconciliation.service';

describe('ShadowReconciliationService', () => {
  it('fails cutover readiness when approved shadow tables are missing', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ relation: null }]),
    } as unknown as DataSource;
    const service = new ShadowReconciliationService(dataSource);

    const report = await service.compare({
      capturedAt: '2026-09-01T00:00:00.000Z',
      website: {
        orders: 1,
        travellers: 1,
        heldOrders: 0,
        ticketedOrders: 1,
        inventoryTransactions: 1,
      },
    });

    expect(report.cutoverReady).toBe(false);
    expect(report.missingTables).toEqual([
      'pss_orders',
      'pss_travellers',
      'pss_inventory_transactions',
    ]);
  });

  it('reports exact deltas and permits only a complete zero-delta snapshot', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ relation: 'pss_orders' }])
      .mockResolvedValueOnce([{ count: '4' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([{ relation: 'pss_travellers' }])
      .mockResolvedValueOnce([{ count: '5' }])
      .mockResolvedValueOnce([{ relation: 'pss_inventory_transactions' }])
      .mockResolvedValueOnce([{ count: '9' }]);
    const service = new ShadowReconciliationService({
      query,
    } as unknown as DataSource);
    const report = await service.compare({
      capturedAt: '2026-09-01T00:00:00.000Z',
      website: {
        orders: 4,
        travellers: 5,
        heldOrders: 1,
        ticketedOrders: 2,
        inventoryTransactions: 9,
      },
    });

    expect(report.cutoverReady).toBe(true);
    expect(report.deltas).toEqual({
      orders: 0,
      travellers: 0,
      heldOrders: 0,
      ticketedOrders: 0,
      inventoryTransactions: 0,
    });
  });
});
