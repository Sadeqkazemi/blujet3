export const UAT_WALLET_TARGET_IRR = 1_000_000_000n;

export function uatWalletAdjustmentIrr(currentBalanceIrr: bigint): bigint {
  return UAT_WALLET_TARGET_IRR - currentBalanceIrr;
}
