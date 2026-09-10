import { OpsAdminCartableTaskProjection } from './ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { OpsAdminCartableEventReceipt } from './ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import {
  opsAdminProjectionDataSourceOptions,
  opsAdminProjectionEntities,
  opsAdminProjectionMigrations,
} from './ops-admin-projection-data-source.options';
import { CreateOpsAdminProjectionDatabase1793088360000 } from './ops-admin-migrations/1793088360000-CreateOpsAdminProjectionDatabase';
import { OpsAdminProjectionInbox1793260800000 } from './ops-admin-migrations/1793260800000-OpsAdminProjectionInbox';

describe('opsAdminProjectionDataSourceOptions', () => {
  it('owns only the cartable projection, receipt and their migrations', () => {
    const url = 'postgresql://ops_admin:secret@localhost/ops_admin';

    expect(opsAdminProjectionDataSourceOptions(url)).toMatchObject({
      type: 'postgres',
      url,
      synchronize: false,
      logging: false,
      migrationsTableName: 'ops_admin_projection_migrations',
      entities: opsAdminProjectionEntities,
      migrations: opsAdminProjectionMigrations,
    });
    expect(opsAdminProjectionEntities).toEqual([
      OpsAdminCartableTaskProjection,
      OpsAdminCartableEventReceipt,
    ]);
    expect(opsAdminProjectionMigrations).toEqual([
      CreateOpsAdminProjectionDatabase1793088360000,
      OpsAdminProjectionInbox1793260800000,
    ]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => opsAdminProjectionDataSourceOptions(url)).toThrow(
      'OPS_ADMIN_PROJECTION_DATABASE_URL is required',
    );
  });
});
