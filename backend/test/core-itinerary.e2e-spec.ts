import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { Airport } from '../src/database/entities/airport.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { CoreItineraryOrder } from '../src/database/entities/core-itinerary-order.entity';
import { CoreItineraryLifecycleEvent } from '../src/database/entities/core-itinerary-lifecycle-event.entity';
import { CoreItinerarySegment } from '../src/database/entities/core-itinerary-segment.entity';
import { CoreItineraryTraveller } from '../src/database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from '../src/database/entities/core-itinerary-traveller-segment.entity';
import { CoreItineraryPaymentConfirmation } from '../src/database/entities/core-itinerary-payment-confirmation.entity';
import { CoreItineraryTicketDocument } from '../src/database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryFlightCoupon } from '../src/database/entities/core-itinerary-flight-coupon.entity';
import { FareRule } from '../src/database/entities/fare-rule.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Route } from '../src/database/entities/route.entity';
import { TravelExtraSetting } from '../src/database/entities/travel-extra-setting.entity';
import { User } from '../src/database/entities/user.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { TicketDocumentStock } from '../src/database/entities/ticket-document-stock.entity';
import { createTestApp } from './helpers/app.helper';
import { CoreItineraryHoldExpiryService } from '../src/modules/pss/core-itinerary-hold-expiry.service';

describe('Core itinerary internal API', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const token = process.env.PSS_INTERNAL_TOKEN!;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const aircraftType = `ITIN-${suffix}`;
  const routeIds = [randomUUID(), randomUUID()];
  const flightIds = [randomUUID(), randomUUID()];
  const instanceIds = [randomUUID(), randomUUID()];
  const fareRuleIds = [randomUUID(), randomUUID()];
  const airportId = randomUUID();
  const extraId = randomUUID();
  const holdOwnerId = randomUUID();

  async function cleanupHoldOrders() {
    const orders = await dataSource
      .getRepository(CoreItineraryOrder)
      .find({ where: { ownerId: holdOwnerId }, select: { id: true } });
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length > 0) {
      const documents = await dataSource
        .getRepository(CoreItineraryTicketDocument)
        .find({ where: { orderId: In(orderIds) }, select: { id: true } });
      const documentIds = documents.map((document) => document.id);
      if (documentIds.length > 0) {
        await dataSource
          .getRepository(CoreItineraryFlightCoupon)
          .delete({ ticketDocumentId: In(documentIds) });
      }
      await dataSource
        .getRepository(CoreItineraryTicketDocument)
        .delete({ orderId: In(orderIds) });
      await dataSource
        .getRepository(LedgerEntry)
        .delete({ itineraryOrderId: In(orderIds) });
      await dataSource
        .getRepository(CoreItineraryPaymentConfirmation)
        .delete({ orderId: In(orderIds) });
      await dataSource
        .getRepository(CoreItineraryLifecycleEvent)
        .delete({ orderId: In(orderIds) });
      await dataSource
        .getRepository(CoreItineraryOrder)
        .delete({ id: In(orderIds) });
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    const userRepo = dataSource.getRepository(User);
    await userRepo.save(
      userRepo.create({
        id: holdOwnerId,
        role: 'USER',
        fullName: 'مالک تست سفر چندسگمنتی',
        isActive: true,
        updatedAt: new Date(),
      }),
    );

    const seatMapRepo = dataSource.getRepository(AircraftSeatMap);
    await seatMapRepo.save(
      seatMapRepo.create({
        aircraftType,
        businessRowStart: 1,
        businessRowEnd: 0,
        businessColsLeft: [],
        businessColsRight: [],
        economyRowStart: 1,
        economyRowEnd: 2,
        economyColsLeft: ['A'],
        economyColsRight: ['C'],
        updatedAt: new Date(),
      }),
    );

    const codes = [`X${suffix}`, `Y${suffix}`, `Z${suffix}`];
    const airportRepo = dataSource.getRepository(Airport);
    await airportRepo.save(
      airportRepo.create({
        id: airportId,
        code: codes[1],
        cityFa: 'فرودگاه تست اتصال',
        tz: 'UTC',
        minConnectMin: 120,
      }),
    );
    const routeRepo = dataSource.getRepository(Route);
    await routeRepo.save([
      routeRepo.create({
        id: routeIds[0],
        originCode: codes[0],
        destCode: codes[1],
        durationMin: 120,
      }),
      routeRepo.create({
        id: routeIds[1],
        originCode: codes[1],
        destCode: codes[2],
        durationMin: 180,
      }),
    ]);

    const flightRepo = dataSource.getRepository(Flight);
    await flightRepo.save([
      flightRepo.create({
        id: flightIds[0],
        flightNo: `IT-${suffix}-1`,
        routeId: routeIds[0],
        aircraftType,
      }),
      flightRepo.create({
        id: flightIds[1],
        flightNo: `IT-${suffix}-2`,
        routeId: routeIds[1],
        aircraftType,
      }),
    ]);

    const firstDeparture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const firstArrival = new Date(
      firstDeparture.getTime() + 2 * 60 * 60 * 1000,
    );
    const secondDeparture = new Date(
      firstArrival.getTime() + 2 * 60 * 60 * 1000,
    );
    const secondArrival = new Date(
      secondDeparture.getTime() + 3 * 60 * 60 * 1000,
    );
    const instanceRepo = dataSource.getRepository(FlightInstance);
    await instanceRepo.save([
      instanceRepo.create({
        id: instanceIds[0],
        flightId: flightIds[0],
        departureAt: firstDeparture,
        arrivalAt: firstArrival,
        capacity: 4,
        publicSaleEnabled: true,
        agencySaleEnabled: true,
        cabinCapacities: [{ cabin: 'ECONOMY', seats: 4 }],
      }),
      instanceRepo.create({
        id: instanceIds[1],
        flightId: flightIds[1],
        departureAt: secondDeparture,
        arrivalAt: secondArrival,
        capacity: 4,
        publicSaleEnabled: true,
        agencySaleEnabled: true,
        cabinCapacities: [{ cabin: 'ECONOMY', seats: 4 }],
      }),
    ]);

    const fareRuleRepo = dataSource.getRepository(FareRule);
    await fareRuleRepo.save(
      instanceIds.map((flightInstanceId, index) =>
        fareRuleRepo.create({
          id: fareRuleIds[index],
          flightInstanceId,
          cabin: 'ECONOMY',
          classCode: 'Y',
          priceIrr: 10_000_000n,
          sitePriceIrr: 10_000_000n,
          seatsAllocated: 4,
          siteSeatsReleased: 3,
          agencySeatsReleased: 1,
          agencyReleasePriceIrr: 9_000_000n,
          allowedChannels: [],
          taxIrr: BigInt(index + 1) * 1_000_000n,
          baggageAllowanceKg: index === 0 ? 20 : 15,
        }),
      ),
    );

    const extraRepo = dataSource.getRepository(TravelExtraSetting);
    await extraRepo.save(
      extraRepo.create({
        id: extraId,
        code: `CUSTOM_${suffix}`,
        titleFa: 'بار اضافه تست سفر',
        titleEn: 'Test extra baggage',
        titleAr: null,
        descriptionFa: null,
        descriptionEn: null,
        descriptionAr: null,
        billingUnit: 'PER_KG',
        priceIrr: 500_000n,
        active: true,
        purchaseEnabled: true,
        sortOrder: 0,
        updatedById: null,
      }),
    );
  });

  afterAll(async () => {
    await cleanupHoldOrders();
    await dataSource.getRepository(TravelExtraSetting).delete({ id: extraId });
    await dataSource.getRepository(FareRule).delete({ id: In(fareRuleIds) });
    await dataSource
      .getRepository(FlightInstance)
      .delete({ id: In(instanceIds) });
    await dataSource.getRepository(Flight).delete({ id: In(flightIds) });
    await dataSource.getRepository(Route).delete({ id: In(routeIds) });
    await dataSource.getRepository(Airport).delete({ id: airportId });
    await dataSource.getRepository(AircraftSeatMap).delete({ aircraftType });
    await dataSource.getRepository(User).delete({ id: holdOwnerId });
    await app.close();
  });

  function validRequest() {
    return {
      channel: 'SYSTEM',
      segments: instanceIds.map((flightInstanceId, index) => ({
        flightInstanceId,
        sequence: index + 1,
        cabin: 'ECONOMY',
        fareClassCode: 'Y',
      })),
    };
  }

  function validQuoteRequest() {
    const segments = validRequest().segments;
    segments[0] = {
      ...segments[0],
      extras: [{ id: extraId, quantity: 3 }],
    };
    return {
      channel: 'SYSTEM',
      segments,
      travellers: [
        { passengerType: 'ADULT', birthDate: '1990-01-01' },
        { passengerType: 'CHILD', birthDate: '2020-01-01' },
      ],
    };
  }

  function validHoldRequest() {
    return {
      ...validQuoteRequest(),
      ownerId: holdOwnerId,
      contactPhone: '09121234567',
      travellers: [
        {
          fullName: 'علی رضایی',
          nationalId: '0012345679',
          passengerType: 'ADULT',
          birthDate: '1990-01-01',
        },
        {
          fullName: 'سارا احمدی',
          passengerType: 'CHILD',
          birthDate: '2020-01-01',
        },
      ],
    };
  }

  it('requires the internal service token', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .send(validRequest());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed segment input', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({
        channel: 'SYSTEM',
        segments: [{ sequence: 1, cabin: 'INVALID' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns not found without exposing missing inventory details', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({
        channel: 'SYSTEM',
        segments: [
          { flightInstanceId: randomUUID(), sequence: 1, cabin: 'ECONOMY' },
        ],
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('resolves at exactly the airport MCT without creating a booking or hold', async () => {
    const bookingRepo = dataSource.getRepository(Booking);
    const before = await bookingRepo.count({
      where: { flightInstanceId: In(instanceIds) },
    });
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());
    const after = await bookingRepo.count({
      where: { flightInstanceId: In(instanceIds) },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        channel: 'SYSTEM',
        segments: [
          {
            flightInstanceId: instanceIds[0],
            sequence: 1,
            fareClassCode: 'Y',
            availableSeats: 3,
          },
          {
            flightInstanceId: instanceIds[1],
            sequence: 2,
            fareClassCode: 'Y',
            availableSeats: 3,
          },
        ],
      },
    });
    expect(after).toBe(before);
  });

  it('applies the agency-specific fare release', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send({ ...validRequest(), channel: 'AGENCY' });

    expect(response.status).toBe(200);
    expect(response.body.data.segments[0].availableSeats).toBe(1);
  });

  it('rejects a connection below MCT and uses an updated airport rule immediately', async () => {
    const airportRepo = dataSource.getRepository(Airport);
    try {
      await airportRepo.update(airportId, { minConnectMin: 121 });
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.message).toContain('حداقل زمان اتصال');
    } finally {
      await airportRepo.update(airportId, { minConnectMin: 120 });
    }
    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());
    expect(response.status).toBe(200);
  });

  it('rejects an unknown transfer airport but still resolves direct itineraries', async () => {
    const airportRepo = dataSource.getRepository(Airport);
    const airport = await airportRepo.findOneByOrFail({ id: airportId });
    try {
      await airportRepo.delete(airportId);
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      const direct = validRequest();
      direct.segments = direct.segments.slice(0, 1);
      const directResponse = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(direct);
      expect(directResponse.status).toBe(200);
    } finally {
      await airportRepo.save(airport);
    }
  });

  it('returns pool exhausted when the selected channel has no released seats', async () => {
    await dataSource
      .getRepository(FareRule)
      .update({ id: In(fareRuleIds) }, { siteSeatsReleased: 0 });

    const response = await request(app.getHttpServer())
      .post('/internal/v1/core/itineraries/resolve')
      .set('X-Internal-Token', token)
      .send(validRequest());

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('POOL_EXHAUSTED');
  });

  describe('POST /internal/v1/core/itineraries/quote', () => {
    it('requires the internal token and validates the traveller manifest', async () => {
      const unauthorized = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/quote')
        .send(validQuoteRequest());
      expect(unauthorized.status).toBe(401);

      const invalid = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/quote')
        .set('X-Internal-Token', token)
        .send({ ...validQuoteRequest(), travellers: [] });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('adds fares and taxes but keeps baggage and extras per segment without writes', async () => {
      await dataSource
        .getRepository(FareRule)
        .update({ id: In(fareRuleIds) }, { siteSeatsReleased: 3 });
      const bookingRepo = dataSource.getRepository(Booking);
      const before = await bookingRepo.count({
        where: { flightInstanceId: In(instanceIds) },
      });
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/quote')
        .set('X-Internal-Token', token)
        .send(validQuoteRequest());
      const after = await bookingRepo.count({
        where: { flightInstanceId: In(instanceIds) },
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        currency: 'IRR',
        requiresReprice: true,
        fareIrr: '30000000',
        taxIrr: '4500000',
        extrasIrr: '1500000',
        totalIrr: '36000000',
        segments: [
          {
            baggageAllowanceKg: 20,
            fareIrr: '15000000',
            taxIrr: '1500000',
            extras: [{ quantity: 3, totalIrr: '1500000' }],
          },
          {
            baggageAllowanceKg: 15,
            fareIrr: '15000000',
            taxIrr: '3000000',
            extras: [],
          },
        ],
      });
      expect(after).toBe(before);
    });

    it('rejects when one fare bucket cannot fit the whole party', async () => {
      const quote = validQuoteRequest();
      quote.travellers = [
        { passengerType: 'ADULT', birthDate: '1990-01-01' },
        { passengerType: 'ADULT', birthDate: '1991-01-01' },
        { passengerType: 'ADULT', birthDate: '1992-01-01' },
        { passengerType: 'ADULT', birthDate: '1993-01-01' },
      ];
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/quote')
        .set('X-Internal-Token', token)
        .send(quote);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('POOL_EXHAUSTED');
    });

    it('uses the current fare on every quote instead of returning a stale price', async () => {
      const fareRuleRepo = dataSource.getRepository(FareRule);
      try {
        await fareRuleRepo.update(fareRuleIds[0], {
          sitePriceIrr: 11_000_000n,
        });
        const response = await request(app.getHttpServer())
          .post('/internal/v1/core/itineraries/quote')
          .set('X-Internal-Token', token)
          .send(validQuoteRequest());
        expect(response.status).toBe(200);
        expect(response.body.data.fareIrr).toBe('31500000');
        expect(response.body.data.totalIrr).toBe('37500000');
      } finally {
        await fareRuleRepo.update(fareRuleIds[0], {
          sitePriceIrr: 10_000_000n,
        });
      }
    });

    it('fails closed when a selected segment extra is disabled', async () => {
      const extraRepo = dataSource.getRepository(TravelExtraSetting);
      try {
        await extraRepo.update(extraId, { purchaseEnabled: false });
        const response = await request(app.getHttpServer())
          .post('/internal/v1/core/itineraries/quote')
          .set('X-Internal-Token', token)
          .send(validQuoteRequest());
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      } finally {
        await extraRepo.update(extraId, { purchaseEnabled: true });
      }
    });
  });

  describe('POST /internal/v1/core/itineraries/hold', () => {
    afterEach(async () => {
      await cleanupHoldOrders();
    });

    it('requires an idempotency key and creates one PNR with all snapshots', async () => {
      const missingKey = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .send(validHoldRequest());
      expect(missingKey.status).toBe(400);

      const bookingCount = await dataSource.getRepository(Booking).count({
        where: { flightInstanceId: In(instanceIds) },
      });
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `hold-${suffix}`)
        .send(validHoldRequest());

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        status: 'HELD',
        currency: 'IRR',
        totalIrr: '36000000',
        segments: [
          {
            sequence: 1,
            flightInstanceId: instanceIds[0],
            occupiedSeats: 2,
            totalIrr: '18000000',
          },
          {
            sequence: 2,
            flightInstanceId: instanceIds[1],
            occupiedSeats: 2,
            totalIrr: '18000000',
          },
        ],
      });
      expect(response.body.data.pnr).toMatch(/^BJ[A-F0-9]{8}$/);
      const holdExpiresAt: unknown = response.body.data.holdExpiresAt;
      expect(typeof holdExpiresAt).toBe('string');
      if (typeof holdExpiresAt !== 'string') {
        throw new Error('holdExpiresAt must be an ISO string');
      }
      expect(new Date(holdExpiresAt).getTime()).toBeGreaterThan(Date.now());
      const orderId = response.body.data.id as string;
      expect(
        await dataSource
          .getRepository(CoreItinerarySegment)
          .count({ where: { orderId } }),
      ).toBe(2);
      expect(
        await dataSource
          .getRepository(CoreItineraryTraveller)
          .count({ where: { orderId } }),
      ).toBe(2);
      expect(
        await dataSource.getRepository(CoreItineraryTravellerSegment).count(),
      ).toBe(4);
      expect(
        await dataSource.getRepository(Booking).count({
          where: { flightInstanceId: In(instanceIds) },
        }),
      ).toBe(bookingCount);
      const storedTraveller = await dataSource
        .getRepository(CoreItineraryTraveller)
        .findOneByOrFail({ orderId, sequence: 1 });
      expect(storedTraveller.nationalIdEnc).not.toContain('0012345679');
      expect(storedTraveller.nationalIdHash).not.toBe('0012345679');
    });

    it('replays the same command and rejects a changed payload', async () => {
      const key = `replay-${suffix}`;
      const first = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', key)
        .send(validHoldRequest());
      const replay = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', key)
        .send(validHoldRequest());
      const changed = validHoldRequest();
      changed.contactPhone = '09120000000';
      const mismatch = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', key)
        .send(changed);

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body.data.id).toBe(first.body.data.id);
      expect(mismatch.status).toBe(409);
      expect(mismatch.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(
        await dataSource
          .getRepository(CoreItineraryOrder)
          .count({ where: { ownerId: holdOwnerId } }),
      ).toBe(1);
    });

    it('durably expires a hold once and returns its inventory', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `expiry-${suffix}`)
        .send(validHoldRequest());
      expect(response.status).toBe(201);
      const orderId = response.body.data.id as string;
      const now = new Date();
      await dataSource.getRepository(CoreItineraryOrder).update(orderId, {
        holdExpiresAt: new Date(now.getTime() - 1),
      });
      const expiry = app.get(CoreItineraryHoldExpiryService);

      await expect(expiry.expireOne(orderId, now)).resolves.toBe(true);
      await expect(expiry.expireOne(orderId, now)).resolves.toBe(false);

      const order = await dataSource
        .getRepository(CoreItineraryOrder)
        .findOneByOrFail({ id: orderId });
      expect(order.status).toBe('EXPIRED');
      expect(
        await dataSource
          .getRepository(CoreItineraryLifecycleEvent)
          .count({ where: { orderId } }),
      ).toBe(1);
      const available = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(available.status).toBe(200);
      expect(available.body.data.segments[0].availableSeats).toBe(3);
    });

    it('cancels the whole hold idempotently and records one transition', async () => {
      const held = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `cancel-${suffix}`)
        .send(validHoldRequest());
      expect(held.status).toBe(201);
      const orderId = held.body.data.id as string;

      const cancel = () =>
        request(app.getHttpServer())
          .post(`/internal/v1/core/itineraries/${orderId}/cancel`)
          .set('X-Internal-Token', token)
          .send({ ownerId: holdOwnerId });
      const first = await cancel();
      const replay = await cancel();

      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({
        id: orderId,
        status: 'CANCELLED',
        segments: [{ sequence: 1 }, { sequence: 2 }],
      });
      expect(replay.status).toBe(200);
      expect(replay.body.data.status).toBe('CANCELLED');
      expect(
        await dataSource.getRepository(CoreItineraryLifecycleEvent).count({
          where: { orderId, eventType: 'HOLD_CANCELLED' },
        }),
      ).toBe(1);
      const available = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/resolve')
        .set('X-Internal-Token', token)
        .send(validRequest());
      expect(available.status).toBe(200);
      expect(available.body.data.segments[0].availableSeats).toBe(3);
    });

    it('does not allow another owner to cancel the hold', async () => {
      const held = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `owner-scope-${suffix}`)
        .send(validHoldRequest());
      const response = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${held.body.data.id}/cancel`)
        .set('X-Internal-Token', token)
        .send({ ownerId: randomUUID() });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      const order = await dataSource
        .getRepository(CoreItineraryOrder)
        .findOneByOrFail({ id: held.body.data.id as string });
      expect(order.status).toBe('HELD');
    });

    it('rolls back the whole command when one leg has no inventory', async () => {
      const fareRuleRepo = dataSource.getRepository(FareRule);
      try {
        await fareRuleRepo.update(fareRuleIds[1], { siteSeatsReleased: 0 });
        const response = await request(app.getHttpServer())
          .post('/internal/v1/core/itineraries/hold')
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `rollback-${suffix}`)
          .send(validHoldRequest());

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('POOL_EXHAUSTED');
        expect(
          await dataSource
            .getRepository(CoreItineraryOrder)
            .count({ where: { ownerId: holdOwnerId } }),
        ).toBe(0);
        expect(
          await dataSource.getRepository(CoreItinerarySegment).count({
            where: { flightInstanceId: In(instanceIds) },
          }),
        ).toBe(0);
      } finally {
        await fareRuleRepo.update(fareRuleIds[1], { siteSeatsReleased: 3 });
      }
    });

    it('has one winner for the last seat on every leg and leaves no partial order', async () => {
      const baseline = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `baseline-${suffix}`)
        .send(validHoldRequest());
      expect(baseline.status).toBe(201);

      const oneTraveller = validHoldRequest();
      oneTraveller.segments[0].extras = [];
      oneTraveller.travellers = [oneTraveller.travellers[0]];
      const attempts = await Promise.all([
        request(app.getHttpServer())
          .post('/internal/v1/core/itineraries/hold')
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `race-a-${suffix}`)
          .send(oneTraveller),
        request(app.getHttpServer())
          .post('/internal/v1/core/itineraries/hold')
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `race-b-${suffix}`)
          .send(oneTraveller),
      ]);

      expect(attempts.map((result) => result.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        await dataSource
          .getRepository(CoreItineraryOrder)
          .count({ where: { ownerId: holdOwnerId } }),
      ).toBe(2);
      const orders = await dataSource
        .getRepository(CoreItineraryOrder)
        .find({ where: { ownerId: holdOwnerId } });
      for (const order of orders) {
        expect(
          await dataSource
            .getRepository(CoreItinerarySegment)
            .count({ where: { orderId: order.id } }),
        ).toBe(2);
      }
    });
  });

  describe('POST /internal/v1/core/itineraries/:id/payment-confirmations', () => {
    afterEach(async () => {
      await cleanupHoldOrders();
    });

    async function createHold(key: string): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/internal/v1/core/itineraries/hold')
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', key)
        .send(validHoldRequest());
      expect(response.status).toBe(201);
      return response.body.data.id as string;
    }

    function paymentBody() {
      return {
        ownerId: holdOwnerId,
        paymentReference: `verified-${randomUUID()}`,
        amountIrr: '36000000',
      };
    }

    it('enforces service auth, validation, owner scope and not-found', async () => {
      const orderId = await createHold(`payment-guard-${suffix}`);
      const body = paymentBody();
      const unauthorized = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('Idempotency-Key', `payment-unauthorized-${suffix}`)
        .send(body);
      const invalidAmount = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-invalid-${suffix}`)
        .send({ ...body, amountIrr: '0' });
      const missingKey = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .send(body);
      const wrongOwner = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-owner-${suffix}`)
        .send({ ...body, ownerId: randomUUID() });
      const missing = await request(app.getHttpServer())
        .post(
          `/internal/v1/core/itineraries/${randomUUID()}/payment-confirmations`,
        )
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-missing-${suffix}`)
        .send(body);

      expect(unauthorized.status).toBe(401);
      expect(invalidAmount.status).toBe(400);
      expect(missingKey.status).toBe(400);
      expect(wrongOwner.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(
        await dataSource
          .getRepository(CoreItineraryPaymentConfirmation)
          .count({ where: { orderId } }),
      ).toBe(0);
    });

    it('reprices without its own held seats and atomically issues every coupon', async () => {
      const orderId = await createHold(`payment-success-${suffix}`);
      const body = paymentBody();
      const response = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-success-${suffix}`)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: orderId,
        status: 'TICKETED',
        currency: 'IRR',
        amountIrr: '36000000',
        paymentReference: body.paymentReference,
      });
      expect(response.body.data.documents).toHaveLength(2);
      for (const document of response.body.data.documents as Array<{
        documentNumber: string;
        coupons: Array<{ couponNumber: number; status: string }>;
      }>) {
        expect(document.documentNumber).toMatch(/^780[0-9]{10}$/);
        expect(document.coupons).toEqual([
          expect.objectContaining({ couponNumber: 1, status: 'OPEN' }),
          expect.objectContaining({ couponNumber: 2, status: 'OPEN' }),
        ]);
      }
      expect(
        await dataSource.getRepository(CoreItineraryTicketDocument).count({
          where: { orderId },
        }),
      ).toBe(2);
      expect(
        await dataSource.getRepository(CoreItineraryFlightCoupon).count(),
      ).toBe(4);
      expect(
        await dataSource.getRepository(LedgerEntry).count({
          where: { itineraryOrderId: orderId, type: 'SALE' },
        }),
      ).toBe(1);
    });

    it('serializes concurrent replay and rejects changed replay data', async () => {
      const orderId = await createHold(`payment-replay-hold-${suffix}`);
      const body = paymentBody();
      const send = () =>
        request(app.getHttpServer())
          .post(
            `/internal/v1/core/itineraries/${orderId}/payment-confirmations`,
          )
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `payment-replay-${suffix}`)
          .send(body);
      const [first, replay] = await Promise.all([send(), send()]);
      const changed = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-replay-${suffix}`)
        .send({ ...body, amountIrr: '36000001' });

      expect(first.status).toBe(200);
      expect(replay.status).toBe(200);
      expect(replay.body.data.paymentConfirmationId).toBe(
        first.body.data.paymentConfirmationId,
      );
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(
        await dataSource.getRepository(CoreItineraryTicketDocument).count({
          where: { orderId },
        }),
      ).toBe(2);
      expect(
        await dataSource.getRepository(LedgerEntry).count({
          where: { itineraryOrderId: orderId, type: 'SALE' },
        }),
      ).toBe(1);
    });

    it('retains a price-mismatch proof for reconciliation with no partial issue', async () => {
      const orderId = await createHold(`payment-price-${suffix}`);
      const fareRuleRepo = dataSource.getRepository(FareRule);
      try {
        await fareRuleRepo.update(fareRuleIds[1], {
          sitePriceIrr: 11_000_000n,
        });
        const response = await request(app.getHttpServer())
          .post(
            `/internal/v1/core/itineraries/${orderId}/payment-confirmations`,
          )
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `payment-price-${suffix}`)
          .send(paymentBody());

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe(
          'PAYMENT_RECONCILIATION_REQUIRED',
        );
        const confirmation = await dataSource
          .getRepository(CoreItineraryPaymentConfirmation)
          .findOneByOrFail({ orderId });
        expect(confirmation.status).toBe('REVIEW_REQUIRED');
        expect(confirmation.failureCode).toBe('PRICE_CHANGED');
        expect(
          await dataSource.getRepository(CoreItineraryTicketDocument).count({
            where: { orderId },
          }),
        ).toBe(0);
        expect(
          await dataSource.getRepository(LedgerEntry).count({
            where: { itineraryOrderId: orderId },
          }),
        ).toBe(0);
        expect(
          (
            await dataSource
              .getRepository(CoreItineraryOrder)
              .findOneByOrFail({ id: orderId })
          ).status,
        ).toBe('HELD');
      } finally {
        await fareRuleRepo.update(fareRuleIds[1], {
          sitePriceIrr: 10_000_000n,
        });
      }
    });

    it('retains an expired-hold proof without issuing or recording a sale', async () => {
      const orderId = await createHold(`payment-expired-${suffix}`);
      await dataSource.getRepository(CoreItineraryOrder).update(orderId, {
        holdExpiresAt: new Date(Date.now() - 1),
      });
      const response = await request(app.getHttpServer())
        .post(`/internal/v1/core/itineraries/${orderId}/payment-confirmations`)
        .set('X-Internal-Token', token)
        .set('Idempotency-Key', `payment-expired-${suffix}`)
        .send(paymentBody());

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PAYMENT_RECONCILIATION_REQUIRED');
      const confirmation = await dataSource
        .getRepository(CoreItineraryPaymentConfirmation)
        .findOneByOrFail({ orderId });
      expect(confirmation.status).toBe('REVIEW_REQUIRED');
      expect(confirmation.failureCode).toBe('HOLD_EXPIRED');
      expect(
        await dataSource.getRepository(CoreItineraryTicketDocument).count({
          where: { orderId },
        }),
      ).toBe(0);
      expect(
        await dataSource.getRepository(LedgerEntry).count({
          where: { itineraryOrderId: orderId },
        }),
      ).toBe(0);
    });

    it('retains proof and rolls back when accountable stock is unavailable', async () => {
      const orderId = await createHold(`payment-stock-${suffix}`);
      const stockRepo = dataSource.getRepository(TicketDocumentStock);
      const stocks = await stockRepo.find();
      try {
        await stockRepo.update(
          { documentType: 'ETICKET' },
          { status: 'QUARANTINED' },
        );
        const response = await request(app.getHttpServer())
          .post(
            `/internal/v1/core/itineraries/${orderId}/payment-confirmations`,
          )
          .set('X-Internal-Token', token)
          .set('Idempotency-Key', `payment-stock-${suffix}`)
          .send(paymentBody());

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe(
          'PAYMENT_RECONCILIATION_REQUIRED',
        );
        const confirmation = await dataSource
          .getRepository(CoreItineraryPaymentConfirmation)
          .findOneByOrFail({ orderId });
        expect(confirmation.status).toBe('REVIEW_REQUIRED');
        expect(confirmation.failureCode).toBe('TICKET_STOCK_UNAVAILABLE');
        expect(
          await dataSource.getRepository(CoreItineraryTicketDocument).count({
            where: { orderId },
          }),
        ).toBe(0);
        expect(
          await dataSource.getRepository(CoreItineraryFlightCoupon).count(),
        ).toBe(0);
        expect(
          await dataSource.getRepository(LedgerEntry).count({
            where: { itineraryOrderId: orderId },
          }),
        ).toBe(0);
      } finally {
        for (const stock of stocks) {
          await stockRepo.update(stock.id, { status: stock.status });
        }
      }
    });
  });
});
