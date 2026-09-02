import type { DataSourceOptions } from 'typeorm';
import { AgencyAllotment } from './entities/agency-allotment.entity';
import { AgencySeatCommitment } from './entities/agency-seat-commitment.entity';
import { AgencySeatRequest } from './entities/agency-seat-request.entity';
import { AgencySeatRequestFlight } from './entities/agency-seat-request-flight.entity';
import { AgencyApiKey } from './entities/agency-api-key.entity';
import { AgencyCreditLine } from './entities/agency-credit-line.entity';
import { AgencyCreditRequest } from './entities/agency-credit-request.entity';
import { AgencyDocument } from './entities/agency-document.entity';
import { AgencyInvoice } from './entities/agency-invoice.entity';
import { AgencyMembershipRequest } from './entities/agency-membership-request.entity';
import { AgencyMessage } from './entities/agency-message.entity';
import { AgencyProfile } from './entities/agency-profile.entity';
import { AgencyRequestOtp } from './entities/agency-request-otp.entity';
import { AgencyWebserviceRequest } from './entities/agency-webservice-request.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AircraftCabin } from './entities/aircraft-cabin.entity';
import { AircraftDefinition } from './entities/aircraft-definition.entity';
import { AircraftSeat } from './entities/aircraft-seat.entity';
import { AircraftSeatMap } from './entities/aircraft-seat-map.entity';
import { Airport } from './entities/airport.entity';
import { AncillaryService } from './entities/ancillary-service.entity';
import { AuditLog } from './entities/audit-log.entity';
import { BackupRecord } from './entities/backup-record.entity';
import { BlogPost } from './entities/blog-post.entity';
import { Booking } from './entities/booking.entity';
import { CabinFare } from './entities/cabin-fare.entity';
import { CharterCommitment } from './entities/charter-commitment.entity';
import { CareersSettings } from './entities/careers-settings.entity';
import { CartableTask } from './entities/cartable-task.entity';
import { ChairReportPermission } from './entities/chair-report-permission.entity';
import { ClubCardRequest } from './entities/club-card-request.entity';
import { ClubMember } from './entities/club-member.entity';
import { ClubPointsEntry } from './entities/club-points-entry.entity';
import { ClubTierRule } from './entities/club-tier-rule.entity';
import { ContactMessage } from './entities/contact-message.entity';
import { CustomerIdentityVerification } from './entities/customer-identity-verification.entity';
import { CustomerReferral } from './entities/customer-referral.entity';
import { EmployeePermission } from './entities/employee-permission.entity';
import { ExternalServiceConfig } from './entities/external-service-config.entity';
import { FarePricingProposal } from './entities/fare-pricing-proposal.entity';
import { FareRule } from './entities/fare-rule.entity';
import { Flight } from './entities/flight.entity';
import { FlightChargeRule } from './entities/flight-charge-rule.entity';
import { FlightInstance } from './entities/flight-instance.entity';
import { FlightReview } from './entities/flight-review.entity';
import { FlightScheduleTemplate } from './entities/flight-schedule-template.entity';
import { BankLoanApplication } from './entities/bank-loan-application.entity';
import { BankLoanCustomerProfile } from './entities/bank-loan-customer-profile.entity';
import { BankLoanWebhookEvent } from './entities/bank-loan-webhook-event.entity';
import { BankLoanWalletCredit } from './entities/bank-loan-wallet-credit.entity';
import { InternalService } from './entities/internal-service.entity';
import { JobApplication } from './entities/job-application.entity';
import { JobPosting } from './entities/job-posting.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { ManagerMessage } from './entities/manager-message.entity';
import { ManagerReferral } from './entities/manager-referral.entity';
import { ManagerReferralRecipient } from './entities/manager-referral-recipient.entity';
import { ManagerReferralReport } from './entities/manager-referral-report.entity';
import { Notification } from './entities/notification.entity';
import { PanelAccessFlag } from './entities/panel-access-flag.entity';
import { Passenger } from './entities/passenger.entity';
import { PasswordResetEvent } from './entities/password-reset-event.entity';
import { PayIdempotencyRecord } from './entities/pay-idempotency-record.entity';
import { PaymentReconciliation } from './entities/payment-reconciliation.entity';
import { Permission } from './entities/permission.entity';
import { PriceLock } from './entities/price-lock.entity';
import { PromoCode } from './entities/promo-code.entity';
import { PromoRedemption } from './entities/promo-redemption.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RefundPenaltyRule } from './entities/refund-penalty-rule.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { Route } from './entities/route.entity';
import { SavedBankAccount } from './entities/saved-bank-account.entity';
import { SavedFlight } from './entities/saved-flight.entity';
import { SavedPassenger } from './entities/saved-passenger.entity';
import { Schedule } from './entities/schedule.entity';
import { SeatLock } from './entities/seat-lock.entity';
import { SecurityPolicy } from './entities/security-policy.entity';
import { SiteContentBlock } from './entities/site-content-block.entity';
import { SiteDestinationHighlight } from './entities/site-destination-highlight.entity';
import { SiteMediaAsset } from './entities/site-media-asset.entity';
import { SiteRouteHighlight } from './entities/site-route-highlight.entity';
import { SmsLog } from './entities/sms-log.entity';
import { StoredFile } from './entities/stored-file.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SurveyInvite } from './entities/survey-invite.entity';
import { SurveyQuestion } from './entities/survey-question.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveySettings } from './entities/survey-settings.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { TwoFactorChallenge } from './entities/two-factor-challenge.entity';
import { User } from './entities/user.entity';
import { WalletEntry } from './entities/wallet-entry.entity';
import { TravelExtraSetting } from './entities/travel-extra-setting.entity';

/**
 * All 77 entities, mirroring prisma/schema.prisma's 77 models exactly (see
 * docs/features/typeorm-migration-phase-0.md for the entity-authoring
 * conventions this follows). `synchronize` stays false forever: schema
 * changes only ever happen through hand-run migrations (mirrors
 * CLAUDE.md's Prisma rule "never `db push`, never manual SQL").
 */
export const dataSourceOptions: DataSourceOptions = {
  // Allow individual migrations to set `transaction = false` (needed for
  // Postgres enum ADD VALUE + immediate use in the same migration).
  migrationsTransactionMode: 'each',
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [
    AgencyAllotment,
    AgencySeatCommitment,
    AgencySeatRequest,
    AgencySeatRequestFlight,
    AgencyApiKey,
    AgencyCreditLine,
    AgencyCreditRequest,
    AgencyDocument,
    AgencyInvoice,
    AgencyMembershipRequest,
    AgencyMessage,
    AgencyProfile,
    AgencyRequestOtp,
    AgencyWebserviceRequest,
    AiUsageLog,
    AircraftCabin,
    AircraftDefinition,
    AircraftSeat,
    AircraftSeatMap,
    Airport,
    AncillaryService,
    AuditLog,
    BackupRecord,
    BlogPost,
    Booking,
    CabinFare,
    CharterCommitment,
    CareersSettings,
    CartableTask,
    ChairReportPermission,
    ClubCardRequest,
    ClubMember,
    ClubPointsEntry,
    ClubTierRule,
    ContactMessage,
    CustomerIdentityVerification,
    CustomerReferral,
    EmployeePermission,
    ExternalServiceConfig,
    FarePricingProposal,
    FareRule,
    Flight,
    FlightChargeRule,
    FlightInstance,
    FlightReview,
    FlightScheduleTemplate,
    BankLoanApplication,
    BankLoanCustomerProfile,
    BankLoanWebhookEvent,
    BankLoanWalletCredit,
    InternalService,
    JobApplication,
    JobPosting,
    LedgerEntry,
    ManagerMessage,
    ManagerReferral,
    ManagerReferralRecipient,
    ManagerReferralReport,
    Notification,
    PanelAccessFlag,
    Passenger,
    PasswordResetEvent,
    PayIdempotencyRecord,
    PaymentReconciliation,
    Permission,
    PriceLock,
    PromoCode,
    PromoRedemption,
    RefreshToken,
    RefundPenaltyRule,
    RefundRequest,
    Route,
    SavedBankAccount,
    SavedFlight,
    SavedPassenger,
    Schedule,
    SeatLock,
    SecurityPolicy,
    SiteContentBlock,
    SiteDestinationHighlight,
    SiteMediaAsset,
    SiteRouteHighlight,
    SmsLog,
    StoredFile,
    SupportTicket,
    SurveyInvite,
    SurveyQuestion,
    SurveyResponse,
    SurveySettings,
    SystemSetting,
    TwoFactorChallenge,
    User,
    WalletEntry,
    TravelExtraSetting,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
};
