import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityDatabase1793088180000 implements MigrationInterface {
  public readonly name = 'CreateIdentityDatabase1793088180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "identity"');
    await queryRunner.query(
      `CREATE TYPE "identity"."Role" AS ENUM('USER', 'AGENCY', 'EMPLOYEE', 'IT_MANAGER', 'COMMERCIAL_MANAGER', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER', 'SENIOR_MANAGER', 'CEO', 'BOARD_CHAIR', 'SITE_ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."Locale" AS ENUM('FA', 'EN', 'AR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."TwoFactorPurpose" AS ENUM('STAFF_LOGIN_2FA', 'AGENCY_LOGIN_2FA', 'CUSTOMER_OTP_LOGIN', 'STEP_UP_VERIFICATION', 'EMAIL_VERIFY', 'PASSWORD_RESET_EMAIL', 'AGENCY_PASSWORD_RESET')`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."StepUpScope" AS ENUM('ADMIN_ROLE_CHANGE', 'API_KEY_ROTATE', 'REFUND_PAYOUT', 'PRICE_CAPACITY_CHANGE', 'SESSION_REVOKE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."EmployeeReferralScope" AS ENUM('MANAGERS_ONLY', 'ALL_STAFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."CustomerIdentityStatus" AS ENUM('NOT_STARTED', 'SUBMITTED', 'APPROVED', 'REJECTED')`,
    );

    await queryRunner.query(`CREATE TABLE "identity"."users" (
      "id" text NOT NULL,
      "role" "identity"."Role" NOT NULL,
      "phone" text,
      "username" text,
      "passwordHash" text,
      "email" text,
      "fullName" text NOT NULL,
      "twoFactorEnabled" boolean NOT NULL DEFAULT false,
      "isSuperAdmin" boolean NOT NULL DEFAULT false,
      "panelPermissions" jsonb,
      "twoFactorSecret" text,
      "temporaryPasswordOnlyUntil" TIMESTAMP(3),
      "isActive" boolean NOT NULL DEFAULT true,
      "deletedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "createdById" text,
      "dept" text,
      "lastLoginAt" TIMESTAMP(3),
      "mustChangePassword" boolean NOT NULL DEFAULT false,
      "rank" text,
      "referralScope" "identity"."EmployeeReferralScope",
      "nationalIdEnc" text,
      "nationalIdHash" text,
      "passportNoEnc" text,
      "birthDate" TIMESTAMP(3),
      "addressEnc" text,
      "emailVerifiedAt" TIMESTAMP(3),
      "preferredLocale" "identity"."Locale" NOT NULL DEFAULT 'FA',
      "referralCode" text,
      CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "users_email_key" ON "identity"."users" ("email")',
    );
    await queryRunner.query(
      'CREATE INDEX "users_nationalIdHash_idx" ON "identity"."users" ("nationalIdHash")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "users_phone_key" ON "identity"."users" ("phone")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "users_referralCode_key" ON "identity"."users" ("referralCode")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "users_username_key" ON "identity"."users" ("username")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "users_one_active_super_admin_idx" ON "identity"."users" ("isSuperAdmin") WHERE "isSuperAdmin" = true AND "deletedAt" IS NULL',
    );

    await queryRunner.query(`CREATE TABLE "identity"."refresh_tokens" (
      "id" text NOT NULL,
      "userId" text NOT NULL,
      "tokenHash" text NOT NULL,
      "userAgent" text,
      "ip" text,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "revokedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "identity"."refresh_tokens" ("tokenHash")',
    );
    await queryRunner.query(
      'CREATE INDEX "refresh_tokens_userId_idx" ON "identity"."refresh_tokens" ("userId")',
    );

    await queryRunner.query(`CREATE TABLE "identity"."two_factor_challenges" (
      "id" text NOT NULL,
      "userId" text NOT NULL,
      "purpose" "identity"."TwoFactorPurpose" NOT NULL,
      "codeHash" text NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "consumedAt" TIMESTAMP(3),
      "attempts" integer NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "scope" "identity"."StepUpScope",
      CONSTRAINT "two_factor_challenges_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "two_factor_challenges_userId_idx" ON "identity"."two_factor_challenges" ("userId")',
    );

    await queryRunner.query(`CREATE TABLE "identity"."password_reset_events" (
      "id" text NOT NULL,
      "employeeId" text NOT NULL,
      "resetById" text NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "password_reset_events_pkey" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "identity"."security_policy" (
      "id" integer NOT NULL DEFAULT 1,
      "minLength" integer NOT NULL DEFAULT 10,
      "expiryDays" integer NOT NULL DEFAULT 90,
      "maxAttempts" integer NOT NULL DEFAULT 5,
      "requireUppercase" boolean NOT NULL DEFAULT true,
      "requireNumber" boolean NOT NULL DEFAULT true,
      "requireSymbol" boolean NOT NULL DEFAULT true,
      "blockReuse" boolean NOT NULL DEFAULT true,
      "staffTwoFactorMandatory" boolean NOT NULL DEFAULT true,
      "updatedById" text,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "security_policy_pkey" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "identity"."customer_identity_verifications" (
      "id" text NOT NULL,
      "userId" text NOT NULL,
      "status" "identity"."CustomerIdentityStatus" NOT NULL DEFAULT 'NOT_STARTED',
      "idCardFileId" text,
      "submittedAt" TIMESTAMP(3),
      "reviewedAt" TIMESTAMP(3),
      "rejectReason" text,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "customer_identity_verifications_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "customer_identity_verifications_userId_key" ON "identity"."customer_identity_verifications" ("userId")',
    );

    await queryRunner.query(`ALTER TABLE "identity"."users"
      ADD CONSTRAINT "users_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "identity"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."refresh_tokens"
      ADD CONSTRAINT "refresh_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "identity"."users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."two_factor_challenges"
      ADD CONSTRAINT "two_factor_challenges_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "identity"."users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."password_reset_events"
      ADD CONSTRAINT "password_reset_events_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "identity"."users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."password_reset_events"
      ADD CONSTRAINT "password_reset_events_resetById_fkey"
      FOREIGN KEY ("resetById") REFERENCES "identity"."users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."security_policy"
      ADD CONSTRAINT "security_policy_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "identity"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "identity"."customer_identity_verifications"
      ADD CONSTRAINT "customer_identity_verifications_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "identity"."users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP SCHEMA IF EXISTS "identity" CASCADE');
  }
}
