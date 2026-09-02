import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `airports.isInternational` is the established persisted flag for airports
 * located outside Iran. Older admin-created catalog rows missed this value and
 * therefore leaked into domestic public search.
 */
export class ClassifyAirportSearchScope1789564800000 implements MigrationInterface {
  name = 'ClassifyAirportSearchScope1789564800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const iranianIata = [
      'THR',
      'IKA',
      'MHD',
      'SYZ',
      'IFN',
      'TBZ',
      'KIH',
      'GSM',
      'BND',
      'AWZ',
      'RAS',
      'SRY',
      'GBT',
      'KER',
      'KSH',
      'OMH',
      'ADU',
      'ZAH',
      'BUZ',
      'AZD',
      'PGU',
      'ZBR',
      'ABD',
      'DEF',
      'IIL',
      'KHD',
      'SDG',
      'XBJ',
      'BJB',
      'AFZ',
      'LRR',
      'LFM',
      'RZR',
      'CQD',
      'JWN',
      'HDM',
      'AEU',
      'AKW',
      'AJK',
      'IAQ',
      'BXR',
      'HDR',
      'BDH',
      'GCH',
      'FAZ',
      'IHR',
      'JAR',
      'JSK',
      'JYR',
      'KLM',
      'KNR',
      'PYK',
      'KKS',
      'KHA',
      'KHK',
      'KHY',
      'LVP',
      'MRX',
      'IMQ',
      'ACP',
      'NSH',
      'PFQ',
      'GZW',
      'RJN',
      'TQZ',
      'CKT',
      'SNX',
      'RUD',
      'SYJ',
      'SXI',
      'TCX',
      'YES',
      'ACZ',
    ];
    await queryRunner.query(
      `UPDATE "airports" SET "isInternational" = (NOT ("code" = ANY($1::text[])))`,
      [iranianIata],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "airports" SET "isInternational" = false`);
    await queryRunner.query(
      `UPDATE "airports" SET "isInternational" = true WHERE "code" = ANY($1::text[])`,
      [['DXB', 'IST', 'NJF']],
    );
  }
}
