import {
  refundPaidNotificationInput,
  refundSubmittedNotificationInput,
  ticketedNotificationInput,
  walletTopupNotificationInput,
} from './customer-notification-copy';

describe('customer-notification-copy', () => {
  it('builds a ticketed notification with route and stable dedupe key', () => {
    expect(
      ticketedNotificationInput({
        recipientId: 'u1',
        bookingId: 'b1',
        pnr: 'BJABC123',
        routeLabel: 'THR → MHD',
      }),
    ).toEqual({
      recipientId: 'u1',
      category: 'SYSTEM',
      action: 'TICKETED',
      title: 'صدور بلیط',
      body: 'بلیط رزرو BJABC123 برای مسیر THR → MHD صادر شد.',
      entityType: 'BOOKING',
      entityId: 'b1',
      dedupeKey: 'booking:b1:TICKETED',
    });
  });

  it('builds a refund-submitted notification for the account panel deep link', () => {
    expect(
      refundSubmittedNotificationInput({
        recipientId: 'u1',
        refundId: 'r1',
        pnr: 'BJABC123',
      }),
    ).toEqual({
      recipientId: 'u1',
      category: 'SYSTEM',
      action: 'REFUND_SUBMITTED',
      title: 'درخواست استرداد ثبت شد',
      body: 'درخواست استرداد رزرو BJABC123 ثبت شد و در صف بررسی قرار گرفت.',
      entityType: 'REFUND',
      entityId: 'r1',
      dedupeKey: 'refund:r1:SUBMITTED',
    });
  });

  it('builds refund-paid and wallet-topup notifications', () => {
    expect(
      refundPaidNotificationInput({
        recipientId: 'u1',
        refundId: 'r1',
        pnr: 'BJABC123',
      }).action,
    ).toBe('REFUND_PAID');
    expect(
      walletTopupNotificationInput({
        recipientId: 'u1',
        amountIrr: '5000000',
        entryId: 'w1',
      }).dedupeKey,
    ).toBe('wallet:w1:TOPUP');
  });
});
