import { AgencyCreditRequest } from './entities/agency-credit-request.entity';
import { AgencyInvoice } from './entities/agency-invoice.entity';
import { AgencyProfile } from './entities/agency-profile.entity';

export const agencyProjectionEntities = [
  AgencyProfile,
  AgencyInvoice,
  AgencyCreditRequest,
];
