import { InventoryController } from './inventory.controller';
import type { InventoryReadService } from './inventory-read.service';

describe('InventoryController', () => {
  it('delegates availability to the read service', async () => {
    const inventory = {
      getAvailability: jest.fn().mockResolvedValue({ availableSeats: 2 }),
    } as unknown as InventoryReadService;
    const controller = new InventoryController(inventory);
    await expect(
      controller.availability({
        flightInstanceId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toEqual({ success: true, data: { availableSeats: 2 } });
  });
});
