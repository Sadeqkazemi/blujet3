import type { Role } from '../../database/enums';

export const EXTERNAL_NOTIFICATION_ENTITIES: Record<
  'USER' | 'AGENCY',
  readonly string[]
> = {
  USER: [
    'BOOKING',
    'REFUND',
    'REFUNDREQUEST',
    'WALLET',
    'CLUBMEMBER',
    'CLUBCARDREQUEST',
    'SUPPORTTICKET',
    'USER',
    'CUSTOMERIDENTITYVERIFICATION',
    'BANKLOANCUSTOMERPROFILE',
    'BANKLOANAPPLICATION',
    'LOANREQUEST',
    'BANKLOANREQUEST',
  ],
  AGENCY: [
    'AGENCYPROFILE',
    'AGENCYMEMBERSHIPREQUEST',
    'AGENCYAPIKEY',
    'AGENCYDOCUMENT',
    'AGENCYALLOTMENT',
    'AGENCYSEATCOMMITMENT',
    'AGENCYSEATREQUEST',
    'AGENCYINVOICE',
    'AGENCYCREDITREQUEST',
    'AGENCYWEBSERVICEREQUEST',
    'BOOKING',
    'SUPPORTTICKET',
    'AGENCY_BULLETIN',
    'USER',
  ],
};

export function notificationEntityVisibleToRole(
  role: Role,
  entityType: string | null,
): boolean {
  if (role !== 'USER' && role !== 'AGENCY') return true;
  if (!entityType) return false;
  return EXTERNAL_NOTIFICATION_ENTITIES[role].includes(
    entityType.toUpperCase(),
  );
}
