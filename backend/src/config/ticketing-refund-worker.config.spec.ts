import {
  ticketingRefundWorkerDataSourceOptions,
  validateTicketingRefundWorkerEnv,
} from './ticketing-refund-worker.config';

const base = {
  NODE_ENV: 'test',
  TICKETING_REFUND_DATABASE_URL:
    'postgresql://blujet_ticketing_refund_reader:secret@localhost:5432/blujet_test',
  TICKETING_REFUND_INTERNAL_TOKEN: 'x'.repeat(32),
  PORT: '3620',
};

describe('ticketing/refund worker configuration', () => {
  it('requires the dedicated reader role and token', () => {
    expect(() => validateTicketingRefundWorkerEnv(base)).not.toThrow();
    expect(() =>
      validateTicketingRefundWorkerEnv({
        ...base,
        TICKETING_REFUND_DATABASE_URL:
          'postgresql://blujet:secret@localhost/db',
      }),
    ).toThrow('must authenticate as blujet_ticketing_refund_reader');
    expect(() =>
      validateTicketingRefundWorkerEnv({
        ...base,
        TICKETING_REFUND_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('INTERNAL_TOKEN');
  });

  it('disables synchronize and migrations for the worker', () => {
    const options = ticketingRefundWorkerDataSourceOptions(base);
    expect(options.synchronize).toBe(false);
    expect(options.migrations).toEqual([]);
    expect(options.url).toBe(base.TICKETING_REFUND_DATABASE_URL);
  });
});
