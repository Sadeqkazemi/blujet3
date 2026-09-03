import type { EntityManager } from 'typeorm';
import { TicketingService } from './ticketing.service';

function stockQuery(available: string): EntityManager {
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ available }),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(query),
  } as unknown as EntityManager;
}

describe('TicketingService stock preflight', () => {
  const service = new TicketingService();

  it('accepts enough accountable stock', async () => {
    await expect(
      service.assertStockAvailable(stockQuery('2'), 2),
    ).resolves.toBe(undefined);
  });

  it('fails closed with the stable stock error before fulfilment', async () => {
    await expect(
      service.assertStockAvailable(stockQuery('1'), 2),
    ).rejects.toMatchObject({
      response: {
        code: 'TICKET_STOCK_UNAVAILABLE',
      },
      status: 503,
    });
  });
});
