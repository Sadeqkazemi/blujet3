import { OpsAdminCartableTaskProjection } from './ops-admin-projection-entities/ops-admin-cartable-task.entity';
import {
  opsAdminProjectionDataSourceOptions,
  opsAdminProjectionEntities,
  opsAdminProjectionMigrations,
} from './ops-admin-projection-data-source.options';
import { CreateOpsAdminProjectionDatabase1793088360000 } from './ops-admin-migrations/1793088360000-CreateOpsAdminProjectionDatabase';

describe('opsAdminProjectionDataSourceOptions', () => {
  it('owns only the cartable routing projection and bootstrap migration', () => {
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
    ]);
    expect(opsAdminProjectionMigrations).toEqual([
      CreateOpsAdminProjectionDatabase1793088360000,
    ]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => opsAdminProjectionDataSourceOptions(url)).toThrow(
      'OPS_ADMIN_PROJECTION_DATABASE_URL is required',
    );
  });
});
