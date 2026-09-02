import { canTransitionBankStatus } from './loan-status.transitions';

describe('canTransitionBankStatus', () => {
  it('allows same status and forward progress', () => {
    expect(canTransitionBankStatus('INITIATING', 'SUBMITTED')).toBe(true);
    expect(canTransitionBankStatus('PENDING', 'PENDING')).toBe(true);
    expect(canTransitionBankStatus('PENDING', 'APPROVED')).toBe(true);
    expect(canTransitionBankStatus('APPROVED', 'DISBURSED')).toBe(true);
  });

  it('blocks rollback from terminal DISBURSED/REJECTED', () => {
    expect(canTransitionBankStatus('DISBURSED', 'PENDING')).toBe(false);
    expect(canTransitionBankStatus('DISBURSED', 'REJECTED')).toBe(false);
    expect(canTransitionBankStatus('REJECTED', 'APPROVED')).toBe(false);
    expect(canTransitionBankStatus('REJECTED', 'DISBURSED')).toBe(false);
  });

  it('blocks UNKNOWN overwrites of known state', () => {
    expect(canTransitionBankStatus('APPROVED', 'UNKNOWN')).toBe(false);
    expect(canTransitionBankStatus('UNKNOWN', 'PENDING')).toBe(true);
  });
});
