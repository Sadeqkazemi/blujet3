import { MigrationInterface, QueryRunner } from 'typeorm';

export const DOMAIN_SCHEMA_TABLES = {
  identity: [
    'users',
    'refresh_tokens',
    'two_factor_challenges',
    'password_reset_events',
    'security_policy',
    'customer_identity_verifications',
  ],
  inventory: [
    'aircraft_cabins',
    'aircraft_definitions',
    'aircraft_seat_maps',
    'aircraft_seats',
    'airports',
    'ancillary_services',
    'cabin_fares',
    'charter_commitments',
    'fare_rules',
    'flight_charge_rules',
    'flight_instances',
    'flight_schedule_templates',
    'flights',
    'routes',
    'schedules',
    'seat_locks',
    'travel_extra_settings',
  ],
  orders: ['bookings', 'passengers', 'saved_flights', 'saved_passengers'],
  payments: [
    'bank_loan_applications',
    'bank_loan_customer_profiles',
    'bank_loan_wallet_credits',
    'bank_loan_webhook_events',
    'ledger_entries',
    'pay_idempotency_records',
    'payment_reconciliations',
    'promo_codes',
    'promo_redemptions',
    'refund_penalty_rules',
    'refund_requests',
    'saved_bank_accounts',
    'wallet_entries',
  ],
  loyalty: [
    'club_card_requests',
    'club_members',
    'club_points_entries',
    'club_tier_rules',
    'customer_referrals',
    'price_locks',
  ],
  agency: [
    'agency_allotments',
    'agency_api_keys',
    'agency_credit_lines',
    'agency_credit_requests',
    'agency_documents',
    'agency_invoices',
    'agency_membership_requests',
    'agency_messages',
    'agency_profiles',
    'agency_request_otps',
    'agency_seat_commitments',
    'agency_seat_request_flights',
    'agency_seat_requests',
    'agency_webservice_requests',
  ],
  notify: ['notifications', 'sms_logs'],
  experience: [
    'blog_posts',
    'careers_settings',
    'contact_messages',
    'job_applications',
    'job_postings',
    'site_content_blocks',
    'site_destination_highlights',
    'site_media_assets',
    'site_route_highlights',
    'stored_files',
    'support_tickets',
    'survey_invites',
    'survey_questions',
    'survey_responses',
    'survey_settings',
  ],
  ops: [
    'backup_records',
    'cartable_tasks',
    'chair_report_permissions',
    'employee_permissions',
    'external_service_configs',
    'fare_pricing_proposals',
    'flight_reviews',
    'internal_services',
    'manager_messages',
    'manager_referral_recipients',
    'manager_referral_reports',
    'manager_referrals',
    'notify_outbox_events',
    'panel_access_flags',
    'permissions',
    'system_settings',
  ],
  audit: ['ai_usage_logs', 'audit_logs'],
} as const;

type DomainSchema = keyof typeof DOMAIN_SCHEMA_TABLES;

const DOMAIN_SCHEMAS = Object.keys(DOMAIN_SCHEMA_TABLES) as DomainSchema[];

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class DomainSchemas1790524800000 implements MigrationInterface {
  public readonly name = 'DomainSchemas1790524800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of DOMAIN_SCHEMAS) {
      await queryRunner.query(
        `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`,
      );
    }

    for (const schema of DOMAIN_SCHEMAS) {
      for (const table of DOMAIN_SCHEMA_TABLES[schema]) {
        await queryRunner.query(
          `ALTER TABLE "public".${quoteIdentifier(table)} SET SCHEMA ${quoteIdentifier(schema)}`,
        );
        await queryRunner.query(
          `CREATE VIEW "public".${quoteIdentifier(table)} WITH (security_invoker = true) AS SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of DOMAIN_SCHEMAS) {
      for (const table of DOMAIN_SCHEMA_TABLES[schema]) {
        await queryRunner.query(
          `DROP VIEW IF EXISTS "public".${quoteIdentifier(table)}`,
        );
      }
    }

    for (const schema of [...DOMAIN_SCHEMAS].reverse()) {
      for (const table of [...DOMAIN_SCHEMA_TABLES[schema]].reverse()) {
        await queryRunner.query(
          `ALTER TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} SET SCHEMA "public"`,
        );
      }
      await queryRunner.query(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)}`,
      );
    }
  }
}
