import { identityEntities } from './identity-entities';
import {
  identityMigrationDataSourceOptions,
  identityMigrations,
} from './data-source.options';
import { CreateIdentityDatabase1793088180000 } from './migrations/1793088180000-CreateIdentityDatabase';

describe('identityMigrationDataSourceOptions', () => {
  it('registers only Identity metadata and its bootstrap migration', () => {
    const url = 'postgresql://identity:secret@localhost/identity';

    expect(identityMigrationDataSourceOptions(url)).toMatchObject({
      type: 'postgres',
      url,
      entities: identityEntities,
      migrations: identityMigrations,
      migrationsTableName: 'identity_migrations',
      synchronize: false,
      logging: false,
    });
    expect(identityEntities).toHaveLength(6);
    expect(identityMigrations).toEqual([CreateIdentityDatabase1793088180000]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => identityMigrationDataSourceOptions(url)).toThrow(
      'IDENTITY_DATABASE_URL is required',
    );
  });
});
