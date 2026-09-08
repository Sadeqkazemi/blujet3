import { TicketingRefundController } from './ticketing-refund.controller';

describe('TicketingRefundController', () => {
  it('keeps status and quote endpoints thin and delegated', async () => {
    const retrieval = {
      retrieve: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    const refunds = {
      quote: jest.fn().mockResolvedValue({ id: 'order-1', refundableIrr: '1' }),
    };
    const controller = new TicketingRefundController(
      retrieval as never,
      refunds as never,
    );

    await expect(
      controller.status('PNR1', { ownerId: 'owner-1' }),
    ).resolves.toEqual({ success: true, data: { id: 'order-1' } });
    await expect(
      controller.refundQuote('order-1', { ownerId: 'owner-1' }),
    ).resolves.toEqual({
      success: true,
      data: { id: 'order-1', refundableIrr: '1' },
    });
    expect(retrieval.retrieve).toHaveBeenCalledWith('PNR1', 'owner-1');
    expect(refunds.quote).toHaveBeenCalledWith('order-1', {
      ownerId: 'owner-1',
    });
    expect('apply' in controller).toBe(false);
  });
});
