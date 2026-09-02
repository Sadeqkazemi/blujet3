import {
  UAT_WALLET_TARGET_IRR,
  uatWalletAdjustmentIrr,
} from './uat-wallet-reconciliation.contract';

describe('UAT wallet reconciliation contract', () => {
  it('targets exactly 100 million toman in IRR', () => {
    expect(UAT_WALLET_TARGET_IRR).toBe(1_000_000_000n);
  });

  it.each([
    [0n, 1_000_000_000n],
    [750_000_000n, 250_000_000n],
    [1_000_000_000n, 0n],
    [1_150_000_000n, -150_000_000n],
  ])(
    'calculates an immutable ledger adjustment from %s',
    (current, expected) => {
      expect(uatWalletAdjustmentIrr(current)).toBe(expected);
    },
  );
});
