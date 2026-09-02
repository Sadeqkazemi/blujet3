import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  positiveInteger,
} from './gateway/gateway.constants';
import { requestIdFromHeader } from './gateway/request-id';
import {
  serializeLogRequest,
  serializeLogResponse,
} from './gateway/structured-logging';
import {
  authIdentityTracker,
  ipTracker,
  isSensitiveAuth,
  sensitiveAuthLimit,
} from './gateway/throttling';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { PanelsModule } from './modules/panels/panels.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { CartableModule } from './modules/cartable/cartable.module';
import { StaffDirectoryModule } from './modules/staff-directory/staff-directory.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { ManagerMessagesModule } from './modules/manager-messages/manager-messages.module';
import { FilesModule } from './modules/files/files.module';
import { ClubModule } from './modules/club/club.module';
import { ItManagerModule } from './modules/it-manager/it-manager.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { ReservationModule } from './modules/reservation/reservation.module';
import { AgencyPortalModule } from './modules/agency-portal/agency-portal.module';
import { FlightsModule } from './modules/flights/flights.module';
import { PassengerReportsModule } from './modules/passenger-reports/passenger-reports.module';
import { StaffReportsModule } from './modules/staff-reports/staff-reports.module';
import { AdminsModule } from './modules/admins/admins.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BookingEngineModule } from './modules/booking-engine/booking-engine.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ManageBookingModule } from './modules/manage-booking/manage-booking.module';
import { ContactModule } from './modules/contact/contact.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { FlightStatusModule } from './modules/flight-status/flight-status.module';
import { FlightopsModule } from './modules/flightops/flightops.module';
import { SurveyModule } from './modules/survey/survey.module';
import { CareersModule } from './modules/careers/careers.module';
import { BlogModule } from './modules/blog/blog.module';
import { SiteContentModule } from './modules/site-content/site-content.module';
import { CustomerReferralsModule } from './modules/customer-referrals/customer-referrals.module';
import { WebservicePricingModule } from './modules/webservice-pricing/webservice-pricing.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TravelCostsModule } from './modules/travel-costs/travel-costs.module';
import { AncillaryServicesModule } from './modules/ancillary-services/ancillary-services.module';
import { LoansModule } from './modules/loans/loans.module';
import { PartnerApiModule } from './modules/partner-api/partner-api.module';
import { FinanceReportsModule } from './modules/finance-reports/finance-reports.module';
import { FinancialIntegrationsModule } from './modules/financial-integrations/financial-integrations.module';
import { AgencyBulletinsModule } from './modules/agency-bulletins/agency-bulletins.module';
import { PssModule } from './modules/pss/pss.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : process.env.NODE_ENV === 'production'
              ? 'info'
              : 'debug',
        genReqId: (req) => requestIdFromHeader(req.headers['x-request-id']),
        customProps: (req) => ({
          requestId: req.id,
          realIp: (req as typeof req & { ip?: string }).ip,
        }),
        serializers: {
          req: serializeLogRequest,
          res: serializeLogResponse,
        },
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.otp',
          'req.body.code',
          'req.body.nationalId',
          'req.body.apiKey',
          'req.body.passportNumber',
          'req.body.cardNumber',
          'req.body.accountNumber',
        ],
      },
    }),
    // Global default covers read-mostly endpoints (search, panels, reporting).
    // Iranian mobile carriers commonly CGNAT many real users behind one IP,
    // so this is deliberately generous — the endpoints that actually need a
    // tight per-account/per-IP limit (auth, OTP, booking creation, payment)
    // already carry their own stricter @Throttle() override and are
    // unaffected by this default.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: positiveInteger(
            process.env.API_RATE_LIMIT_WINDOW_MS,
            DEFAULT_RATE_LIMIT_WINDOW_MS,
          ),
          limit: positiveInteger(
            process.env.API_RATE_LIMIT_MAX,
            DEFAULT_RATE_LIMIT_MAX,
          ),
          getTracker: ipTracker,
        },
        {
          name: 'sensitiveIp',
          ttl: 60_000,
          limit: sensitiveAuthLimit,
          skipIf: (context) => !isSensitiveAuth(context),
          getTracker: ipTracker,
        },
        {
          name: 'sensitiveIdentity',
          ttl: 60_000,
          limit: sensitiveAuthLimit,
          skipIf: (context) => !isSensitiveAuth(context),
          getTracker: authIdentityTracker,
        },
      ],
    }),
    CommonModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    PanelsModule,
    ReportingModule,
    AuditModule,
    NotificationsModule,
    AgenciesModule,
    CartableModule,
    StaffDirectoryModule,
    ReferralsModule,
    ManagerMessagesModule,
    FilesModule,
    ClubModule,
    ItManagerModule,
    PricingModule,
    RefundsModule,
    ReservationModule,
    AgencyPortalModule,
    FlightsModule,
    PassengerReportsModule,
    StaffReportsModule,
    AdminsModule,
    SettingsModule,
    BookingEngineModule,
    ReconciliationModule,
    ProfileModule,
    CustomerReferralsModule,
    ManageBookingModule,
    ContactModule,
    SupportTicketsModule,
    FlightStatusModule,
    FlightopsModule,
    SurveyModule,
    CareersModule,
    BlogModule,
    SiteContentModule,
    WebservicePricingModule,
    CustomersModule,
    TravelCostsModule,
    AncillaryServicesModule,
    LoansModule,
    PartnerApiModule,
    FinanceReportsModule,
    FinancialIntegrationsModule,
    AgencyBulletinsModule,
    PssModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
