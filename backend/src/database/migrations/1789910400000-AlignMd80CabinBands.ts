import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aligns the persisted MD-80 catalog with the approved public seat map. */
export class AlignMd80CabinBands1789910400000 implements MigrationInterface {
  name = 'AlignMd80CabinBands1789910400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "aircraft_seat_maps"
      SET "firstRowStart" = 3,
          "firstRowEnd" = 6,
          "firstColsLeft" = ARRAY['A','B'],
          "firstColsRight" = ARRAY['E','F'],
          "businessRowStart" = 7,
          "businessRowEnd" = 11,
          "businessColsLeft" = ARRAY['A','B'],
          "businessColsRight" = ARRAY['D','E','F'],
          "economyRowStart" = 12,
          "economyRowEnd" = 32,
          "economyColsLeft" = ARRAY['A','B'],
          "economyColsRight" = ARRAY['D','E','F'],
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE REPLACE(REPLACE(UPPER("aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);

    await queryRunner.query(`
      UPDATE "aircraft_seats" AS seat
      SET "cabinType" = CASE
            WHEN seat."row" BETWEEN 3 AND 6 THEN 'FIRST'::"public"."CabinClass"
            WHEN seat."row" BETWEEN 7 AND 11 THEN 'BUSINESS'::"public"."CabinClass"
            ELSE 'ECONOMY'::"public"."CabinClass"
          END,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM "aircraft_seat_maps" AS map
      WHERE map."aircraftDefinitionId" = seat."aircraftDefinitionId"
        AND REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
        AND seat."row" BETWEEN 3 AND 32
    `);

    await queryRunner.query(`
      DELETE FROM "aircraft_cabins" AS cabin
      USING "aircraft_seat_maps" AS map
      WHERE map."aircraftDefinitionId" = cabin."aircraftDefinitionId"
        AND REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);

    await queryRunner.query(`
      INSERT INTO "aircraft_cabins"
        ("id", "aircraftDefinitionId", "cabinType", "capacity", "createdAt", "updatedAt")
      SELECT 'md80-first-' || substr(md5(definition."id"), 1, 20),
             definition."id", 'FIRST'::"public"."CabinClass", 16,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "aircraft_definitions" AS definition
      INNER JOIN "aircraft_seat_maps" AS map
        ON map."aircraftDefinitionId" = definition."id"
      WHERE REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
      UNION ALL
      SELECT 'md80-business-' || substr(md5(definition."id"), 1, 17),
             definition."id", 'BUSINESS'::"public"."CabinClass", 25,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "aircraft_definitions" AS definition
      INNER JOIN "aircraft_seat_maps" AS map
        ON map."aircraftDefinitionId" = definition."id"
      WHERE REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
      UNION ALL
      SELECT 'md80-economy-' || substr(md5(definition."id"), 1, 18),
             definition."id", 'ECONOMY'::"public"."CabinClass", 99,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "aircraft_definitions" AS definition
      INNER JOIN "aircraft_seat_maps" AS map
        ON map."aircraftDefinitionId" = definition."id"
      WHERE REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "aircraft_seat_maps"
      SET "firstRowStart" = NULL,
          "firstRowEnd" = NULL,
          "firstColsLeft" = NULL,
          "firstColsRight" = NULL,
          "businessRowStart" = 3,
          "businessRowEnd" = 6,
          "businessColsLeft" = ARRAY['A','B'],
          "businessColsRight" = ARRAY['E','F'],
          "economyRowStart" = 7,
          "economyRowEnd" = 32,
          "economyColsLeft" = ARRAY['A','B'],
          "economyColsRight" = ARRAY['D','E','F'],
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE REPLACE(REPLACE(UPPER("aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);

    await queryRunner.query(`
      UPDATE "aircraft_seats" AS seat
      SET "cabinType" = CASE
            WHEN seat."row" BETWEEN 3 AND 6 THEN 'BUSINESS'::"public"."CabinClass"
            ELSE 'ECONOMY'::"public"."CabinClass"
          END,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM "aircraft_seat_maps" AS map
      WHERE map."aircraftDefinitionId" = seat."aircraftDefinitionId"
        AND REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
        AND seat."row" BETWEEN 3 AND 32
    `);

    await queryRunner.query(`
      DELETE FROM "aircraft_cabins" AS cabin
      USING "aircraft_seat_maps" AS map
      WHERE map."aircraftDefinitionId" = cabin."aircraftDefinitionId"
        AND REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);

    await queryRunner.query(`
      INSERT INTO "aircraft_cabins"
        ("id", "aircraftDefinitionId", "cabinType", "capacity", "createdAt", "updatedAt")
      SELECT 'md80-business-' || substr(md5(definition."id"), 1, 17),
             definition."id", 'BUSINESS'::"public"."CabinClass", 16,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "aircraft_definitions" AS definition
      INNER JOIN "aircraft_seat_maps" AS map
        ON map."aircraftDefinitionId" = definition."id"
      WHERE REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
      UNION ALL
      SELECT 'md80-economy-' || substr(md5(definition."id"), 1, 18),
             definition."id", 'ECONOMY'::"public"."CabinClass", 124,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "aircraft_definitions" AS definition
      INNER JOIN "aircraft_seat_maps" AS map
        ON map."aircraftDefinitionId" = definition."id"
      WHERE REPLACE(REPLACE(UPPER(map."aircraftType"), '-', ''), ' ', '') IN ('MD80', 'MD88')
    `);
  }
}
