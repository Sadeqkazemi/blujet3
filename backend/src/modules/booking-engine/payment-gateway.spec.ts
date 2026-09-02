import { ServiceUnavailableException } from '@nestjs/common';
import { UnavailablePaymentGateway } from './payment-gateway';

describe('UnavailablePaymentGateway', () => {
  it('fails closed without creating a sandbox authority', async () => {
    const gateway = new UnavailablePaymentGateway();

    await expect(gateway.request(1000n, 'booking-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
