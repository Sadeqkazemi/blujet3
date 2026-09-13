import { AgencyCreditRequest } from './entities/agency-credit-request.entity';
import { AgencyInvoice } from './entities/agency-invoice.entity';
import { AgencyKafkaConsumerCheckpoint } from './entities/agency-kafka-consumer-checkpoint.entity';
import { AgencyProfile } from './entities/agency-profile.entity';
import { AgencyProjectionEventReceipt } from './entities/agency-projection-event-receipt.entity';
import { AgencyProjectionSlot } from './entities/agency-projection-slot.entity';

export const agencyProjectionEntities = [
  AgencyProfile,
  AgencyInvoice,
  AgencyCreditRequest,
  AgencyProjectionEventReceipt,
  AgencyProjectionSlot,
  AgencyKafkaConsumerCheckpoint,
];
