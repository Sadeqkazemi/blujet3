import {
  paymentReconciliationWorkerDataSourceOptions,
  validatePaymentReconciliationWorkerEnv,
} from './payment-reconciliation-worker.config';

const base = {
  NODE_ENV: 'test',
  PAYMENT_RECONCILIATION_DATABASE_URL:
    'postgresql://blujet_payment_reconciliation_reader:password@localhost:5432/blujet_test',
  PAYMENT_RECONCILIATION_INTERNAL_TOKEN: 'payment-reconciliation-token-2026',
  PORT: '3630',
};

describe('Payment/Reconciliation worker config', () => {
  it('accepts the dedicated reader URL and disables migrations', () => {
    expect(() => validatePaymentReconciliationWorkerEnv(base)).not.toThrow();
    expect(paymentReconciliationWorkerDataSourceOptions(base)).toMatchObject({
      url: base.PAYMENT_RECONCILIATION_DATABASE_URL,
      entities: [],
      migrations: [],
      synchronize: false,
    });
  });

  it('rejects owner credentials and short internal tokens', () => {
    expect(() =>
      validatePaymentReconciliationWorkerEnv({
        ...base,
        PAYMENT_RECONCILIATION_DATABASE_URL:
          'postgresql://blujet:password@localhost:5432/blujet_test',
      }),
    ).toThrow('must authenticate as blujet_payment_reconciliation_reader');
    expect(() =>
      validatePaymentReconciliationWorkerEnv({
        ...base,
        PAYMENT_RECONCILIATION_INTERNAL_TOKEN: 'short',
      }),
    ).toThrow('must contain at least 32 characters');
  });
});
