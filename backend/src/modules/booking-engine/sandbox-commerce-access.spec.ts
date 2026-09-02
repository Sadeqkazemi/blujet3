import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RefundsCustomerController } from '../refunds/refunds-customer.controller';
import { bookingBelongsToActor } from '../refunds/refunds.service';
import { WalletPointsLockController } from './wallet-points-lock.controller';

describe('sandbox customer and agency commerce access', () => {
  it('allows USER and AGENCY identities to use their own wallet', () => {
    const getWalletHandler = Object.getOwnPropertyDescriptor(
      WalletPointsLockController.prototype,
      'getWallet',
    )?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, getWalletHandler)).toEqual([
      'USER',
      'AGENCY',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, WalletPointsLockController)).toEqual([
      'USER',
    ]);
  });

  it('allows USER and AGENCY identities to submit their own refunds', () => {
    expect(Reflect.getMetadata(ROLES_KEY, RefundsCustomerController)).toEqual([
      'USER',
      'AGENCY',
    ]);
  });

  it('accepts either direct customer ownership or agency ownership', () => {
    expect(
      bookingBelongsToActor(
        { userId: 'customer-1', agencyId: null },
        'customer-1',
      ),
    ).toBe(true);
    expect(
      bookingBelongsToActor({ userId: null, agencyId: 'agency-1' }, 'agency-1'),
    ).toBe(true);
    expect(
      bookingBelongsToActor({ userId: 'customer-1', agencyId: null }, 'other'),
    ).toBe(false);
  });
});
