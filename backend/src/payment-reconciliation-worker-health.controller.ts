import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class PaymentReconciliationWorkerHealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'blujet-payment-reconciliation' };
  }

  @Get('ready')
  async ready() {
    try {
      const rows = await this.dataSource.query<
        Array<{
          role: string;
          readOnly: string;
          restricted: boolean;
          noOwnership: boolean;
          noDdl: boolean;
        }>
      >(`SELECT current_user AS role,
          current_setting('transaction_read_only') AS "readOnly",
          NOT (r.rolsuper OR r.rolinherit OR r.rolcreaterole OR r.rolcreatedb
            OR r.rolreplication OR r.rolbypassrls) AS restricted,
          NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid) AS "noOwnership",
          NOT has_database_privilege(current_user, current_database(), 'CREATE')
            AND NOT EXISTS (SELECT 1 FROM pg_namespace n
              WHERE has_schema_privilege(current_user, n.oid, 'CREATE')) AS "noDdl"
        FROM pg_roles r WHERE r.rolname = current_user`);
      const state = rows[0];
      if (
        state?.role !== 'blujet_payment_reconciliation_reader' ||
        state.readOnly !== 'on' ||
        !state.restricted ||
        !state.noOwnership ||
        !state.noDdl
      ) {
        throw new Error();
      }
      return {
        status: 'ok',
        service: 'blujet-payment-reconciliation',
        info: { database: { status: 'up', readOnly: true } },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'blujet-payment-reconciliation',
        error: { database: { status: 'down-or-writable' } },
      });
    }
  }
}
