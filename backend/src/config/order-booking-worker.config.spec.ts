import {
  orderBookingWorkerDataSourceOptions,
  validateOrderBookingWorkerEnv,
} from './order-booking-worker.config';

const base = {
  NODE_ENV: 'test',
  ORDER_BOOKING_DATABASE_URL:
    'postgresql://blujet_order_booking_reader:password@localhost:5432/blujet_test',
  ORDER_BOOKING_INTERNAL_TOKEN: 'order-booking-internal-token-2026',
  PORT: '3640',
};

describe('Order/Booking worker config', () => {
  it('accepts the dedicated reader URL and disables migrations', () => {
    expect(() => validateOrderBookingWorkerEnv(base)).not.toThrow();
    expect(orderBookingWorkerDataSourceOptions(base)).toMatchObject({
      url: base.ORDER_BOOKING_DATABASE_URL,
      entities: [],
      migrations: [],
      synchronize: false,
    });
  });

  it('rejects owner credentials and short internal tokens', () => {
    expect(() =>
      validateOrderBookingWorkerEnv({
        ...base,
        ORDER_BOOKING_DATABASE_URL:
          'postgresql://blujet:password@localhost:5432/blujet_test',
      }),
    ).toThrow('must authenticate as blujet_order_booking_reader');
    expect(() =>
      validateOrderBookingWorkerEnv({
        ...base,
        ORDER_BOOKING_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('must contain at least 32 characters');
  });
});
