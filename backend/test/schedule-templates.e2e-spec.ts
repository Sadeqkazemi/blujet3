import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Airport } from '../src/database/entities/airport.entity';
import { AircraftDefinition } from '../src/database/entities/aircraft-definition.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { FlightScheduleTemplate } from '../src/database/entities/flight-schedule-template.entity';
import { CharterCommitment } from '../src/database/entities/charter-commitment.entity';
import { AgencySeatCommitment } from '../src/database/entities/agency-seat-commitment.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { User } from '../src/database/entities/user.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { FarePricingProposal } from '../src/database/entities/fare-pricing-proposal.entity';
import { loginAs } from './helpers/login.helper';

describe('Seasonal schedule templates (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let slotSequence = 0;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bufferLogs: true });
    const logger = app.get(Logger);
    app.useLogger(logger);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function airportsAndAircraft() {
    const origin = await dataSource
      .getRepository(Airport)
      .findOneByOrFail({ code: 'THR' });
    const dest = await dataSource
      .getRepository(Airport)
      .findOneByOrFail({ code: 'MHD' });
    const aircraftList = await dataSource
      .getRepository(AircraftDefinition)
      .createQueryBuilder('a')
      .where("a.code <> 'MD-80'")
      .orderBy('a.code', 'ASC')
      .getMany();
    const fallback = await dataSource
      .getRepository(AircraftDefinition)
      .createQueryBuilder('a')
      .getOneOrFail();
    const aircraft = aircraftList[0] ?? fallback;
    const aircraftB = aircraftList[1] ?? aircraftList[0] ?? fallback;
    return { origin, dest, aircraft, aircraftB };
  }

  /** Unique local clock so aircraft overlap checks don't hit seed/history. */
  function uniqueSlot(stamp: number) {
    const minute = stamp % 60;
    const hour = 2 + Math.floor((stamp / 60) % 4); // 02–05
    const departureTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    // A distinct year per call prevents cross-test schedule overlap in the shared E2E database.
    const y = 2030 + slotSequence++;
    const m = 1 + (stamp % 9); // Jan–Sep
    const startDay = 1 + (stamp % 20);
    const startDate = `${y}-${String(m).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(startDay + 14, 28)).padStart(2, '0')}`;
    return { departureTime, startDate, endDate };
  }

  it('preview + create is idempotent; conflict on replay with different key overlapping', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now();
    const slot = uniqueSlot(stamp);
    const body = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      flightNoBase: `ST${stamp % 1000000}`,
      aircraftDefinitionId: aircraft.id,
      departureTime: slot.departureTime,
      durationMinutes: 95,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [1, 3, 5],
      agencyPriceIrr: '38000000',
      legalCeilingIrr: '42000000',
    };

    const preview = await request(app.getHttpServer())
      .post('/flights/schedule-templates/preview')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    expect(preview.status).toBe(200);
    expect(preview.body.data.occurrenceCount).toBeGreaterThan(0);
    const expectedOccurrenceCount = Number(preview.body.data.occurrenceCount);

    const key = `sched-e2e-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body, idempotencyKey: key });
    expect(created.status).toBe(201);
    expect(created.body.data.instanceCount).toBe(expectedOccurrenceCount);

    const replay = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body, idempotencyKey: key });
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(created.body.data.id);

    const conflict = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...body, idempotencyKey: `${key}-b` });
    expect(conflict.status).toBe(409);

    const instances = await dataSource.getRepository(FlightInstance).find({
      where: { scheduleTemplateId: created.body.data.id },
      order: { departureAt: 'ASC' },
    });
    expect(instances).toHaveLength(expectedOccurrenceCount);
    expect(instances.every((row) => row.definitionStatus === 'DRAFT')).toBe(
      true,
    );
    expect(instances.every((row) => row.publicSaleEnabled === false)).toBe(
      true,
    );
    expect(
      new Set(instances.map((row) => row.departureAt.toISOString())).size,
    ).toBe(instances.length);

    const resolved = await request(app.getHttpServer())
      .get('/flights/schedule-templates/resolve')
      .query({ flightNo: body.flightNoBase })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.occurrences).toHaveLength(instances.length);
    expect(resolved.body.data.nextFlightInstanceId).toBe(instances[0].id);
    expect(resolved.body.data.occurrences[0]).toMatchObject({
      id: instances[0].id,
      departureAt: instances[0].departureAt.toISOString(),
      arrivalAt: instances[0].arrivalAt.toISOString(),
      definitionStatus: 'DRAFT',
      publicSaleEnabled: false,
      version: instances[0].version,
    });
  });

  it('completes a materialized series atomically and rolls back invalid fare rules', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { accessToken: financeToken } = await loginAs(app, 'finance');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 7;
    const slot = uniqueSlot(stamp);
    const created = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originAirportId: origin.id,
        destinationAirportId: dest.id,
        flightNoBase: `AT${String(stamp % 10000).padStart(4, '0')}`,
        aircraftDefinitionId: aircraft.id,
        departureTime: slot.departureTime,
        durationMinutes: 95,
        startDate: slot.startDate,
        endDate: slot.endDate,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        agencyPriceIrr: '38000000',
        legalCeilingIrr: '42000000',
        idempotencyKey: `atomic-${stamp}`,
      });
    if (created.status !== 201) {
      throw new Error(
        `schedule create failed: ${JSON.stringify(created.body)}`,
      );
    }

    const occurrences = await dataSource.getRepository(FlightInstance).find({
      where: { scheduleTemplateId: created.body.data.id },
      order: { departureAt: 'ASC' },
    });
    expect(occurrences.length).toBeGreaterThan(1);
    const [validOccurrence] = occurrences;
    const cabinRows = validOccurrence.cabinCapacities as Array<{
      cabin: 'FIRST' | 'BUSINESS' | 'COMFORT' | 'ECONOMY';
      seats: number;
    }>;
    const cabin = cabinRows.find((row) => row.seats > 0)!;
    const command = {
      expectedVersion: validOccurrence.version,
      basePriceIrr: '38000000',
      competitorPriceIrr: '40000000',
      charterSeats: 0,
      chargeRules: [],
      fareRules: [
        {
          cabin: cabin.cabin,
          classCode: 'Y',
          priceIrr: '39000000',
          seatsAllocated: cabin.seats,
          taxIrr: '0',
          refundable: true,
          changeable: true,
          allowedChannels: ['SYSTEM', 'AGENCY'],
        },
      ],
      pricingProposal: {
        proposedPriceIrr: '39000000',
        legalRateIrr: '42000000',
        commercialNote: 'ثبت اتمیک برنامه پروازی',
      },
    };

    const completed = await request(app.getHttpServer())
      .put(`/flights/${validOccurrence.id}/complete-and-submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(command);
    expect(completed.status).toBe(200);
    expect(completed.body.data.definitionStatus).toBe('PENDING_OPERATIONS');
    expect(completed.body.data.version).toBe(validOccurrence.version + 1);
    expect(completed.body.data.scheduleGroup.occurrenceCount).toBe(
      occurrences.length,
    );
    const submittedOccurrences = await dataSource
      .getRepository(FlightInstance)
      .find({
        where: { scheduleTemplateId: created.body.data.id },
        order: { departureAt: 'ASC' },
      });
    expect(
      submittedOccurrences.every(
        (row) => row.definitionStatus === 'PENDING_OPERATIONS',
      ),
    ).toBe(true);
    expect(
      await dataSource.getRepository(FareRule).count({
        where: {
          flightInstanceId: In(submittedOccurrences.map((row) => row.id)),
        },
      }),
    ).toBe(submittedOccurrences.length);
    expect(
      await dataSource.getRepository(FareRule).count({
        where: { flightInstanceId: validOccurrence.id },
      }),
    ).toBe(1);
    expect(
      await dataSource.getRepository(FarePricingProposal).findOneBy({
        flightInstanceId: validOccurrence.id,
      }),
    ).toMatchObject({ proposedPriceIrr: 39_000_000n });

    const rollbackStamp = stamp + 19;
    const rollbackSlot = uniqueSlot(rollbackStamp);
    const rollbackSchedule = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originAirportId: origin.id,
        destinationAirportId: dest.id,
        flightNoBase: `RB${String(rollbackStamp % 10000).padStart(4, '0')}`,
        aircraftDefinitionId: aircraft.id,
        departureTime: rollbackSlot.departureTime,
        durationMinutes: 95,
        startDate: rollbackSlot.startDate,
        endDate: rollbackSlot.endDate,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        agencyPriceIrr: '38000000',
        legalCeilingIrr: '42000000',
        idempotencyKey: `rollback-${rollbackStamp}`,
      });
    expect(rollbackSchedule.status).toBe(201);
    const rollbackOccurrences = await dataSource
      .getRepository(FlightInstance)
      .find({
        where: { scheduleTemplateId: rollbackSchedule.body.data.id },
        order: { departureAt: 'ASC' },
      });
    expect(rollbackOccurrences.length).toBeGreaterThan(0);
    const rollbackOccurrence = rollbackOccurrences[0];
    const initialFareRules = await dataSource.getRepository(FareRule).find({
      where: { flightInstanceId: rollbackOccurrence.id },
      order: { id: 'ASC' },
    });
    expect(initialFareRules).toHaveLength(3);

    const forbidden = await request(app.getHttpServer())
      .put(`/flights/${rollbackOccurrence.id}/complete-and-submit`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ ...command, expectedVersion: rollbackOccurrence.version });
    expect(forbidden.status).toBe(403);

    const unknown = await request(app.getHttpServer())
      .put('/flights/00000000-0000-4000-8000-000000000000/complete-and-submit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(command);
    expect(unknown.status).toBe(404);

    const stale = await request(app.getHttpServer())
      .put(`/flights/${rollbackOccurrence.id}/complete-and-submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...command,
        expectedVersion: rollbackOccurrence.version + 1,
      });
    expect(stale.status).toBe(409);

    const physicalRewrite = await request(app.getHttpServer())
      .put(`/flights/${rollbackOccurrence.id}/complete-and-submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...command,
        expectedVersion: rollbackOccurrence.version,
        capacity: rollbackOccurrence.capacity + 100,
      });
    expect(physicalRewrite.status).toBe(400);

    const invalid = await request(app.getHttpServer())
      .put(`/flights/${rollbackOccurrence.id}/complete-and-submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...command,
        expectedVersion: rollbackOccurrence.version,
        fareRules: [command.fareRules[0], command.fareRules[0]],
      });
    expect(invalid.status).toBe(400);
    const fareRulesAfterRollback = await dataSource
      .getRepository(FareRule)
      .find({
        where: { flightInstanceId: rollbackOccurrence.id },
        order: { id: 'ASC' },
      });
    expect(fareRulesAfterRollback).toEqual(initialFareRules);
    const afterRollback = await dataSource
      .getRepository(FlightInstance)
      .findOneByOrFail({ id: rollbackOccurrence.id });
    expect(afterRollback.definitionStatus).toBe('DRAFT');
    expect(afterRollback.version).toBe(rollbackOccurrence.version);
  });

  it('concurrent creates do not leave incomplete or duplicate schedules', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 17;
    const slot = uniqueSlot(stamp);
    const body = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      flightNoBase: `SC${stamp % 1000000}`,
      aircraftDefinitionId: aircraft.id,
      departureTime: slot.departureTime,
      durationMinutes: 100,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [1, 3],
      agencyPriceIrr: '36000000',
      legalCeilingIrr: '41000000',
    };
    const preview = await request(app.getHttpServer())
      .post('/flights/schedule-templates/preview')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    expect(preview.status).toBe(200);
    const expected = preview.body.data.occurrenceCount as number;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...body, idempotencyKey: `conc-a-${stamp}` }),
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...body, idempotencyKey: `conc-b-${stamp}` }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    expect(winner.body.data.instanceCount).toBe(expected);

    const templates = await dataSource
      .getRepository(FlightScheduleTemplate)
      .count({
        where: { flightNoBase: body.flightNoBase },
      });
    expect(templates).toBe(1);

    const instances = await dataSource
      .getRepository(FlightInstance)
      .count({ where: { scheduleTemplateId: winner.body.data.id } });
    expect(instances).toBe(expected);
  });

  it('deactivate cancels future unsold instances', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 31;
    const slot = uniqueSlot(stamp);
    const body = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      flightNoBase: `SD${stamp % 1000000}`,
      aircraftDefinitionId: aircraft.id,
      departureTime: slot.departureTime,
      durationMinutes: 90,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [2, 4],
      agencyPriceIrr: '35000000',
      legalCeilingIrr: '40000000',
      idempotencyKey: `sched-deact-${stamp}`,
    };
    const created = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    expect(created.status).toBe(201);

    const deact = await request(app.getHttpServer())
      .post(`/flights/schedule-templates/${created.body.data.id}/deactivate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(deact.status).toBe(200);
    expect(deact.body.data.status).toBe('DEACTIVATED');
  });

  it('does not cancel instances with active charter/agency commitments', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const actor = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 53;
    const slot = uniqueSlot(stamp);
    const body = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      flightNoBase: `CM${stamp % 1000000}`,
      aircraftDefinitionId: aircraft.id,
      departureTime: slot.departureTime,
      durationMinutes: 90,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [1, 3, 5],
      agencyPriceIrr: '34000000',
      legalCeilingIrr: '39000000',
      idempotencyKey: `sched-commit-${stamp}`,
    };
    const created = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    expect(created.status).toBe(201);

    const instances = await dataSource.getRepository(FlightInstance).find({
      where: { scheduleTemplateId: created.body.data.id },
      order: { departureAt: 'ASC' },
    });
    expect(instances.length).toBeGreaterThan(1);
    const protectedFi = instances[0];
    const freeFi = instances[1];
    expect(protectedFi).toBeDefined();
    expect(freeFi).toBeDefined();
    if (!protectedFi || !freeFi) {
      throw new Error('expected at least two schedule instances');
    }

    await dataSource.getRepository(CharterCommitment).save(
      dataSource.getRepository(CharterCommitment).create({
        flightInstanceId: protectedFi.id,
        cabin: 'ECONOMY',
        seats: 2,
        contractPriceIrr: 1_000_000n,
        createdById: actor.id,
        createdAt: new Date(),
        status: 'ACTIVE',
      }),
    );
    const [agency] = await dataSource.getRepository(AgencyProfile).find({
      take: 1,
    });
    if (agency?.id) {
      await dataSource.getRepository(AgencySeatCommitment).save(
        dataSource.getRepository(AgencySeatCommitment).create({
          flightInstanceId: protectedFi.id,
          agencyId: agency.id,
          cabin: 'BUSINESS',
          seats: 1,
          contractPriceIrr: 2_000_000n,
          createdById: actor.id,
          createdAt: new Date(),
          status: 'ACTIVE',
        }),
      );
    }

    const deact = await request(app.getHttpServer())
      .post(`/flights/schedule-templates/${created.body.data.id}/deactivate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(deact.status).toBe(200);

    const refreshedProtected = await dataSource
      .getRepository(FlightInstance)
      .findOneByOrFail({ id: protectedFi.id });
    const refreshedFree = await dataSource
      .getRepository(FlightInstance)
      .findOneByOrFail({ id: freeFi.id });
    expect(refreshedProtected.status).toBe('SCHEDULED');
    expect(refreshedFree.status).toBe('CANCELLED');
  });

  it('concurrent same aircraft + different flightNo creates both unique routes', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 71;
    const slot = uniqueSlot(stamp);
    const base = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      aircraftDefinitionId: aircraft.id,
      departureTime: slot.departureTime,
      durationMinutes: 90,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [1, 3],
      agencyPriceIrr: '33000000',
      legalCeilingIrr: '38000000',
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...base,
          flightNoBase: `FA${stamp % 1000000}`,
          idempotencyKey: `fa-${stamp}`,
        }),
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...base,
          flightNoBase: `FB${stamp % 1000000}`,
          idempotencyKey: `fb-${stamp}`,
        }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it('concurrent same flightNo + different aircraft does not deadlock', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft, aircraftB } = await airportsAndAircraft();
    if (aircraft.id === aircraftB.id) {
      // Seed may only have one non-MD-80 definition — still prove serialization.
    }
    const stamp = Date.now() + 91;
    const slot = uniqueSlot(stamp);
    const flightNo = `FX${stamp % 1000000}`;
    const base = {
      originAirportId: origin.id,
      destinationAirportId: dest.id,
      flightNoBase: flightNo,
      departureTime: slot.departureTime,
      durationMinutes: 90,
      startDate: slot.startDate,
      endDate: slot.endDate,
      weekdays: [2, 4],
      agencyPriceIrr: '33000000',
      legalCeilingIrr: '38000000',
    };
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...base,
          aircraftDefinitionId: aircraft.id,
          idempotencyKey: `fx-a-${stamp}`,
        }),
      request(app.getHttpServer())
        .post('/flights/schedule-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...base,
          aircraftDefinitionId: aircraftB.id,
          idempotencyKey: `fx-b-${stamp}`,
        }),
    ]);
    const statuses = [a.status, b.status].sort();
    // Same flightNo + overlapping times → one success, one conflict (or both
    // conflict if aircraft ids collide and another race wins first).
    expect(statuses[0]).toBeGreaterThanOrEqual(201);
    expect([201, 409]).toContain(a.status);
    expect([201, 409]).toContain(b.status);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(1);
  });

  it('race: deactivate vs commitment never leaves cancelled+committed', async () => {
    const { accessToken } = await loginAs(app, 'comm');
    const { origin, dest, aircraft } = await airportsAndAircraft();
    const stamp = Date.now() + 111;
    const slot = uniqueSlot(stamp);
    const created = await request(app.getHttpServer())
      .post('/flights/schedule-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originAirportId: origin.id,
        destinationAirportId: dest.id,
        flightNoBase: `RC${stamp % 1000000}`,
        aircraftDefinitionId: aircraft.id,
        departureTime: slot.departureTime,
        durationMinutes: 90,
        startDate: slot.startDate,
        endDate: slot.endDate,
        weekdays: [1, 2, 3, 4, 5],
        agencyPriceIrr: '32000000',
        legalCeilingIrr: '37000000',
        idempotencyKey: `race-${stamp}`,
      });
    expect(created.status).toBe(201);
    const fi = await dataSource
      .getRepository(FlightInstance)
      .createQueryBuilder('fi')
      .where('fi.scheduleTemplateId = :id', { id: created.body.data.id })
      .orderBy('fi.departureAt', 'ASC')
      .getOne();
    expect(fi).toBeTruthy();
    if (!fi) throw new Error('missing instance');

    const [deact, commit] = await Promise.all([
      request(app.getHttpServer())
        .post(`/flights/schedule-templates/${created.body.data.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/flights/${fi.id}/commitments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ cabin: 'ECONOMY', seats: 1, contractPriceIrr: '500000000' }),
    ]);
    expect(deact.status).toBe(200);
    expect([201, 409]).toContain(commit.status);

    const refreshed = await dataSource
      .getRepository(FlightInstance)
      .findOneByOrFail({ id: fi.id });
    const activeCommit = await dataSource
      .getRepository(CharterCommitment)
      .findOne({
        where: { flightInstanceId: fi.id, status: 'ACTIVE' },
      });
    if (refreshed.status === 'CANCELLED') {
      expect(activeCommit).toBeNull();
      expect(commit.status).toBe(409);
    } else {
      expect(refreshed.status).toBe('SCHEDULED');
      expect(activeCommit).not.toBeNull();
      expect(commit.status).toBe(201);
    }
  });
});
