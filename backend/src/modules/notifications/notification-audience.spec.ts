import { notificationEntityVisibleToRole } from './notification-audience';

describe('notificationEntityVisibleToRole', () => {
  it('keeps customer booking notifications and rejects management workflow notifications', () => {
    expect(notificationEntityVisibleToRole('USER', 'Booking')).toBe(true);
    expect(notificationEntityVisibleToRole('USER', 'BankLoanApplication')).toBe(
      true,
    );
    expect(notificationEntityVisibleToRole('USER', 'CartableTask')).toBe(false);
    expect(notificationEntityVisibleToRole('USER', 'FarePricingProposal')).toBe(
      false,
    );
    expect(notificationEntityVisibleToRole('USER', 'FlightInstance')).toBe(
      false,
    );
  });

  it('keeps agency-domain notifications and rejects management workflow notifications', () => {
    expect(
      notificationEntityVisibleToRole('AGENCY', 'AgencySeatCommitment'),
    ).toBe(true);
    expect(notificationEntityVisibleToRole('AGENCY', 'AgencyApiKey')).toBe(
      true,
    );
    expect(notificationEntityVisibleToRole('AGENCY', 'Agency_Bulletin')).toBe(
      true,
    );
    expect(notificationEntityVisibleToRole('AGENCY', 'FlightInstance')).toBe(
      false,
    );
  });

  it('does not restrict management roles', () => {
    expect(notificationEntityVisibleToRole('CEO', 'CartableTask')).toBe(true);
  });
});
