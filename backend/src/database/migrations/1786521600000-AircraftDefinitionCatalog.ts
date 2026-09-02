import { randomUUID } from 'node:crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalized aircraft catalog: AircraftDefinition (code/model/title/status/
 * totalCapacity/version/audit), AircraftCabin (per-cabin capacity), and
 * AircraftSeat (individual row/column/label/side/blocked). Backfills one
 * AircraftDefinition (+ cabins + seats) per EXISTING aircraft_seat_maps row
 * (Airbus A320, MD-80 in dev/seed data) from that row's own band
 * description — MD-80's stored band values are read, never written, by
 * this migration. Adds the FIRST cabin class + a nullable FIRST seat band
 * on aircraft_seat_maps (mirrors how COMFORT was added in migration
 * 1786348800000 — no existing aircraft has FIRST seats, never fabricated).
 * Also links flight_instances to the new catalog (best-effort, nullable).
 * Additive / reversible; does not delete or rewrite any existing seat-map
 * band data.
 */
export class AircraftDefinitionCatalog1786521600000 implements MigrationInterface {
  name = 'AircraftDefinitionCatalog1786521600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."CabinClass" ADD VALUE IF NOT EXISTS 'FIRST'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AircraftStatus" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AircraftSeatSide" AS ENUM('LEFT', 'RIGHT')`,
    );

    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "firstRowStart" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "firstRowEnd" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "firstColsLeft" text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "firstColsRight" text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "aircraftDefinitionId" text`,
    );

    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "aircraftDefinitionId" text`,
    );

    await queryRunner.query(`
      CREATE TABLE "aircraft_definitions" (
        "id" text NOT NULL,
        "code" text NOT NULL,
        "model" text NOT NULL,
        "title" text NOT NULL,
        "status" "public"."AircraftStatus" NOT NULL DEFAULT 'ACTIVE',
        "totalCapacity" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "createdById" text,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedById" text,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "aircraft_definitions_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "aircraft_definitions_code_key" ON "aircraft_definitions" ("code")`,
    );
    // createdById/updatedById are plain (relation-less) columns on the
    // AircraftDefinition entity — same TS2589-avoidance convention as
    // aircraftDefinitionId below — so no DB-level FK constraint is added
    // here; adding one would desync from schema-parity.e2e-spec.ts, which
    // derives its expected schema purely from entity relation metadata.

    await queryRunner.query(`
      CREATE TABLE "aircraft_cabins" (
        "id" text NOT NULL,
        "aircraftDefinitionId" text NOT NULL,
        "cabinType" "public"."CabinClass" NOT NULL,
        "capacity" integer NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "aircraft_cabins_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "aircraft_cabins_aircraftDefinitionId_fkey"
          FOREIGN KEY ("aircraftDefinitionId") REFERENCES "aircraft_definitions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "aircraft_cabins_aircraftDefinitionId_cabinType_key" ON "aircraft_cabins" ("aircraftDefinitionId", "cabinType")`,
    );

    await queryRunner.query(`
      CREATE TABLE "aircraft_seats" (
        "id" text NOT NULL,
        "aircraftDefinitionId" text NOT NULL,
        "row" integer NOT NULL,
        "column" text NOT NULL,
        "label" text NOT NULL,
        "cabinType" "public"."CabinClass" NOT NULL,
        "side" "public"."AircraftSeatSide" NOT NULL,
        "isBlocked" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "aircraft_seats_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "aircraft_seats_aircraftDefinitionId_fkey"
          FOREIGN KEY ("aircraftDefinitionId") REFERENCES "aircraft_definitions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "aircraft_seats_aircraftDefinitionId_label_key" ON "aircraft_seats" ("aircraftDefinitionId", "label")`,
    );
    await queryRunner.query(
      `CREATE INDEX "aircraft_seats_aircraftDefinitionId_idx" ON "aircraft_seats" ("aircraftDefinitionId")`,
    );

    // aircraft_seat_maps.aircraftDefinitionId and
    // flight_instances.aircraftDefinitionId are plain (relation-less)
    // columns on their entities (documented TS2589-avoidance — see
    // aircraft-seat-map.entity.ts / flight-instance.entity.ts), so no
    // DB-level FK constraint is added for either, for the same
    // schema-parity reason as createdById/updatedById above.

    // ── Backfill: one AircraftDefinition (+cabins+seats) per existing
    // aircraft_seat_maps row, derived from that row's own band description.
    // Self-contained duplicate of seat-layout.ts's enumerateSeats(), per
    // this repo's migration convention (never import application code).
    type SeatRow = { seatCode: string; row: number; cabin: string };
    function pushCabinRows(
      seats: SeatRow[],
      excluded: Set<string>,
      rowStart: number | null,
      rowEnd: number | null,
      colsLeft: string[] | null,
      colsRight: string[] | null,
      cabin: string,
    ) {
      if (
        rowStart == null ||
        rowEnd == null ||
        !Number.isFinite(rowStart) ||
        !Number.isFinite(rowEnd) ||
        rowEnd < rowStart
      ) {
        return;
      }
      const cols = [...(colsLeft ?? []), ...(colsRight ?? [])];
      if (cols.length === 0) return;
      for (let row = rowStart; row <= rowEnd; row++) {
        for (const col of cols) {
          const seatCode = `${row}${col}`;
          if (excluded.has(seatCode)) continue;
          seats.push({ seatCode, row, cabin });
        }
      }
    }

    interface SeatMapRow {
      id: string;
      aircraftType: string;
      businessRowStart: number;
      businessRowEnd: number;
      businessColsLeft: string[] | null;
      businessColsRight: string[] | null;
      comfortRowStart: number | null;
      comfortRowEnd: number | null;
      comfortColsLeft: string[] | null;
      comfortColsRight: string[] | null;
      economyRowStart: number;
      economyRowEnd: number;
      economyColsLeft: string[] | null;
      economyColsRight: string[] | null;
      excludedSeatCodes: string[] | null;
    }

    const seatMaps = (await queryRunner.query(
      `SELECT "id", "aircraftType", "businessRowStart", "businessRowEnd",
              "businessColsLeft", "businessColsRight",
              "comfortRowStart", "comfortRowEnd",
              "comfortColsLeft", "comfortColsRight",
              "economyRowStart", "economyRowEnd",
              "economyColsLeft", "economyColsRight",
              "excludedSeatCodes"
       FROM "aircraft_seat_maps"`,
    )) as SeatMapRow[];

    const now = new Date();
    for (const map of seatMaps) {
      const excluded = new Set(map.excludedSeatCodes ?? []);
      const seats: SeatRow[] = [];
      pushCabinRows(
        seats,
        excluded,
        map.businessRowStart,
        map.businessRowEnd,
        map.businessColsLeft,
        map.businessColsRight,
        'BUSINESS',
      );
      pushCabinRows(
        seats,
        excluded,
        map.comfortRowStart,
        map.comfortRowEnd,
        map.comfortColsLeft,
        map.comfortColsRight,
        'COMFORT',
      );
      pushCabinRows(
        seats,
        excluded,
        map.economyRowStart,
        map.economyRowEnd,
        map.economyColsLeft,
        map.economyColsRight,
        'ECONOMY',
      );
      if (seats.length === 0) continue;

      const counts: Record<string, number> = {
        BUSINESS: 0,
        COMFORT: 0,
        ECONOMY: 0,
      };
      for (const s of seats) counts[s.cabin] += 1;
      const totalCapacity = seats.length;

      const aircraftId = randomUUID();
      await queryRunner.query(
        `INSERT INTO "aircraft_definitions"
           ("id", "code", "model", "title", "status", "totalCapacity", "version", "createdById", "createdAt", "updatedById", "updatedAt")
         VALUES ($1, $2, $2, $2, 'ACTIVE', $3, 1, NULL, $4, NULL, $4)
         ON CONFLICT ("id") DO NOTHING`,
        [aircraftId, map.aircraftType, totalCapacity, now],
      );

      for (const [cabinType, capacity] of Object.entries(counts)) {
        if (capacity === 0) continue;
        await queryRunner.query(
          `INSERT INTO "aircraft_cabins" ("id", "aircraftDefinitionId", "cabinType", "capacity", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [randomUUID(), aircraftId, cabinType, capacity, now],
        );
      }

      for (const seat of seats) {
        const column = seat.seatCode.slice(String(seat.row).length);
        const isLeft =
          seat.cabin === 'BUSINESS'
            ? (map.businessColsLeft ?? []).includes(column)
            : seat.cabin === 'COMFORT'
              ? (map.comfortColsLeft ?? []).includes(column)
              : (map.economyColsLeft ?? []).includes(column);
        await queryRunner.query(
          `INSERT INTO "aircraft_seats"
             ("id", "aircraftDefinitionId", "row", "column", "label", "cabinType", "side", "isBlocked", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $8)`,
          [
            randomUUID(),
            aircraftId,
            seat.row,
            column,
            seat.seatCode,
            seat.cabin,
            isLeft ? 'LEFT' : 'RIGHT',
            now,
          ],
        );
      }

      await queryRunner.query(
        `UPDATE "aircraft_seat_maps" SET "aircraftDefinitionId" = $1 WHERE "id" = $2`,
        [aircraftId, map.id],
      );
    }

    // Best-effort: link existing flight_instances to the new catalog by
    // matching their effective aircraft type (override, else the flight's
    // own type) against the newly-backfilled aircraft_definitions.code.
    // Rows with no match stay NULL — no error, no fabricated link.
    await queryRunner.query(`
      UPDATE "flight_instances" fi
      SET "aircraftDefinitionId" = ad."id"
      FROM "flights" f, "aircraft_definitions" ad
      WHERE fi."flightId" = f."id"
        AND ad."code" = COALESCE(fi."aircraftTypeOverride", f."aircraftType")
        AND fi."aircraftDefinitionId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "aircraftDefinitionId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "aircraftDefinitionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "firstColsRight"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "firstColsLeft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "firstRowEnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "firstRowStart"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "aircraft_seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aircraft_cabins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aircraft_definitions"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."AircraftSeatSide"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."AircraftStatus"`);
    // The 'FIRST' CabinClass enum value cannot be removed (Postgres
    // limitation, same documented convention as every other enum-VALUE
    // addition in this codebase) — harmless no-op once no row references it.
  }
}
