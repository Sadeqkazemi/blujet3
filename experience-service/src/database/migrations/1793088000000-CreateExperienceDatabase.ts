import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExperienceDatabase1793088000000 implements MigrationInterface {
  public readonly name = 'CreateExperienceDatabase1793088000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "experience"');
    await queryRunner.query(`
            CREATE TABLE "experience"."contact_messages" (
                "id" text NOT NULL,
                "name" text NOT NULL,
                "phone" text NOT NULL,
                "subject" text NOT NULL,
                "body" text NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "contact_messages_createdAt_idx" ON "experience"."contact_messages" ("createdAt")
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."BlogCategory" AS ENUM('NEWS', 'GUIDE', 'DEST', 'OFFERS')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."BlogPostStatus" AS ENUM('DRAFT', 'PUBLISHED', 'SCHEDULED')
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."blog_posts" (
                "id" text NOT NULL,
                "title" text NOT NULL,
                "slug" text NOT NULL,
                "body" text NOT NULL,
                "category" "experience"."BlogCategory" NOT NULL,
                "status" "experience"."BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
                "coverFileId" text,
                "authorId" text NOT NULL,
                "authorName" text,
                "viewCount" integer NOT NULL DEFAULT '0',
                "publishedAt" TIMESTAMP(3),
                "scheduledAt" TIMESTAMP(3),
                "deletedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "blog_posts_status_deletedAt_idx" ON "experience"."blog_posts" ("status", "deletedAt")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "blog_posts_slug_key" ON "experience"."blog_posts" ("slug")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "blog_posts_coverFileId_key" ON "experience"."blog_posts" ("coverFileId")
        `);
    await queryRunner.query(`
            CREATE INDEX "blog_posts_category_idx" ON "experience"."blog_posts" ("category")
        `);
    await queryRunner.query(`
            CREATE INDEX "blog_posts_authorId_idx" ON "experience"."blog_posts" ("authorId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."stored_files" (
                "id" text NOT NULL,
                "ownerId" text NOT NULL,
                "fileName" text NOT NULL,
                "mimeType" text NOT NULL,
                "path" text NOT NULL,
                "sizeBytes" integer NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5d5be862bf53851c1794b4adf4e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."SiteContentBlockKey" AS ENUM(
                'HERO_BANNER',
                'ANNOUNCEMENT_BAR',
                'PROMO_BANNER'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."site_content_blocks" (
                "key" "experience"."SiteContentBlockKey" NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "title" text NOT NULL DEFAULT '',
                "subtitle" text NOT NULL DEFAULT '',
                "buttonText" text NOT NULL DEFAULT '',
                "badgeText" text NOT NULL DEFAULT '',
                "imageFileId" text,
                "updatedById" text,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "site_content_blocks_pkey" PRIMARY KEY ("key")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "site_content_blocks_imageFileId_key" ON "experience"."site_content_blocks" ("imageFileId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."site_destination_highlights" (
                "id" text NOT NULL,
                "airportCode" text NOT NULL,
                "priceIrr" bigint NOT NULL,
                "imageFileId" text,
                "sortOrder" integer NOT NULL DEFAULT '0',
                "deletedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "PK_1bab58a448c9834b22bd559edf1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "site_destination_highlights_sortOrder_idx" ON "experience"."site_destination_highlights" ("sortOrder")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "site_destination_highlights_imageFileId_key" ON "experience"."site_destination_highlights" ("imageFileId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."site_media_assets" (
                "id" text NOT NULL,
                "storedFileId" text NOT NULL,
                "label" text NOT NULL,
                "uploadedById" text NOT NULL,
                "deletedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_291dfffa1acdef16930e8aaa5c9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "site_media_assets_uploadedById_idx" ON "experience"."site_media_assets" ("uploadedById")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "site_media_assets_storedFileId_key" ON "experience"."site_media_assets" ("storedFileId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."site_route_highlights" (
                "id" text NOT NULL,
                "fromAirportCode" text NOT NULL,
                "toAirportCode" text NOT NULL,
                "priceIrr" bigint NOT NULL,
                "sortOrder" integer NOT NULL DEFAULT '0',
                "deletedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "PK_59f8b29e17f9a9332f5afc21add" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "site_route_highlights_sortOrder_idx" ON "experience"."site_route_highlights" ("sortOrder")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."careers_settings" (
                "id" text NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5c42d67dd68065ebb3001895350" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."JobApplicantGender" AS ENUM('FEMALE', 'MALE')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."MaritalStatus" AS ENUM('SINGLE', 'MARRIED')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."MilitaryStatus" AS ENUM('CONSCRIPT', 'EXEMPT', 'WAIVED')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."JobApplicationStatus" AS ENUM('SUBMITTED', 'REFERRED', 'HIRED', 'REJECTED')
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."job_applications" (
                "id" text NOT NULL,
                "jobPostingId" text,
                "jobTitleSnapshot" text NOT NULL,
                "firstName" text NOT NULL,
                "lastName" text NOT NULL,
                "nationalIdEnc" text NOT NULL,
                "nationalIdHash" text NOT NULL,
                "fatherName" text,
                "birthDate" TIMESTAMP(3),
                "birthProvince" text,
                "birthCity" text,
                "gender" "experience"."JobApplicantGender",
                "marital" "experience"."MaritalStatus",
                "military" "experience"."MilitaryStatus",
                "exemptionType" text,
                "phone" text NOT NULL,
                "email" text,
                "residenceProvince" text,
                "residenceAddress" text,
                "eduEntries" jsonb NOT NULL DEFAULT '[]',
                "workEntries" jsonb NOT NULL DEFAULT '[]',
                "langEntries" jsonb NOT NULL DEFAULT '[]',
                "skills" text,
                "otherLangs" text,
                "resumeFileName" text,
                "resumeMimeType" text,
                "resumeSizeBytes" integer,
                "resumePath" text,
                "status" "experience"."JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
                "assigneeId" text,
                "assigneeName" text,
                "history" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c56a5e86707d0f0df18fa111280" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "job_applications_status_idx" ON "experience"."job_applications" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "job_applications_nationalIdHash_idx" ON "experience"."job_applications" ("nationalIdHash")
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."JobType" AS ENUM('FULL_TIME', 'REMOTE', 'PART_TIME')
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."job_postings" (
                "id" text NOT NULL,
                "title" text NOT NULL,
                "dept" text NOT NULL,
                "city" text NOT NULL,
                "type" "experience"."JobType" NOT NULL,
                "description" text NOT NULL DEFAULT '',
                "generalReqs" text array,
                "specialReqs" text array,
                "active" boolean NOT NULL DEFAULT true,
                "imageFileId" text,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "PK_dda635ece382c8ad2d90a179182" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "job_postings_imageFileId_key" ON "experience"."job_postings" ("imageFileId")
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."SupportTicketDept" AS ENUM('SITE', 'AGENCY')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."SupportTicketPriority" AS ENUM('HIGH', 'MEDIUM', 'LOW')
        `);
    await queryRunner.query(`
            CREATE TYPE "experience"."SupportTicketStatus" AS ENUM('OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."support_tickets" (
                "id" text NOT NULL,
                "trackingCode" text NOT NULL,
                "subject" text NOT NULL,
                "body" text NOT NULL,
                "requesterName" text NOT NULL,
                "requesterPhone" text NOT NULL,
                "userId" text,
                "dept" "experience"."SupportTicketDept" NOT NULL,
                "priority" "experience"."SupportTicketPriority" NOT NULL,
                "status" "experience"."SupportTicketStatus" NOT NULL,
                "forwardedToId" text,
                "forwardedToName" text,
                "history" jsonb NOT NULL DEFAULT '[]',
                "attachments" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "support_tickets_trackingCode_key" ON "experience"."support_tickets" ("trackingCode")
        `);
    await queryRunner.query(`
            CREATE INDEX "support_tickets_status_idx" ON "experience"."support_tickets" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "support_tickets_createdAt_idx" ON "experience"."support_tickets" ("createdAt")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."survey_invites" (
                "id" text NOT NULL,
                "bookingId" text NOT NULL,
                "flightInstanceId" text NOT NULL,
                "contactPhoneSnapshot" text,
                "flightNoSnapshot" text,
                "originCityFaSnapshot" text,
                "destCityFaSnapshot" text,
                "departureAtSnapshot" TIMESTAMP(3),
                "token" text NOT NULL,
                "smsSentAt" TIMESTAMP(3),
                "respondedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b51c3ca91943f3c02b50443e277" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "survey_invites_token_key" ON "experience"."survey_invites" ("token")
        `);
    await queryRunner.query(`
            CREATE INDEX "survey_invites_flightInstanceId_idx" ON "experience"."survey_invites" ("flightInstanceId")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "survey_invites_bookingId_key" ON "experience"."survey_invites" ("bookingId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."survey_questions" (
                "id" text NOT NULL,
                "label" text NOT NULL,
                "order" integer NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_131815624efb0f0e15a220102de" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."survey_responses" (
                "id" text NOT NULL,
                "inviteId" text NOT NULL,
                "rating" integer NOT NULL,
                "comment" text,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_349995c51959d139d8e485a58ea" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "survey_responses_inviteId_key" ON "experience"."survey_responses" ("inviteId")
        `);
    await queryRunner.query(`
            CREATE TABLE "experience"."survey_settings" (
                "id" text NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "title" text NOT NULL DEFAULT 'نظرسنجی رضایت مسافران',
                "updatedById" text,
                "updatedByName" text,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "PK_89fc312c965af1bbd5d8f15049e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "experience"."site_media_assets"
            ADD CONSTRAINT "FK_b04bef65b46a4e99ec225334588" FOREIGN KEY ("storedFileId") REFERENCES "experience"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "experience"."site_media_assets" DROP CONSTRAINT "FK_b04bef65b46a4e99ec225334588"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."survey_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."survey_responses_inviteId_key"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."survey_responses"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."survey_questions"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."survey_invites_bookingId_key"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."survey_invites_flightInstanceId_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."survey_invites_token_key"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."survey_invites"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."support_tickets_createdAt_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."support_tickets_status_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."support_tickets_trackingCode_key"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."support_tickets"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."SupportTicketStatus"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."SupportTicketPriority"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."SupportTicketDept"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."job_postings_imageFileId_key"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."job_postings"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."JobType"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."job_applications_nationalIdHash_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."job_applications_status_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."job_applications"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."JobApplicationStatus"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."MilitaryStatus"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."MaritalStatus"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."JobApplicantGender"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."careers_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_route_highlights_sortOrder_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."site_route_highlights"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_media_assets_storedFileId_key"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_media_assets_uploadedById_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."site_media_assets"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_destination_highlights_imageFileId_key"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_destination_highlights_sortOrder_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."site_destination_highlights"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."site_content_blocks_imageFileId_key"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."site_content_blocks"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."SiteContentBlockKey"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."stored_files"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."blog_posts_authorId_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."blog_posts_category_idx"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."blog_posts_coverFileId_key"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."blog_posts_slug_key"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."blog_posts_status_deletedAt_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."blog_posts"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."BlogPostStatus"
        `);
    await queryRunner.query(`
            DROP TYPE "experience"."BlogCategory"
        `);
    await queryRunner.query(`
            DROP INDEX "experience"."contact_messages_createdAt_idx"
        `);
    await queryRunner.query(`
            DROP TABLE "experience"."contact_messages"
        `);
    await queryRunner.query('DROP SCHEMA IF EXISTS "experience"');
  }
}
