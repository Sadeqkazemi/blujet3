import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785824221751 implements MigrationInterface {
  name = 'InitialSchema1785824221751';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" text NOT NULL, "userId" text NOT NULL, "tokenHash" text NOT NULL, "userAgent" text, "ip" text, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Role" AS ENUM('USER', 'AGENCY', 'EMPLOYEE', 'IT_MANAGER', 'COMMERCIAL_MANAGER', 'FINANCE_MANAGER', 'SENIOR_MANAGER', 'CEO', 'BOARD_CHAIR', 'SITE_ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."EmployeeReferralScope" AS ENUM('MANAGERS_ONLY', 'ALL_STAFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Locale" AS ENUM('FA', 'EN', 'AR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" text NOT NULL, "role" "public"."Role" NOT NULL, "phone" text, "username" text, "passwordHash" text, "email" text, "fullName" text NOT NULL, "twoFactorEnabled" boolean NOT NULL DEFAULT false, "twoFactorSecret" text, "isActive" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, "createdById" text, "dept" text, "lastLoginAt" TIMESTAMP(3), "mustChangePassword" boolean NOT NULL DEFAULT false, "rank" text, "referralScope" "public"."EmployeeReferralScope", "nationalIdEnc" text, "nationalIdHash" text, "passportNoEnc" text, "birthDate" TIMESTAMP(3), "emailVerifiedAt" TIMESTAMP(3), "preferredLocale" "public"."Locale" NOT NULL DEFAULT 'FA', "referralCode" text, CONSTRAINT "users_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_username_key" ON "users"  ("username") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_referralCode_key" ON "users"  ("referralCode") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_phone_key" ON "users"  ("phone") `,
    );
    await queryRunner.query(
      `CREATE INDEX "users_nationalIdHash_idx" ON "users"  ("nationalIdHash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_email_key" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyTier" AS ENUM('NORMAL', 'SILVER', 'GOLD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_profiles" ("userId" text NOT NULL, "licenseNo" text NOT NULL, "managerName" text NOT NULL, "phone" text NOT NULL, "email" text NOT NULL, "city" text NOT NULL, "address" text NOT NULL, "tier" "public"."AgencyTier" NOT NULL DEFAULT 'NORMAL', "suspendedAt" TIMESTAMP(3), "suspendReason" text, "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_profiles_pkey" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "routes" ("id" text NOT NULL, "originCode" text NOT NULL, "destCode" text NOT NULL, "durationMin" integer NOT NULL DEFAULT '120', CONSTRAINT "routes_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "routes_originCode_destCode_key" ON "routes"  ("originCode", "destCode") `,
    );
    await queryRunner.query(
      `CREATE TABLE "flights" ("id" text NOT NULL, "flightNo" text NOT NULL, "routeId" text NOT NULL, "aircraftType" text NOT NULL, CONSTRAINT "flights_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "flights_flightNo_key" ON "flights"  ("flightNo") `,
    );
    await queryRunner.query(
      `CREATE TABLE "schedules" ("id" text NOT NULL, "flightId" text NOT NULL, "rrule" text NOT NULL, "depHour" integer NOT NULL, "depMinute" integer NOT NULL, "durationMin" integer NOT NULL, "capacity" integer NOT NULL, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "schedules_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."FlightInstanceStatus" AS ENUM('SCHEDULED', 'DEPARTED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "flight_instances" ("id" text NOT NULL, "flightId" text NOT NULL, "departureAt" TIMESTAMP(3) NOT NULL, "arrivalAt" TIMESTAMP(3) NOT NULL, "capacity" integer NOT NULL, "charterSeats" integer NOT NULL DEFAULT '0', "status" "public"."FlightInstanceStatus" NOT NULL DEFAULT 'SCHEDULED', "agencySeatsAllocated" integer, "basePriceIrr" bigint, "aiSuggestion" jsonb, "scheduleId" text, "aircraftRegistration" text, "aircraftTypeOverride" text, "saleEndsAt" TIMESTAMP(3), "saleStartsAt" TIMESTAMP(3), "niraSubmittedAt" TIMESTAMP(3), CONSTRAINT "flight_instances_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "flight_instances_scheduleId_departureAt_key" ON "flight_instances"  ("scheduleId", "departureAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "flight_instances_departureAt_idx" ON "flight_instances"  ("departureAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AllotmentType" AS ENUM('SOFT', 'HARD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_allotments" ("id" text NOT NULL, "agencyId" text NOT NULL, "flightInstanceId" text NOT NULL, "seatsAllocated" integer NOT NULL, "type" "public"."AllotmentType" NOT NULL DEFAULT 'HARD', "releaseAt" TIMESTAMP(3), "contractPriceIrr" bigint, "createdById" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_allotments_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyApiScope" AS ENUM('FULL', 'SEARCH_BOOK', 'SEARCH_ONLY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyApiKeyStatus" AS ENUM('ACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_api_keys" ("id" text NOT NULL, "agencyId" text NOT NULL, "keyHash" text NOT NULL, "scope" "public"."AgencyApiScope" NOT NULL, "status" "public"."AgencyApiKeyStatus" NOT NULL DEFAULT 'ACTIVE', "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP(3), "lastUsedAt" TIMESTAMP(3), "callCount" integer NOT NULL DEFAULT '0', CONSTRAINT "agency_api_keys_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_api_keys_keyHash_key" ON "agency_api_keys"  ("keyHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_api_keys_agencyId_idx" ON "agency_api_keys"  ("agencyId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_credit_lines" ("agencyId" text NOT NULL, "limitIrr" bigint NOT NULL, "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "agency_credit_lines_pkey" PRIMARY KEY ("agencyId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyCreditRequestStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_credit_requests" ("id" text NOT NULL, "agencyId" text NOT NULL, "requestedLimitIrr" bigint NOT NULL, "note" text, "status" "public"."AgencyCreditRequestStatus" NOT NULL DEFAULT 'PENDING', "decidedById" text, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_credit_requests_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_credit_requests_agencyId_status_idx" ON "agency_credit_requests"  ("agencyId", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stored_files" ("id" text NOT NULL, "ownerId" text NOT NULL, "fileName" text NOT NULL, "mimeType" text NOT NULL, "sizeBytes" integer NOT NULL, "path" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "stored_files_ownerId_idx" ON "stored_files"  ("ownerId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyDocumentType" AS ENUM('LICENSE', 'CONTRACT', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyDocumentStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_documents" ("id" text NOT NULL, "agencyId" text NOT NULL, "fileId" text NOT NULL, "docType" "public"."AgencyDocumentType" NOT NULL, "status" "public"."AgencyDocumentStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_documents_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_documents_fileId_key" ON "agency_documents"  ("fileId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_documents_agencyId_idx" ON "agency_documents"  ("agencyId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyInvoiceStatus" AS ENUM('UNPAID', 'PAID', 'OVERDUE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_invoices" ("id" text NOT NULL, "agencyId" text NOT NULL, "invoiceNo" text NOT NULL, "issuedById" text NOT NULL, "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "dueAt" TIMESTAMP(3) NOT NULL, "amountIrr" bigint NOT NULL, "status" "public"."AgencyInvoiceStatus" NOT NULL DEFAULT 'UNPAID', "paidAt" TIMESTAMP(3), CONSTRAINT "agency_invoices_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_invoices_invoiceNo_key" ON "agency_invoices"  ("invoiceNo") `,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_invoices_agencyId_status_idx" ON "agency_invoices"  ("agencyId", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyMembershipStatus" AS ENUM('PENDING', 'REFERRED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_membership_requests" ("id" text NOT NULL, "applicantName" text NOT NULL, "managerName" text NOT NULL, "licenseNo" text NOT NULL, "city" text, "phone" text NOT NULL, "email" text, "documents" jsonb, "status" "public"."AgencyMembershipStatus" NOT NULL DEFAULT 'PENDING', "referredToId" text, "reviewNote" text, "reviewedById" text, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_membership_requests_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_membership_requests_status_idx" ON "agency_membership_requests"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_messages" ("id" text NOT NULL, "agencyId" text NOT NULL, "senderId" text NOT NULL, "senderIsAgency" boolean NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_messages_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_messages_agencyId_createdAt_idx" ON "agency_messages"  ("agencyId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_request_otps" ("id" text NOT NULL, "phone" text NOT NULL, "codeHash" text NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "attempts" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_request_otps_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_request_otps_phone_idx" ON "agency_request_otps"  ("phone") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyWebserviceRequestStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_webservice_requests" ("id" text NOT NULL, "agencyId" text NOT NULL, "scope" "public"."AgencyApiScope" NOT NULL, "months" integer NOT NULL, "priceIrr" bigint NOT NULL, "note" text, "status" "public"."AgencyWebserviceRequestStatus" NOT NULL DEFAULT 'PENDING', "decidedById" text, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "agency_webservice_requests_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_webservice_requests_agencyId_status_idx" ON "agency_webservice_requests"  ("agencyId", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_usage_logs" ("id" text NOT NULL, "provider" text NOT NULL, "userId" text NOT NULL, "contextId" text, "inputTokens" integer NOT NULL, "outputTokens" integer NOT NULL, "costIrr" bigint, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ai_usage_logs_provider_createdAt_idx" ON "ai_usage_logs"  ("provider", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "aircraft_seat_maps" ("id" text NOT NULL, "aircraftType" text NOT NULL, "businessRowStart" integer NOT NULL, "businessRowEnd" integer NOT NULL, "businessColsLeft" text array, "businessColsRight" text array, "economyRowStart" integer NOT NULL, "economyRowEnd" integer NOT NULL, "economyColsLeft" text array, "economyColsRight" text array, "updatedAt" TIMESTAMP(3) NOT NULL, "excludedSeatCodes" text array DEFAULT '{}', CONSTRAINT "aircraft_seat_maps_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "aircraft_seat_maps_aircraftType_key" ON "aircraft_seat_maps"  ("aircraftType") `,
    );
    await queryRunner.query(
      `CREATE TABLE "airports" ("id" text NOT NULL, "code" text NOT NULL, "cityFa" text NOT NULL, "tz" text NOT NULL, "minConnectMin" integer NOT NULL DEFAULT '60', CONSTRAINT "airports_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "airports_code_key" ON "airports"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AuditCategory" AS ENUM('AGENCY', 'PRICING', 'FINANCE', 'REFUND', 'STRATEGY', 'SYSTEM', 'CLUB', 'ACCOUNT', 'ACCESS', 'SECURITY', 'RESERVATION', 'SURVEY', 'CONTENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" text NOT NULL, "actorId" text NOT NULL, "actorRole" "public"."Role" NOT NULL, "category" "public"."AuditCategory" NOT NULL, "action" text NOT NULL, "detail" text NOT NULL, "entityType" text, "entityId" text, "metadata" jsonb, "requestId" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_logs_actorRole_category_createdAt_idx" ON "audit_logs"  ("actorRole", "category", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."BackupStatus" AS ENUM('RUNNING', 'SUCCESS', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "backup_records" ("id" text NOT NULL, "fileName" text NOT NULL, "sizeBytes" integer, "status" "public"."BackupStatus" NOT NULL DEFAULT 'RUNNING', "triggeredById" text, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "completedAt" TIMESTAMP(3), "errorMessage" text, CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."BlogCategory" AS ENUM('NEWS', 'GUIDE', 'DEST', 'OFFERS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."BlogPostStatus" AS ENUM('DRAFT', 'PUBLISHED', 'SCHEDULED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "blog_posts" ("id" text NOT NULL, "title" text NOT NULL, "slug" text NOT NULL, "body" text NOT NULL, "category" "public"."BlogCategory" NOT NULL, "status" "public"."BlogPostStatus" NOT NULL DEFAULT 'DRAFT', "coverFileId" text, "authorId" text NOT NULL, "viewCount" integer NOT NULL DEFAULT '0', "publishedAt" TIMESTAMP(3), "scheduledAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "blog_posts_status_deletedAt_idx" ON "blog_posts"  ("status", "deletedAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "blog_posts_coverFileId_key" ON "blog_posts"  ("coverFileId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "blog_posts_category_idx" ON "blog_posts"  ("category") `,
    );
    await queryRunner.query(
      `CREATE INDEX "blog_posts_authorId_idx" ON "blog_posts"  ("authorId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."BookingChannel" AS ENUM('SYSTEM', 'CHARTER', 'AGENCY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."BookingStatus" AS ENUM('DRAFT', 'HELD', 'PAID', 'TICKETED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FLOWN', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CabinClass" AS ENUM('ECONOMY', 'BUSINESS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" text NOT NULL, "pnr" text NOT NULL, "flightInstanceId" text NOT NULL, "channel" "public"."BookingChannel" NOT NULL, "agencyId" text, "status" "public"."BookingStatus" NOT NULL DEFAULT 'DRAFT', "priceIrr" bigint NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "cabin" "public"."CabinClass" NOT NULL DEFAULT 'ECONOMY', "contactPhone" text, "holdExpiresAt" TIMESTAMP(3), "idempotencyKey" text, "userId" text, "deletedAt" TIMESTAMP(3), "fareClassCode" text, "taxIrr" bigint NOT NULL DEFAULT '0', CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "bookings_userId_idx" ON "bookings"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "bookings_pnr_key" ON "bookings"  ("pnr") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"  ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "bookings_flightInstanceId_status_idx" ON "bookings"  ("flightInstanceId", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "bookings_channel_idx" ON "bookings"  ("channel") `,
    );
    await queryRunner.query(
      `CREATE INDEX "bookings_agencyId_idx" ON "bookings"  ("agencyId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cabin_fares" ("id" text NOT NULL, "flightInstanceId" text NOT NULL, "cabin" "public"."CabinClass" NOT NULL, "priceIrr" bigint NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "cabin_fares_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cabin_fares_flightInstanceId_cabin_key" ON "cabin_fares"  ("flightInstanceId", "cabin") `,
    );
    await queryRunner.query(
      `CREATE TABLE "careers_settings" ("id" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "careers_settings_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CartableCategory" AS ENUM('ADMIN', 'AGENCY', 'MANAGER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CartableSourceType" AS ENUM('MANAGER_MESSAGE', 'MANAGER_REFERRAL', 'AGENCY_REQUEST', 'CHAIR_PERMISSION', 'EMPLOYEE_MESSAGE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CartableStatus" AS ENUM('OPEN', 'APPROVED', 'REJECTED', 'TRANSFERRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cartable_tasks" ("id" text NOT NULL, "assigneeId" text NOT NULL, "category" "public"."CartableCategory" NOT NULL, "title" text NOT NULL, "description" text NOT NULL, "senderId" text, "senderLabelFa" text, "sourceType" "public"."CartableSourceType", "sourceId" text, "status" "public"."CartableStatus" NOT NULL DEFAULT 'OPEN', "resolutionNote" text, "transferredToId" text, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "cartable_tasks_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "cartable_tasks_sourceType_sourceId_idx" ON "cartable_tasks"  ("sourceType", "sourceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "cartable_tasks_assigneeId_status_idx" ON "cartable_tasks"  ("assigneeId", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ChairPermissionStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chair_report_permissions" ("id" text NOT NULL, "requesterId" text NOT NULL, "status" "public"."ChairPermissionStatus" NOT NULL DEFAULT 'PENDING', "decidedById" text, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "chair_report_permissions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "chair_report_permissions_requesterId_status_idx" ON "chair_report_permissions"  ("requesterId", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ClubTier" AS ENUM('SILVER', 'GOLD', 'PLATINUM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ClubCardStatus" AS ENUM('NONE', 'REVIEW', 'ISSUED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_members" ("id" text NOT NULL, "userId" text, "fullName" text NOT NULL, "email" text NOT NULL, "birthDate" TIMESTAMP(3), "nationalIdEnc" text NOT NULL, "nationalIdHash" text NOT NULL, "joinDate" TIMESTAMP(3) NOT NULL DEFAULT now(), "points" integer NOT NULL DEFAULT '0', "level" "public"."ClubTier" NOT NULL DEFAULT 'SILVER', "cardStatus" "public"."ClubCardStatus" NOT NULL DEFAULT 'NONE', "cardNo" text, "issuedByLabelFa" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "club_members_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "club_members_userId_key" ON "club_members"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "club_members_nationalIdHash_idx" ON "club_members"  ("nationalIdHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "club_members_level_idx" ON "club_members"  ("level") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ClubCardRequestStatus" AS ENUM('SUBMITTED', 'REFERRED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ClubCardAssignee" AS ENUM('SENIOR', 'CHAIR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_card_requests" ("id" text NOT NULL, "memberId" text NOT NULL, "level" "public"."ClubTier" NOT NULL, "points" integer NOT NULL, "status" "public"."ClubCardRequestStatus" NOT NULL DEFAULT 'SUBMITTED', "assignedTo" "public"."ClubCardAssignee", "decidedById" text, "decidedAt" TIMESTAMP(3), "cardNo" text, "history" jsonb NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "club_card_requests_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "club_card_requests_status_idx" ON "club_card_requests"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ClubPointsEntryType" AS ENUM('EARN', 'REDEEM', 'ADJUST')`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_points_entries" ("id" text NOT NULL, "clubMemberId" text NOT NULL, "type" "public"."ClubPointsEntryType" NOT NULL, "signedPoints" integer NOT NULL, "bookingId" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "club_points_entries_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "club_points_entries_clubMemberId_idx" ON "club_points_entries"  ("clubMemberId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "club_tier_rules" ("id" text NOT NULL, "goldMinPoints" integer NOT NULL DEFAULT '5000', "platinumMinPoints" integer NOT NULL DEFAULT '15000', "cardRequestMinPoints" integer NOT NULL DEFAULT '5000', "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "club_tier_rules_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "contact_messages" ("id" text NOT NULL, "name" text NOT NULL, "phone" text NOT NULL, "subject" text NOT NULL, "body" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "contact_messages_createdAt_idx" ON "contact_messages"  ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CustomerIdentityStatus" AS ENUM('NOT_STARTED', 'SUBMITTED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_identity_verifications" ("id" text NOT NULL, "userId" text NOT NULL, "status" "public"."CustomerIdentityStatus" NOT NULL DEFAULT 'NOT_STARTED', "idCardFileId" text, "submittedAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "rejectReason" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "customer_identity_verifications_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "customer_identity_verifications_userId_key" ON "customer_identity_verifications"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CustomerReferralStatus" AS ENUM('SIGNED_UP', 'BOOKED', 'REWARDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_referrals" ("id" text NOT NULL, "referrerUserId" text NOT NULL, "referredUserId" text NOT NULL, "status" "public"."CustomerReferralStatus" NOT NULL DEFAULT 'SIGNED_UP', "pointsAwarded" integer NOT NULL DEFAULT '0', "firstBookingId" text, "rewardedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "customer_referrals_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_referrals_referrerUserId_createdAt_idx" ON "customer_referrals"  ("referrerUserId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "customer_referrals_referredUserId_key" ON "customer_referrals"  ("referredUserId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "customer_referrals_firstBookingId_key" ON "customer_referrals"  ("firstBookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" text NOT NULL, "dept" text NOT NULL, "sectionKey" text NOT NULL, "sectionLabelFa" text NOT NULL, "key" text NOT NULL, "labelFa" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "permissions_dept_key_key" ON "permissions"  ("dept", "key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_permissions" ("id" text NOT NULL, "employeeId" text NOT NULL, "permissionId" text NOT NULL, "grantedById" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "employee_permissions_employeeId_permissionId_key" ON "employee_permissions"  ("employeeId", "permissionId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ExternalServiceMethod" AS ENUM('GET', 'POST')`,
    );
    await queryRunner.query(
      `CREATE TABLE "external_service_configs" ("id" text NOT NULL, "key" text NOT NULL, "nameFa" text NOT NULL, "provider" text NOT NULL, "endpoint" text NOT NULL, "method" "public"."ExternalServiceMethod" NOT NULL DEFAULT 'POST', "timeoutMs" integer NOT NULL DEFAULT '30000', "apiKeyEncrypted" text, "sandbox" boolean NOT NULL DEFAULT false, "enabled" boolean NOT NULL DEFAULT true, "lastTestAt" TIMESTAMP(3), "lastTestOk" boolean, "lastTestMessage" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "external_service_configs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "external_service_configs_key_key" ON "external_service_configs"  ("key") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PricingProposalStatus" AS ENUM('PENDING', 'REGISTERED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fare_pricing_proposals" ("id" text NOT NULL, "flightInstanceId" text NOT NULL, "basePriceIrr" bigint NOT NULL, "competitorPriceIrr" bigint NOT NULL, "proposedPriceIrr" bigint NOT NULL, "legalRateIrr" bigint, "note" text, "proposedById" text NOT NULL, "status" "public"."PricingProposalStatus" NOT NULL DEFAULT 'PENDING', "registeredPriceIrr" bigint, "approvedById" text, "approvedAt" TIMESTAMP(3), "aiSuggestion" jsonb, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "fare_pricing_proposals_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "fare_pricing_proposals_status_idx" ON "fare_pricing_proposals"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "fare_pricing_proposals_flightInstanceId_key" ON "fare_pricing_proposals"  ("flightInstanceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fare_rules" ("id" text NOT NULL, "flightInstanceId" text NOT NULL, "cabin" "public"."CabinClass" NOT NULL, "classCode" text NOT NULL, "priceIrr" bigint NOT NULL, "seatsAllocated" integer NOT NULL, "refundable" boolean NOT NULL DEFAULT true, "allowedChannels" "public"."BookingChannel" array DEFAULT '{}', "baggageAllowanceKg" integer, "changeable" boolean NOT NULL DEFAULT true, "taxIrr" bigint NOT NULL DEFAULT '0', "validFrom" TIMESTAMP(3), "validUntil" TIMESTAMP(3), CONSTRAINT "fare_rules_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "fare_rules_flightInstanceId_cabin_classCode_key" ON "fare_rules"  ("flightInstanceId", "cabin", "classCode") `,
    );
    await queryRunner.query(
      `CREATE TABLE "internal_services" ("id" text NOT NULL, "key" text NOT NULL, "nameFa" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "uptimePct" double precision NOT NULL DEFAULT '100', "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "internal_services_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "internal_services_key_key" ON "internal_services"  ("key") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."JobType" AS ENUM('FULL_TIME', 'REMOTE', 'PART_TIME')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_postings" ("id" text NOT NULL, "title" text NOT NULL, "dept" text NOT NULL, "city" text NOT NULL, "type" "public"."JobType" NOT NULL DEFAULT 'FULL_TIME', "generalReqs" text array, "specialReqs" text array, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."JobApplicantGender" AS ENUM('FEMALE', 'MALE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."MaritalStatus" AS ENUM('SINGLE', 'MARRIED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."MilitaryStatus" AS ENUM('CONSCRIPT', 'EXEMPT', 'WAIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."JobApplicationStatus" AS ENUM('SUBMITTED', 'REFERRED', 'HIRED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_applications" ("id" text NOT NULL, "jobPostingId" text, "jobTitleSnapshot" text NOT NULL, "firstName" text NOT NULL, "lastName" text NOT NULL, "nationalIdEnc" text NOT NULL, "nationalIdHash" text NOT NULL, "fatherName" text, "birthDate" TIMESTAMP(3), "birthProvince" text, "birthCity" text, "gender" "public"."JobApplicantGender", "marital" "public"."MaritalStatus", "military" "public"."MilitaryStatus", "exemptionType" text, "phone" text NOT NULL, "email" text, "residenceProvince" text, "residenceAddress" text, "eduEntries" jsonb NOT NULL DEFAULT '[]', "workEntries" jsonb NOT NULL DEFAULT '[]', "langEntries" jsonb NOT NULL DEFAULT '[]', "skills" text, "otherLangs" text, "resumeFileName" text, "resumeMimeType" text, "resumeSizeBytes" integer, "resumePath" text, "status" "public"."JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED', "assigneeId" text, "history" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "job_applications_status_idx" ON "job_applications"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "job_applications_nationalIdHash_idx" ON "job_applications"  ("nationalIdHash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."LedgerEntryType" AS ENUM('SALE', 'REFUND', 'SETTLEMENT', 'COMMISSION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_entries" ("id" text NOT NULL, "bookingId" text, "type" "public"."LedgerEntryType" NOT NULL, "signedAmountIrr" bigint NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "createdById" text, "agencyId" text, CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ledger_entries_occurredAt_type_idx" ON "ledger_entries"  ("occurredAt", "type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ledger_entries_agencyId_type_idx" ON "ledger_entries"  ("agencyId", "type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ManagerMessageDept" AS ENUM('FINANCE', 'COMMERCIAL', 'SUPPORT', 'AGENCIES', 'CEO', 'ALL_MANAGERS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "manager_messages" ("id" text NOT NULL, "fromId" text NOT NULL, "toDept" "public"."ManagerMessageDept" NOT NULL, "subject" text NOT NULL, "body" text NOT NULL, "attachments" jsonb, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "manager_messages_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "manager_messages_fromId_createdAt_idx" ON "manager_messages"  ("fromId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "manager_referral_recipients" ("referralId" text NOT NULL, "recipientId" text NOT NULL, CONSTRAINT "manager_referral_recipients_pkey" PRIMARY KEY ("referralId", "recipientId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "manager_referral_recipients_recipientId_idx" ON "manager_referral_recipients"  ("recipientId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ReferralPriority" AS ENUM('HIGH', 'MEDIUM', 'LOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ReferralStatus" AS ENUM('SENT', 'REVIEWING', 'REPORTED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "manager_referrals" ("id" text NOT NULL, "fromId" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "priority" "public"."ReferralPriority" NOT NULL DEFAULT 'MEDIUM', "dueAt" TIMESTAMP(3), "status" "public"."ReferralStatus" NOT NULL DEFAULT 'SENT', "attachments" jsonb, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "manager_referrals_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "manager_referrals_fromId_status_idx" ON "manager_referrals"  ("fromId", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "manager_referral_reports" ("id" text NOT NULL, "referralId" text NOT NULL, "fromId" text NOT NULL, "body" text NOT NULL, "attachments" jsonb, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "manager_referral_reports_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "manager_referral_reports_referralId_idx" ON "manager_referral_reports"  ("referralId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "panel_access_flags" ("panelKey" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "panel_access_flags_pkey" PRIMARY KEY ("panelKey"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "passengers" ("id" text NOT NULL, "bookingId" text NOT NULL, "fullName" text NOT NULL, "nationalIdEnc" text, "mobileEnc" text, "nationalIdHash" text, "seatCode" text, "deletedAt" TIMESTAMP(3), CONSTRAINT "passengers_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "passengers_nationalIdHash_idx" ON "passengers"  ("nationalIdHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_events" ("id" text NOT NULL, "employeeId" text NOT NULL, "resetById" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "password_reset_events_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "pay_idempotency_records" ("id" text NOT NULL, "idempotencyKey" text NOT NULL, "bookingId" text NOT NULL, "userId" text NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "pay_idempotency_records_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "pay_idempotency_records_idempotencyKey_key" ON "pay_idempotency_records"  ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE INDEX "pay_idempotency_records_bookingId_idx" ON "pay_idempotency_records"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PaymentReconciliationStatus" AS ENUM('PENDING', 'RESOLVED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_reconciliations" ("id" text NOT NULL, "bookingId" text NOT NULL, "gatewayRefId" text NOT NULL, "amountIrr" bigint NOT NULL, "status" "public"."PaymentReconciliationStatus" NOT NULL DEFAULT 'PENDING', "resolvedById" text, "resolutionNote" text, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payment_reconciliations_status_idx" ON "payment_reconciliations"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PriceLockStatus" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "price_locks" ("id" text NOT NULL, "userId" text NOT NULL, "flightInstanceId" text NOT NULL, "cabin" "public"."CabinClass" NOT NULL, "lockedPriceIrr" bigint NOT NULL, "feeIrr" bigint NOT NULL, "status" "public"."PriceLockStatus" NOT NULL DEFAULT 'ACTIVE', "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "bookingId" text, CONSTRAINT "price_locks_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "price_locks_userId_status_idx" ON "price_locks"  ("userId", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "price_locks_flightInstanceId_cabin_status_idx" ON "price_locks"  ("flightInstanceId", "cabin", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "price_locks_bookingId_key" ON "price_locks"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."PromoType" AS ENUM('PERCENT', 'FIXED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "promo_codes" ("id" text NOT NULL, "code" text NOT NULL, "type" "public"."PromoType" NOT NULL, "value" bigint NOT NULL, "originCode" text, "destCode" text, "cabin" "public"."CabinClass", "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "maxRedemptions" integer, "maxPerUser" integer, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promo_redemptions" ("id" text NOT NULL, "promoCodeId" text NOT NULL, "bookingId" text NOT NULL, "userId" text NOT NULL, "discountIrr" bigint NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "promo_redemptions_userId_idx" ON "promo_redemptions"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "promo_redemptions_promoCodeId_idx" ON "promo_redemptions"  ("promoCodeId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "promo_redemptions_bookingId_key" ON "promo_redemptions"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refund_penalty_rules" ("id" text NOT NULL, "minHoursBeforeDeparture" integer NOT NULL, "penaltyPct" integer NOT NULL, "labelFa" text NOT NULL, CONSTRAINT "refund_penalty_rules_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."RefundStatus" AS ENUM('SUBMITTED', 'REVIEW', 'FINANCE', 'PAID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refund_requests" ("id" text NOT NULL, "bookingId" text NOT NULL, "passengerName" text NOT NULL, "nidEnc" text, "mobileEnc" text, "ibanEnc" text NOT NULL, "totalPaidIrr" bigint NOT NULL, "penaltyPct" integer NOT NULL, "penaltyAmountIrr" bigint NOT NULL, "refundableIrr" bigint NOT NULL, "status" "public"."RefundStatus" NOT NULL DEFAULT 'SUBMITTED', "assigneeId" text, "processedById" text, "paidAt" TIMESTAMP(3), "history" jsonb NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "trackingCode" text NOT NULL, CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refund_requests_trackingCode_key" ON "refund_requests"  ("trackingCode") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refund_requests_status_idx" ON "refund_requests"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refund_requests_bookingId_key" ON "refund_requests"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_bank_accounts" ("id" text NOT NULL, "userId" text NOT NULL, "bankName" text NOT NULL, "bankShort" text NOT NULL, "brandColor" text NOT NULL, "cardPanEnc" text, "cardLast4" text, "shebaEnc" text NOT NULL, "shebaHash" text NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "saved_bank_accounts_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "saved_bank_accounts_userId_shebaHash_idx" ON "saved_bank_accounts"  ("userId", "shebaHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "saved_bank_accounts_userId_createdAt_idx" ON "saved_bank_accounts"  ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_flights" ("id" text NOT NULL, "userId" text NOT NULL, "flightInstanceId" text NOT NULL, "cabin" "public"."CabinClass" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "saved_flights_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "saved_flights_userId_flightInstanceId_cabin_key" ON "saved_flights"  ("userId", "flightInstanceId", "cabin") `,
    );
    await queryRunner.query(
      `CREATE INDEX "saved_flights_userId_createdAt_idx" ON "saved_flights"  ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_passengers" ("id" text NOT NULL, "userId" text NOT NULL, "fullName" text NOT NULL, "latinName" text NOT NULL, "nationalIdEnc" text, "nationalIdHash" text, "passportNoEnc" text, "mobileEnc" text, "isChild" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "saved_passengers_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "saved_passengers_userId_nationalIdHash_idx" ON "saved_passengers"  ("userId", "nationalIdHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "saved_passengers_userId_createdAt_idx" ON "saved_passengers"  ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."LockClassification" AS ENUM('FREE', 'DISCOUNTED', 'PAYABLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."LockApprovalStatus" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "seat_locks" ("id" text NOT NULL, "flightInstanceId" text NOT NULL, "seatCode" text NOT NULL, "lockedById" text NOT NULL, "passengerName" text, "passengerNationalIdEnc" text, "passengerNationalIdHash" text, "passengerMobileEnc" text, "releasedById" text, "releasedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "reason" text NOT NULL DEFAULT '', "classification" "public"."LockClassification" NOT NULL DEFAULT 'PAYABLE', "discountPct" integer, "requesterRank" "public"."Role" NOT NULL DEFAULT 'IT_MANAGER', "approvalStatus" "public"."LockApprovalStatus" NOT NULL DEFAULT 'APPROVED', "approvedById" text, "approvedAt" TIMESTAMP(3), "rejectedById" text, "rejectedAt" TIMESTAMP(3), "rejectionReason" text, "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "bookingId" text, CONSTRAINT "seat_locks_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "seat_locks_flightInstanceId_idx" ON "seat_locks"  ("flightInstanceId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "seat_locks_bookingId_key" ON "seat_locks"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "seat_locks_active_seat_unique" ON "seat_locks"  ("flightInstanceId", "seatCode") WHERE "releasedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "security_policy" ("id" integer NOT NULL DEFAULT '1', "minLength" integer NOT NULL DEFAULT '10', "expiryDays" integer NOT NULL DEFAULT '90', "maxAttempts" integer NOT NULL DEFAULT '5', "requireUppercase" boolean NOT NULL DEFAULT true, "requireNumber" boolean NOT NULL DEFAULT true, "requireSymbol" boolean NOT NULL DEFAULT true, "blockReuse" boolean NOT NULL DEFAULT true, "staffTwoFactorMandatory" boolean NOT NULL DEFAULT true, "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "security_policy_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SiteContentBlockKey" AS ENUM('HERO_BANNER', 'ANNOUNCEMENT_BAR', 'PROMO_BANNER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "site_content_blocks" ("key" "public"."SiteContentBlockKey" NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "title" text NOT NULL DEFAULT '', "subtitle" text NOT NULL DEFAULT '', "buttonText" text NOT NULL DEFAULT '', "badgeText" text NOT NULL DEFAULT '', "imageFileId" text, "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "site_content_blocks_pkey" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "site_content_blocks_imageFileId_key" ON "site_content_blocks"  ("imageFileId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "site_destination_highlights" ("id" text NOT NULL, "airportCode" text NOT NULL, "priceIrr" bigint NOT NULL, "imageFileId" text, "sortOrder" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "site_destination_highlights_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "site_destination_highlights_sortOrder_idx" ON "site_destination_highlights"  ("sortOrder") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "site_destination_highlights_imageFileId_key" ON "site_destination_highlights"  ("imageFileId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "site_media_assets" ("id" text NOT NULL, "storedFileId" text NOT NULL, "label" text NOT NULL, "uploadedById" text NOT NULL, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "site_media_assets_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "site_media_assets_uploadedById_idx" ON "site_media_assets"  ("uploadedById") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "site_media_assets_storedFileId_key" ON "site_media_assets"  ("storedFileId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "site_route_highlights" ("id" text NOT NULL, "fromAirportCode" text NOT NULL, "toAirportCode" text NOT NULL, "priceIrr" bigint NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "site_route_highlights_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "site_route_highlights_sortOrder_idx" ON "site_route_highlights"  ("sortOrder") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SmsMessageType" AS ENUM('OTP', 'TEMP_PASSWORD', 'SURVEY_INVITE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SmsStatus" AS ENUM('SUCCESS', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sms_logs" ("id" text NOT NULL, "phone" text, "messageType" "public"."SmsMessageType" NOT NULL, "status" "public"."SmsStatus" NOT NULL, "failureReason" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "sms_logs_createdAt_idx" ON "sms_logs"  ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SupportTicketDept" AS ENUM('SITE', 'AGENCY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SupportTicketPriority" AS ENUM('HIGH', 'MEDIUM', 'LOW')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SupportTicketStatus" AS ENUM('OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_tickets" ("id" text NOT NULL, "trackingCode" text NOT NULL, "subject" text NOT NULL, "body" text NOT NULL, "requesterName" text NOT NULL, "requesterPhone" text NOT NULL, "userId" text, "dept" "public"."SupportTicketDept" NOT NULL DEFAULT 'SITE', "priority" "public"."SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM', "status" "public"."SupportTicketStatus" NOT NULL DEFAULT 'OPEN', "forwardedToId" text, "history" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "support_tickets_trackingCode_key" ON "support_tickets"  ("trackingCode") `,
    );
    await queryRunner.query(
      `CREATE INDEX "support_tickets_status_idx" ON "support_tickets"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "support_tickets_createdAt_idx" ON "support_tickets"  ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_invites" ("id" text NOT NULL, "bookingId" text NOT NULL, "flightInstanceId" text NOT NULL, "token" text NOT NULL, "smsSentAt" TIMESTAMP(3), "respondedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "survey_invites_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "survey_invites_token_key" ON "survey_invites"  ("token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "survey_invites_flightInstanceId_idx" ON "survey_invites"  ("flightInstanceId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "survey_invites_bookingId_key" ON "survey_invites"  ("bookingId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_questions" ("id" text NOT NULL, "label" text NOT NULL, "order" integer NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_responses" ("id" text NOT NULL, "inviteId" text NOT NULL, "rating" integer NOT NULL, "comment" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "survey_responses_inviteId_key" ON "survey_responses"  ("inviteId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "survey_settings" ("id" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "title" text NOT NULL DEFAULT 'نظرسنجی رضایت مسافران', "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "survey_settings_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "system_settings" ("key" text NOT NULL, "value" jsonb NOT NULL, "updatedById" text, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."TwoFactorPurpose" AS ENUM('STAFF_LOGIN_2FA', 'CUSTOMER_OTP_LOGIN', 'STEP_UP_VERIFICATION', 'EMAIL_VERIFY', 'PASSWORD_RESET_EMAIL', 'AGENCY_PASSWORD_RESET')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."StepUpScope" AS ENUM('ADMIN_ROLE_CHANGE', 'API_KEY_ROTATE', 'REFUND_PAYOUT', 'PRICE_CAPACITY_CHANGE', 'SESSION_REVOKE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "two_factor_challenges" ("id" text NOT NULL, "userId" text NOT NULL, "purpose" "public"."TwoFactorPurpose" NOT NULL, "codeHash" text NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "attempts" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "scope" "public"."StepUpScope", CONSTRAINT "two_factor_challenges_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "two_factor_challenges_userId_idx" ON "two_factor_challenges"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."WalletEntryType" AS ENUM('TOPUP', 'PURCHASE', 'REFUND', 'ADJUST')`,
    );
    await queryRunner.query(
      `CREATE TABLE "wallet_entries" ("id" text NOT NULL, "userId" text NOT NULL, "type" "public"."WalletEntryType" NOT NULL, "signedAmountIrr" bigint NOT NULL, "bookingId" text, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "wallet_entries_userId_idx" ON "wallet_entries"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_profiles" ADD CONSTRAINT "agency_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" ADD CONSTRAINT "flights_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedules" ADD CONSTRAINT "schedules_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD CONSTRAINT "agency_allotments_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD CONSTRAINT "agency_allotments_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD CONSTRAINT "agency_allotments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD CONSTRAINT "agency_api_keys_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_lines" ADD CONSTRAINT "agency_credit_lines_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_lines" ADD CONSTRAINT "agency_credit_lines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_requests" ADD CONSTRAINT "agency_credit_requests_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_requests" ADD CONSTRAINT "agency_credit_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_documents" ADD CONSTRAINT "agency_documents_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_documents" ADD CONSTRAINT "agency_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" ADD CONSTRAINT "agency_invoices_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" ADD CONSTRAINT "agency_invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD CONSTRAINT "agency_membership_requests_referredToId_fkey" FOREIGN KEY ("referredToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD CONSTRAINT "agency_membership_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" ADD CONSTRAINT "agency_messages_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" ADD CONSTRAINT "agency_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_webservice_requests" ADD CONSTRAINT "agency_webservice_requests_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_webservice_requests" ADD CONSTRAINT "agency_webservice_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "cabin_fares" ADD CONSTRAINT "cabin_fares_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD CONSTRAINT "cartable_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD CONSTRAINT "cartable_tasks_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD CONSTRAINT "cartable_tasks_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "chair_report_permissions" ADD CONSTRAINT "chair_report_permissions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "chair_report_permissions" ADD CONSTRAINT "chair_report_permissions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD CONSTRAINT "club_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_card_requests" ADD CONSTRAINT "club_card_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "club_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_card_requests" ADD CONSTRAINT "club_card_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_points_entries" ADD CONSTRAINT "club_points_entries_clubMemberId_fkey" FOREIGN KEY ("clubMemberId") REFERENCES "club_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_points_entries" ADD CONSTRAINT "club_points_entries_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_tier_rules" ADD CONSTRAINT "club_tier_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_identity_verifications" ADD CONSTRAINT "customer_identity_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_firstBookingId_fkey" FOREIGN KEY ("firstBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_permissions" ADD CONSTRAINT "employee_permissions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_permissions" ADD CONSTRAINT "employee_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD CONSTRAINT "fare_pricing_proposals_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD CONSTRAINT "fare_pricing_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD CONSTRAINT "fare_pricing_proposals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD CONSTRAINT "fare_rules_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_messages" ADD CONSTRAINT "manager_messages_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_recipients" ADD CONSTRAINT "manager_referral_recipients_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "manager_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_recipients" ADD CONSTRAINT "manager_referral_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referrals" ADD CONSTRAINT "manager_referrals_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_reports" ADD CONSTRAINT "manager_referral_reports_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "manager_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_reports" ADD CONSTRAINT "manager_referral_reports_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "panel_access_flags" ADD CONSTRAINT "panel_access_flags_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD CONSTRAINT "passengers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_events" ADD CONSTRAINT "password_reset_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_events" ADD CONSTRAINT "password_reset_events_resetById_fkey" FOREIGN KEY ("resetById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "pay_idempotency_records" ADD CONSTRAINT "pay_idempotency_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "pay_idempotency_records" ADD CONSTRAINT "pay_idempotency_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" ADD CONSTRAINT "price_locks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" ADD CONSTRAINT "price_locks_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" ADD CONSTRAINT "price_locks_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_bank_accounts" ADD CONSTRAINT "saved_bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_flights" ADD CONSTRAINT "saved_flights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_flights" ADD CONSTRAINT "saved_flights_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_passengers" ADD CONSTRAINT "saved_passengers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "security_policy" ADD CONSTRAINT "security_policy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_content_blocks" ADD CONSTRAINT "site_content_blocks_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_content_blocks" ADD CONSTRAINT "site_content_blocks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_destination_highlights" ADD CONSTRAINT "site_destination_highlights_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_media_assets" ADD CONSTRAINT "site_media_assets_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_media_assets" ADD CONSTRAINT "site_media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_forwardedToId_fkey" FOREIGN KEY ("forwardedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_invites" ADD CONSTRAINT "survey_invites_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "survey_invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_settings" ADD CONSTRAINT "survey_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "two_factor_challenges" ADD CONSTRAINT "two_factor_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "two_factor_challenges" DROP CONSTRAINT "two_factor_challenges_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "system_settings" DROP CONSTRAINT "system_settings_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_settings" DROP CONSTRAINT "survey_settings_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_responses" DROP CONSTRAINT "survey_responses_inviteId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_invites" DROP CONSTRAINT "survey_invites_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_invites" DROP CONSTRAINT "survey_invites_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_forwardedToId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_media_assets" DROP CONSTRAINT "site_media_assets_uploadedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_media_assets" DROP CONSTRAINT "site_media_assets_storedFileId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_destination_highlights" DROP CONSTRAINT "site_destination_highlights_imageFileId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_content_blocks" DROP CONSTRAINT "site_content_blocks_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_content_blocks" DROP CONSTRAINT "site_content_blocks_imageFileId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "security_policy" DROP CONSTRAINT "security_policy_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_rejectedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_approvedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_releasedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_lockedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_passengers" DROP CONSTRAINT "saved_passengers_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_flights" DROP CONSTRAINT "saved_flights_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_flights" DROP CONSTRAINT "saved_flights_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_bank_accounts" DROP CONSTRAINT "saved_bank_accounts_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_processedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_assigneeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "refund_requests_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" DROP CONSTRAINT "promo_redemptions_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" DROP CONSTRAINT "promo_redemptions_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promo_redemptions" DROP CONSTRAINT "promo_redemptions_promoCodeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" DROP CONSTRAINT "price_locks_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" DROP CONSTRAINT "price_locks_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_locks" DROP CONSTRAINT "price_locks_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_reconciliations" DROP CONSTRAINT "payment_reconciliations_resolvedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_reconciliations" DROP CONSTRAINT "payment_reconciliations_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pay_idempotency_records" DROP CONSTRAINT "pay_idempotency_records_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pay_idempotency_records" DROP CONSTRAINT "pay_idempotency_records_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_events" DROP CONSTRAINT "password_reset_events_resetById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_events" DROP CONSTRAINT "password_reset_events_employeeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP CONSTRAINT "passengers_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "panel_access_flags" DROP CONSTRAINT "panel_access_flags_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_reports" DROP CONSTRAINT "manager_referral_reports_fromId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_reports" DROP CONSTRAINT "manager_referral_reports_referralId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referrals" DROP CONSTRAINT "manager_referrals_fromId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_recipients" DROP CONSTRAINT "manager_referral_recipients_recipientId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_referral_recipients" DROP CONSTRAINT "manager_referral_recipients_referralId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manager_messages" DROP CONSTRAINT "manager_messages_fromId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_createdById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" DROP CONSTRAINT "job_applications_assigneeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_applications" DROP CONSTRAINT "job_applications_jobPostingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP CONSTRAINT "fare_rules_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP CONSTRAINT "fare_pricing_proposals_approvedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP CONSTRAINT "fare_pricing_proposals_proposedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP CONSTRAINT "fare_pricing_proposals_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_permissions" DROP CONSTRAINT "employee_permissions_permissionId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_permissions" DROP CONSTRAINT "employee_permissions_employeeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_firstBookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_referredUserId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_referrerUserId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_identity_verifications" DROP CONSTRAINT "customer_identity_verifications_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_tier_rules" DROP CONSTRAINT "club_tier_rules_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_points_entries" DROP CONSTRAINT "club_points_entries_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_points_entries" DROP CONSTRAINT "club_points_entries_clubMemberId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_card_requests" DROP CONSTRAINT "club_card_requests_decidedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_card_requests" DROP CONSTRAINT "club_card_requests_memberId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP CONSTRAINT "club_members_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chair_report_permissions" DROP CONSTRAINT "chair_report_permissions_decidedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chair_report_permissions" DROP CONSTRAINT "chair_report_permissions_requesterId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP CONSTRAINT "cartable_tasks_transferredToId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP CONSTRAINT "cartable_tasks_senderId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP CONSTRAINT "cartable_tasks_assigneeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cabin_fares" DROP CONSTRAINT "cabin_fares_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "blog_posts" DROP CONSTRAINT "blog_posts_authorId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "blog_posts" DROP CONSTRAINT "blog_posts_coverFileId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backup_records" DROP CONSTRAINT "backup_records_triggeredById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actorId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_webservice_requests" DROP CONSTRAINT "agency_webservice_requests_decidedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_webservice_requests" DROP CONSTRAINT "agency_webservice_requests_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" DROP CONSTRAINT "agency_messages_senderId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" DROP CONSTRAINT "agency_messages_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP CONSTRAINT "agency_membership_requests_reviewedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP CONSTRAINT "agency_membership_requests_referredToId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" DROP CONSTRAINT "agency_invoices_issuedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" DROP CONSTRAINT "agency_invoices_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_documents" DROP CONSTRAINT "agency_documents_fileId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_documents" DROP CONSTRAINT "agency_documents_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stored_files" DROP CONSTRAINT "stored_files_ownerId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_requests" DROP CONSTRAINT "agency_credit_requests_decidedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_requests" DROP CONSTRAINT "agency_credit_requests_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_lines" DROP CONSTRAINT "agency_credit_lines_updatedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_credit_lines" DROP CONSTRAINT "agency_credit_lines_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP CONSTRAINT "agency_api_keys_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP CONSTRAINT "agency_allotments_createdById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP CONSTRAINT "agency_allotments_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP CONSTRAINT "agency_allotments_agencyId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP CONSTRAINT "flight_instances_scheduleId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP CONSTRAINT "flight_instances_flightId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedules" DROP CONSTRAINT "schedules_flightId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flights" DROP CONSTRAINT "flights_routeId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_profiles" DROP CONSTRAINT "agency_profiles_userId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "users_createdById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_userId_fkey"`,
    );
    await queryRunner.query(`DROP INDEX "public"."wallet_entries_userId_idx"`);
    await queryRunner.query(`DROP TABLE "wallet_entries"`);
    await queryRunner.query(`DROP TYPE "public"."WalletEntryType"`);
    await queryRunner.query(
      `DROP INDEX "public"."two_factor_challenges_userId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "two_factor_challenges"`);
    await queryRunner.query(`DROP TYPE "public"."StepUpScope"`);
    await queryRunner.query(`DROP TYPE "public"."TwoFactorPurpose"`);
    await queryRunner.query(`DROP TABLE "system_settings"`);
    await queryRunner.query(`DROP TABLE "survey_settings"`);
    await queryRunner.query(
      `DROP INDEX "public"."survey_responses_inviteId_key"`,
    );
    await queryRunner.query(`DROP TABLE "survey_responses"`);
    await queryRunner.query(`DROP TABLE "survey_questions"`);
    await queryRunner.query(
      `DROP INDEX "public"."survey_invites_bookingId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."survey_invites_flightInstanceId_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."survey_invites_token_key"`);
    await queryRunner.query(`DROP TABLE "survey_invites"`);
    await queryRunner.query(
      `DROP INDEX "public"."support_tickets_createdAt_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."support_tickets_status_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."support_tickets_trackingCode_key"`,
    );
    await queryRunner.query(`DROP TABLE "support_tickets"`);
    await queryRunner.query(`DROP TYPE "public"."SupportTicketStatus"`);
    await queryRunner.query(`DROP TYPE "public"."SupportTicketPriority"`);
    await queryRunner.query(`DROP TYPE "public"."SupportTicketDept"`);
    await queryRunner.query(`DROP INDEX "public"."sms_logs_createdAt_idx"`);
    await queryRunner.query(`DROP TABLE "sms_logs"`);
    await queryRunner.query(`DROP TYPE "public"."SmsStatus"`);
    await queryRunner.query(`DROP TYPE "public"."SmsMessageType"`);
    await queryRunner.query(
      `DROP INDEX "public"."site_route_highlights_sortOrder_idx"`,
    );
    await queryRunner.query(`DROP TABLE "site_route_highlights"`);
    await queryRunner.query(
      `DROP INDEX "public"."site_media_assets_storedFileId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."site_media_assets_uploadedById_idx"`,
    );
    await queryRunner.query(`DROP TABLE "site_media_assets"`);
    await queryRunner.query(
      `DROP INDEX "public"."site_destination_highlights_imageFileId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."site_destination_highlights_sortOrder_idx"`,
    );
    await queryRunner.query(`DROP TABLE "site_destination_highlights"`);
    await queryRunner.query(
      `DROP INDEX "public"."site_content_blocks_imageFileId_key"`,
    );
    await queryRunner.query(`DROP TABLE "site_content_blocks"`);
    await queryRunner.query(`DROP TYPE "public"."SiteContentBlockKey"`);
    await queryRunner.query(`DROP TABLE "security_policy"`);
    await queryRunner.query(
      `DROP INDEX "public"."seat_locks_active_seat_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."seat_locks_bookingId_key"`);
    await queryRunner.query(
      `DROP INDEX "public"."seat_locks_flightInstanceId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "seat_locks"`);
    await queryRunner.query(`DROP TYPE "public"."LockApprovalStatus"`);
    await queryRunner.query(`DROP TYPE "public"."LockClassification"`);
    await queryRunner.query(
      `DROP INDEX "public"."saved_passengers_userId_createdAt_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."saved_passengers_userId_nationalIdHash_idx"`,
    );
    await queryRunner.query(`DROP TABLE "saved_passengers"`);
    await queryRunner.query(
      `DROP INDEX "public"."saved_flights_userId_createdAt_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."saved_flights_userId_flightInstanceId_cabin_key"`,
    );
    await queryRunner.query(`DROP TABLE "saved_flights"`);
    await queryRunner.query(
      `DROP INDEX "public"."saved_bank_accounts_userId_createdAt_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."saved_bank_accounts_userId_shebaHash_idx"`,
    );
    await queryRunner.query(`DROP TABLE "saved_bank_accounts"`);
    await queryRunner.query(
      `DROP INDEX "public"."refund_requests_bookingId_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."refund_requests_status_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."refund_requests_trackingCode_key"`,
    );
    await queryRunner.query(`DROP TABLE "refund_requests"`);
    await queryRunner.query(`DROP TYPE "public"."RefundStatus"`);
    await queryRunner.query(`DROP TABLE "refund_penalty_rules"`);
    await queryRunner.query(
      `DROP INDEX "public"."promo_redemptions_bookingId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."promo_redemptions_promoCodeId_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."promo_redemptions_userId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "promo_redemptions"`);
    await queryRunner.query(`DROP INDEX "public"."promo_codes_code_key"`);
    await queryRunner.query(`DROP TABLE "promo_codes"`);
    await queryRunner.query(`DROP TYPE "public"."PromoType"`);
    await queryRunner.query(`DROP INDEX "public"."price_locks_bookingId_key"`);
    await queryRunner.query(
      `DROP INDEX "public"."price_locks_flightInstanceId_cabin_status_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."price_locks_userId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "price_locks"`);
    await queryRunner.query(`DROP TYPE "public"."PriceLockStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."payment_reconciliations_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "payment_reconciliations"`);
    await queryRunner.query(`DROP TYPE "public"."PaymentReconciliationStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."pay_idempotency_records_bookingId_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."pay_idempotency_records_idempotencyKey_key"`,
    );
    await queryRunner.query(`DROP TABLE "pay_idempotency_records"`);
    await queryRunner.query(`DROP TABLE "password_reset_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."passengers_nationalIdHash_idx"`,
    );
    await queryRunner.query(`DROP TABLE "passengers"`);
    await queryRunner.query(`DROP TABLE "panel_access_flags"`);
    await queryRunner.query(
      `DROP INDEX "public"."manager_referral_reports_referralId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "manager_referral_reports"`);
    await queryRunner.query(
      `DROP INDEX "public"."manager_referrals_fromId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "manager_referrals"`);
    await queryRunner.query(`DROP TYPE "public"."ReferralStatus"`);
    await queryRunner.query(`DROP TYPE "public"."ReferralPriority"`);
    await queryRunner.query(
      `DROP INDEX "public"."manager_referral_recipients_recipientId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "manager_referral_recipients"`);
    await queryRunner.query(
      `DROP INDEX "public"."manager_messages_fromId_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "manager_messages"`);
    await queryRunner.query(`DROP TYPE "public"."ManagerMessageDept"`);
    await queryRunner.query(
      `DROP INDEX "public"."ledger_entries_agencyId_type_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ledger_entries_occurredAt_type_idx"`,
    );
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TYPE "public"."LedgerEntryType"`);
    await queryRunner.query(
      `DROP INDEX "public"."job_applications_nationalIdHash_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."job_applications_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "job_applications"`);
    await queryRunner.query(`DROP TYPE "public"."JobApplicationStatus"`);
    await queryRunner.query(`DROP TYPE "public"."MilitaryStatus"`);
    await queryRunner.query(`DROP TYPE "public"."MaritalStatus"`);
    await queryRunner.query(`DROP TYPE "public"."JobApplicantGender"`);
    await queryRunner.query(`DROP TABLE "job_postings"`);
    await queryRunner.query(`DROP TYPE "public"."JobType"`);
    await queryRunner.query(`DROP INDEX "public"."internal_services_key_key"`);
    await queryRunner.query(`DROP TABLE "internal_services"`);
    await queryRunner.query(
      `DROP INDEX "public"."fare_rules_flightInstanceId_cabin_classCode_key"`,
    );
    await queryRunner.query(`DROP TABLE "fare_rules"`);
    await queryRunner.query(
      `DROP INDEX "public"."fare_pricing_proposals_flightInstanceId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."fare_pricing_proposals_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "fare_pricing_proposals"`);
    await queryRunner.query(`DROP TYPE "public"."PricingProposalStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."external_service_configs_key_key"`,
    );
    await queryRunner.query(`DROP TABLE "external_service_configs"`);
    await queryRunner.query(`DROP TYPE "public"."ExternalServiceMethod"`);
    await queryRunner.query(
      `DROP INDEX "public"."employee_permissions_employeeId_permissionId_key"`,
    );
    await queryRunner.query(`DROP TABLE "employee_permissions"`);
    await queryRunner.query(`DROP INDEX "public"."permissions_dept_key_key"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."customer_referrals_firstBookingId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."customer_referrals_referredUserId_key"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."customer_referrals_referrerUserId_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "customer_referrals"`);
    await queryRunner.query(`DROP TYPE "public"."CustomerReferralStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."customer_identity_verifications_userId_key"`,
    );
    await queryRunner.query(`DROP TABLE "customer_identity_verifications"`);
    await queryRunner.query(`DROP TYPE "public"."CustomerIdentityStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."contact_messages_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "contact_messages"`);
    await queryRunner.query(`DROP TABLE "club_tier_rules"`);
    await queryRunner.query(
      `DROP INDEX "public"."club_points_entries_clubMemberId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "club_points_entries"`);
    await queryRunner.query(`DROP TYPE "public"."ClubPointsEntryType"`);
    await queryRunner.query(
      `DROP INDEX "public"."club_card_requests_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "club_card_requests"`);
    await queryRunner.query(`DROP TYPE "public"."ClubCardAssignee"`);
    await queryRunner.query(`DROP TYPE "public"."ClubCardRequestStatus"`);
    await queryRunner.query(`DROP INDEX "public"."club_members_level_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."club_members_nationalIdHash_idx"`,
    );
    await queryRunner.query(`DROP INDEX "public"."club_members_userId_key"`);
    await queryRunner.query(`DROP TABLE "club_members"`);
    await queryRunner.query(`DROP TYPE "public"."ClubCardStatus"`);
    await queryRunner.query(`DROP TYPE "public"."ClubTier"`);
    await queryRunner.query(
      `DROP INDEX "public"."chair_report_permissions_requesterId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "chair_report_permissions"`);
    await queryRunner.query(`DROP TYPE "public"."ChairPermissionStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."cartable_tasks_assigneeId_status_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."cartable_tasks_sourceType_sourceId_idx"`,
    );
    await queryRunner.query(`DROP TABLE "cartable_tasks"`);
    await queryRunner.query(`DROP TYPE "public"."CartableStatus"`);
    await queryRunner.query(`DROP TYPE "public"."CartableSourceType"`);
    await queryRunner.query(`DROP TYPE "public"."CartableCategory"`);
    await queryRunner.query(`DROP TABLE "careers_settings"`);
    await queryRunner.query(
      `DROP INDEX "public"."cabin_fares_flightInstanceId_cabin_key"`,
    );
    await queryRunner.query(`DROP TABLE "cabin_fares"`);
    await queryRunner.query(`DROP INDEX "public"."bookings_agencyId_idx"`);
    await queryRunner.query(`DROP INDEX "public"."bookings_channel_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."bookings_flightInstanceId_status_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."bookings_idempotencyKey_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."bookings_pnr_key"`);
    await queryRunner.query(`DROP INDEX "public"."bookings_userId_idx"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."CabinClass"`);
    await queryRunner.query(`DROP TYPE "public"."BookingStatus"`);
    await queryRunner.query(`DROP TYPE "public"."BookingChannel"`);
    await queryRunner.query(`DROP INDEX "public"."blog_posts_authorId_idx"`);
    await queryRunner.query(`DROP INDEX "public"."blog_posts_category_idx"`);
    await queryRunner.query(`DROP INDEX "public"."blog_posts_coverFileId_key"`);
    await queryRunner.query(`DROP INDEX "public"."blog_posts_slug_key"`);
    await queryRunner.query(
      `DROP INDEX "public"."blog_posts_status_deletedAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "blog_posts"`);
    await queryRunner.query(`DROP TYPE "public"."BlogPostStatus"`);
    await queryRunner.query(`DROP TYPE "public"."BlogCategory"`);
    await queryRunner.query(`DROP TABLE "backup_records"`);
    await queryRunner.query(`DROP TYPE "public"."BackupStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."audit_logs_actorRole_category_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."AuditCategory"`);
    await queryRunner.query(`DROP INDEX "public"."airports_code_key"`);
    await queryRunner.query(`DROP TABLE "airports"`);
    await queryRunner.query(
      `DROP INDEX "public"."aircraft_seat_maps_aircraftType_key"`,
    );
    await queryRunner.query(`DROP TABLE "aircraft_seat_maps"`);
    await queryRunner.query(
      `DROP INDEX "public"."ai_usage_logs_provider_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "ai_usage_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_webservice_requests_agencyId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_webservice_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."AgencyWebserviceRequestStatus"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_request_otps_phone_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_request_otps"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_messages_agencyId_createdAt_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_messages"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_membership_requests_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_membership_requests"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyMembershipStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_invoices_agencyId_status_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_invoices_invoiceNo_key"`,
    );
    await queryRunner.query(`DROP TABLE "agency_invoices"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyInvoiceStatus"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_documents_agencyId_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_documents_fileId_key"`,
    );
    await queryRunner.query(`DROP TABLE "agency_documents"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyDocumentStatus"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyDocumentType"`);
    await queryRunner.query(`DROP INDEX "public"."stored_files_ownerId_idx"`);
    await queryRunner.query(`DROP TABLE "stored_files"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_credit_requests_agencyId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_credit_requests"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyCreditRequestStatus"`);
    await queryRunner.query(`DROP TABLE "agency_credit_lines"`);
    await queryRunner.query(
      `DROP INDEX "public"."agency_api_keys_agencyId_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_api_keys_keyHash_key"`,
    );
    await queryRunner.query(`DROP TABLE "agency_api_keys"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyApiKeyStatus"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyApiScope"`);
    await queryRunner.query(`DROP TABLE "agency_allotments"`);
    await queryRunner.query(`DROP TYPE "public"."AllotmentType"`);
    await queryRunner.query(
      `DROP INDEX "public"."flight_instances_departureAt_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."flight_instances_scheduleId_departureAt_key"`,
    );
    await queryRunner.query(`DROP TABLE "flight_instances"`);
    await queryRunner.query(`DROP TYPE "public"."FlightInstanceStatus"`);
    await queryRunner.query(`DROP TABLE "schedules"`);
    await queryRunner.query(`DROP INDEX "public"."flights_flightNo_key"`);
    await queryRunner.query(`DROP TABLE "flights"`);
    await queryRunner.query(
      `DROP INDEX "public"."routes_originCode_destCode_key"`,
    );
    await queryRunner.query(`DROP TABLE "routes"`);
    await queryRunner.query(`DROP TABLE "agency_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyTier"`);
    await queryRunner.query(`DROP INDEX "public"."users_email_key"`);
    await queryRunner.query(`DROP INDEX "public"."users_nationalIdHash_idx"`);
    await queryRunner.query(`DROP INDEX "public"."users_phone_key"`);
    await queryRunner.query(`DROP INDEX "public"."users_referralCode_key"`);
    await queryRunner.query(`DROP INDEX "public"."users_username_key"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."Locale"`);
    await queryRunner.query(`DROP TYPE "public"."EmployeeReferralScope"`);
    await queryRunner.query(`DROP TYPE "public"."Role"`);
    await queryRunner.query(
      `DROP INDEX "public"."refresh_tokens_tokenHash_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."refresh_tokens_userId_idx"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
