import { loyaltyEntities } from './loyalty-entities';
import {
  loyaltyMigrationDataSourceOptions,
  loyaltyMigrations,
} from './data-source.options';
import { CreateLoyaltyDatabase1793088060000 } from './migrations/1793088060000-CreateLoyaltyDatabase';
import { LoyaltyProjectionVersions1793347200000 } from './migrations/1793347200000-LoyaltyProjectionVersions';

describe('loyaltyMigrationDataSourceOptions', () => {
  it('registers only Loyalty metadata and its ordered migrations', () => {
    const url = 'postgresql://loyalty:secret@localhost/loyalty';

    expect(loyaltyMigrationDataSourceOptions(url)).toMatchObject({
      type: 'postgres',
      url,
      entities: loyaltyEntities,
      migrations: loyaltyMigrations,
      migrationsTableName: 'loyalty_migrations',
      synchronize: false,
      logging: false,
    });
    expect(loyaltyEntities).toHaveLength(6);
    expect(loyaltyMigrations).toEqual([
      CreateLoyaltyDatabase1793088060000,
      LoyaltyProjectionVersions1793347200000,
    ]);
  });

  it.each([undefined, '', '   '])('rejects a missing database URL', (url) => {
    expect(() => loyaltyMigrationDataSourceOptions(url)).toThrow(
      'LOYALTY_DATABASE_URL is required',
    );
  });
});
