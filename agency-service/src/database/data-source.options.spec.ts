import { agencyProjectionEntities } from './agency-entities';
import {
  agencyMigrationDataSourceOptions,
  agencyProjectionMigrations,
} from './data-source.options';
import { CreateAgencyProjectionDatabase1793088120000 } from './migrations/1793088120000-CreateAgencyProjectionDatabase';

describe('agencyMigrationDataSourceOptions', () => {
  it('registers only the current Agency projections and migration', () => {
    const url = 'postgresql://agency:secret@localhost/agency';

    expect(agencyMigrationDataSourceOptions(url)).toMatchObject({
      type: 'postgres',
      url,
      entities: agencyProjectionEntities,
      migrations: agencyProjectionMigrations,
      migrationsTableName: 'agency_projection_migrations',
      synchronize: false,
      logging: false,
    });
    expect(agencyProjectionEntities).toHaveLength(3);
    expect(agencyProjectionMigrations).toEqual([
      CreateAgencyProjectionDatabase1793088120000,
    ]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => agencyMigrationDataSourceOptions(url)).toThrow(
      'AGENCY_DATABASE_URL is required',
    );
  });
});
