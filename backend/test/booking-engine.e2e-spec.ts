import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { Irr } from '../src/common/money';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyInvoice } from '../src/database/entities/agency-invoice.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { BookingLifecycleEvent } from '../src/database/entities/booking-lifecycle-event.entity';
import { Flight } from '../src/database/entities/flight.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { LedgerEntry } from '../src/database/entities/ledger-entry.entity';
import { Passenger } from '../src/database/entities/passenger.entity';
import { PaymentReconciliation } from '../src/database/entities/payment-reconciliation.entity';
import { Route } from '../src/database/entities/route.entity';
import { TravelExtraSetting } from '../src/database/entities/travel-extra-setting.entity';
import { AncillaryService } from '../src/database/entities/ancillary-service.entity';
import { WalletEntry } from '../src/database/entities/wallet-entry.entity';
import { User } from '../src/database/entities/user.entity';
import { PromoCode } from '../src/database/entities/promo-code.entity';
import { PaymentAttempt } from '../src/database/entities/payment-attempt.entity';
import { PayIdempotencyRecord } from '../src/database/entities/pay-idempotency-record.entity';
import {
  PAYMENT_GATEWAY,
  GatewayNotDispatchedError,
  type GatewayRequestResult,
  type GatewayVerifyResult,
  type PaymentGateway,
} from '../src/modules/booking-engine/payment-gateway';
import { loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { BookingHoldExpiryWorker } from '../src/modules/booking-engine/booking-hold-expiry.worker';
import { BookingHoldExpiryService } from '../src/modules/booking-engine/booking-hold-expiry.service';
import { TicketDocumentStock } from '../src/database/entities/ticket-document-stock.entity';

async function upsertSeatMap(
  ds: DataSource,
  aircraftType: string,
  fields: {
    businessRowStart: number;
    businessRowEnd: number;
    businessColsLeft: string[];
    businessColsRight: string[];
    economyRowStart: number;
    economyRowEnd: number;
    economyColsLeft: string[];
    economyColsRight: string[];
  },
) {
  const repo = ds.getRepository(AircraftSeatMap);
  const existing = await repo.findOneBy({ aircraftType });
  if (existing) return existing;
  return repo.save(
    repo.create({ aircraftType, ...fields, updatedAt: new Date() }),
  );
}

async function upsertRoute(
  ds: DataSource,
  originCode: string,
  destCode: string,
  durationMin: number,
) {
  const repo = ds.getRepository(Route);
  const existing = await repo.findOneBy({ originCode, destCode });
  if (existing) return existing;
  return repo.save(repo.create({ originCode, destCode, durationMin }));
}

async function upsertFlight(
  ds: DataSource,
  flightNo: string,
  routeId: string,
  aircraftType: string,
) {
  const repo = ds.getRepository(Flight);
  const existing = await repo.findOneBy({ flightNo });
  if (existing) return existing;
  return repo.save(repo.create({ flightNo, routeId, aircraftType }));
}

describe('Booking engine (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let routeId: string;
  let flightId: string;
  const AIRCRAFT_TYPE = 'BE2E-TestJet';

  beforeAll(async () => {
    const setupDataSource = new DataSource(dataSourceOptions);
    await setupDataSource.initialize();

    await upsertSeatMap(setupDataSource, AIRCRAFT_TYPE, {
      businessRowStart: 1,
      businessRowEnd: 1,
      businessColsLeft: ['A'],
      businessColsRight: ['C'],
      economyRowStart: 2,
      economyRowEnd: 3,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['C'],
    });

    const route = await upsertRoute(setupDataSource, 'THR', 'KIH', 90);
    routeId = route.id;

    const flight = await upsertFlight(
      setupDataSource,
      'BE-100',
      routeId,
      AIRCRAFT_TYPE,
    );
    flightId = flight.id;

    await setupDataSource.destroy();
  });

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  async function freshInstance(daysAhead = 40) {
    const departureAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const repo = dataSource.getRepository(FlightInstance);
    return repo.save(
      repo.create({
        flightId,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 90 * 60 * 1000),
        capacity: 6,
        status: 'SCHEDULED',
      }),
    );
  }

  async function createAndLoginAgency() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const phone = `+9891${crypto.randomInt(10_000_000, 100_000_000)}`;
    const password = 'AgencyBooking@123';
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        role: 'AGENCY',
        phone,
        fullName: `آژانس خرید ${suffix}`,
        passwordHash: await argon2.hash(password),
        isActive: true,
        updatedAt: new Date(),
      }),
    );
    await dataSource.getRepository(AgencyProfile).save(
      dataSource.getRepository(AgencyProfile).create({
        userId: user.id,
        licenseNo: `BOOK-${suffix}`,
        managerName: 'مدیر خرید تست',
        phone,
        email: `${suffix}@booking.test`,
        city: 'تهران',
        address: 'آدرس تست خرید',
        tier: 'NORMAL',
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/agency/login')
      .send({ phone, password });
    expect(login.status).toBe(200);
    return {
      userId: user.id,
      accessToken: login.body.data.accessToken as string,
    };
  }

  it('search returns only the exact requested cabin with its price and seatsLeft', async () => {
    const instance = await freshInstance();
    const date = instance.departureAt.toISOString().slice(0, 10);

    const economyRes = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'KIH', date, cabin: 'ECONOMY' });

    expect(economyRes.status).toBe(200);
    const economyRow = economyRes.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    expect(economyRow).toBeDefined();
    expect(economyRow.cabins).toEqual([
      expect.objectContaining({ cabin: 'ECONOMY', seatsLeft: 6 }),
    ]);

    const businessRes = await request(app.getHttpServer())
      .get('/search/flights')
      .query({ origin: 'THR', dest: 'KIH', date, cabin: 'BUSINESS' });
    expect(businessRes.status).toBe(200);
    const businessRow = businessRes.body.data.find(
      (r: { flightInstanceId: string }) => r.flightInstanceId === instance.id,
    );
    expect(businessRow).toBeDefined();
    expect(businessRow.cabins).toEqual([
      expect.objectContaining({ cabin: 'BUSINESS', seatsLeft: 2 }),
    ]);
  });

  it('lists cabin choices activated on currently sellable flight inventory', async () => {
    const instance = await freshInstance();
    instance.cabinCapacities = [
      { cabin: 'ECONOMY', seats: 6 },
      { cabin: 'BUSINESS', seats: 2 },
    ];
    await dataSource.getRepository(FlightInstance).save(instance);

    const res = await request(app.getHttpServer()).get('/search/cabins');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining(['ECONOMY', 'BUSINESS']),
    );
  });

  it('atomically assigns adjacent seats when a family omits manual preselection', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000221');

    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'مادر خانواده',
            passengerType: 'ADULT',
            birthDate: '1988-03-10',
            gender: 'female',
          },
          {
            fullName: 'همراه خانواده',
            passengerType: 'ADULT',
            birthDate: '1987-03-10',
            gender: 'male',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(
      res.body.data.passengers.map((row: { seatCode: string }) => row.seatCode),
    ).toEqual(['2A', '2B']);
  });

  it('rejects two passenger tickets with the same national ID in one booking', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000222');

    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'هویت تکراری اول',
            nationalId: '0012345679',
            seatCode: '2A',
          },
          {
            fullName: 'هویت تکراری دوم',
            nationalId: '0012345679',
            seatCode: '2B',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('هر کد ملی فقط برای یک مسافر');
  });

  it('rejects the same national ID in a second active booking for the same flight', async () => {
    const instance = await freshInstance();
    const firstBuyer = await loginAsCustomer(app, '09130000223');
    const secondBuyer = await loginAsCustomer(app, '09130000224');
    const nationalId = '0012345679';

    const first = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${firstBuyer.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'دارنده هویت', nationalId, seatCode: '2A' }],
      });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${secondBuyer.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          { fullName: 'خرید تکراری هویت', nationalId, seatCode: '2B' },
        ],
      });

    expect(second.status).toBe(400);
    expect(second.body.error.message).toContain('قبلاً برای مسافر دیگری');
  });

  it('rejects booking creation without login', async () => {
    const instance = await freshInstance();
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر تست', seatCode: '2A' }],
      });
    expect(res.status).toBe(401);
  });

  it('creates a HELD booking, then pays and issues a ticket with a SALE ledger entry', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000001');

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          { fullName: 'سارا احمدی', nationalId: '0012345679', seatCode: '2A' },
        ],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('HELD');
    expect(createRes.body.data.holdExpiresAt).toBeDefined();
    const bookingId = createRes.body.data.id;

    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.priceChanged).toBe(false);
    expect(payRes.body.data.booking.status).toBe('TICKETED');

    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .findOneBy({ bookingId, type: 'SALE' });
    expect(ledger).toBeTruthy();
    // ledger is a direct TypeORM read (native bigint); the JSON response
    // field is a decimal string (BigInt.prototype.toJSON) — compare same-type.
    expect(ledger!.signedAmountIrr).toBe(
      BigInt(String(payRes.body.data.booking.priceIrr)),
    );
  });

  it('pays from the wallet, debits the exact fare, records the SALE document, and issues the ticket', async () => {
    const instance = await freshInstance();
    const { accessToken, userId } = await loginAsCustomer(app, '09130000982');
    expect(userId).toBeDefined();

    const walletRepo = dataSource.getRepository(WalletEntry);
    const openingBalance = 1_000_000_000n;
    await walletRepo.save(
      walletRepo.create({
        userId: userId!,
        type: 'TOPUP',
        signedAmountIrr: openingBalance,
        bookingId: null,
      }),
    );
    const balanceBeforePayRow = await walletRepo
      .createQueryBuilder('wallet')
      .select('COALESCE(SUM(wallet."signedAmountIrr"), 0)', 'balance')
      .where('wallet."userId" = :userId', { userId })
      .getRawOne<{ balance: string }>();
    const balanceBeforePay = BigInt(balanceBeforePayRow?.balance ?? '0');

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'خریدار کیف پول', seatCode: '2A' }],
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id as string;

    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ paymentMethod: 'WALLET' });

    expect(payRes.status).toBe(201);
    expect(payRes.body.data.booking.status).toBe('TICKETED');
    const paidFare = BigInt(String(payRes.body.data.booking.priceIrr));
    expect(BigInt(String(payRes.body.data.walletBalanceIrr))).toBe(
      balanceBeforePay - paidFare,
    );

    const purchase = await walletRepo.findOneBy({
      userId: userId!,
      bookingId,
      type: 'PURCHASE',
    });
    expect(purchase?.signedAmountIrr).toBe(-paidFare);

    const ledger = await dataSource
      .getRepository(LedgerEntry)
      .findOneBy({ bookingId, type: 'SALE' });
    expect(ledger?.signedAmountIrr).toBe(paidFare);
  });

  it('an agency wallet purchase of two passengers creates two tickets and every customer, finance, and agency projection atomically', async () => {
    const instance = await freshInstance();
    const { accessToken, userId } = await createAndLoginAgency();
    const walletRepo = dataSource.getRepository(WalletEntry);
    const openingBalance = 2_000_000_000n;
    await walletRepo.save(
      walletRepo.create({
        userId,
        type: 'TOPUP',
        signedAmountIrr: openingBalance,
        bookingId: null,
      }),
    );

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          {
            fullName: 'مسافر اول آژانس',
            nationalId: '0012345687',
            seatCode: '2A',
          },
          {
            fullName: 'مسافر دوم آژانس',
            nationalId: '0012345695',
            seatCode: '2B',
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id as string;

    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `agency-wallet-${bookingId}`)
      .send({ paymentMethod: 'WALLET' });

    expect(payRes.status).toBe(201);
    expect(payRes.body.data.booking.status).toBe('TICKETED');
    expect(payRes.body.data.booking.passengers).toHaveLength(2);
    const ticketNumbers = (
      payRes.body.data.booking.passengers as Array<{ ticketNo: string }>
    ).map((passenger: { ticketNo: string }) => passenger.ticketNo);
    expect(ticketNumbers).toHaveLength(2);
    expect(new Set(ticketNumbers).size).toBe(2);
    expect(ticketNumbers).toEqual([
      expect.stringMatching(/^780\d{10}$/),
      expect.stringMatching(/^780\d{10}$/),
    ]);

    const paidFare = BigInt(String(payRes.body.data.booking.priceIrr));
    expect(BigInt(String(payRes.body.data.walletBalanceIrr))).toBe(
      openingBalance - paidFare,
    );
    const walletView = await request(app.getHttpServer())
      .get('/my/wallet')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(walletView.status).toBe(200);
    expect(BigInt(String(walletView.body.data.balanceIrr))).toBe(
      openingBalance - paidFare,
    );
    expect(walletView.body.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'PURCHASE',
          bookingId,
          signedAmountIrr: (-paidFare).toString(),
        }),
      ]),
    );

    const storedBooking = await dataSource
      .getRepository(Booking)
      .findOneByOrFail({ id: bookingId });
    expect(storedBooking.agencyId).toBe(userId);
    const purchases = await walletRepo.findBy({
      userId,
      bookingId,
      type: 'PURCHASE',
    });
    expect(purchases).toHaveLength(1);
    expect(purchases[0].signedAmountIrr).toBe(-paidFare);

    const ledgerRows = await dataSource.getRepository(LedgerEntry).findBy({
      bookingId,
      type: 'SALE',
    });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].agencyId).toBe(userId);
    expect(ledgerRows[0].signedAmountIrr).toBe(paidFare);

    const paidInvoices = await dataSource
      .getRepository(AgencyInvoice)
      .findBy({ agencyId: userId, bookingId, status: 'PAID' });
    expect(paidInvoices).toHaveLength(1);
    expect(paidInvoices[0]).toMatchObject({
      amountIrr: paidFare,
      invoiceNo: `SALE-${storedBooking.pnr}`,
    });

    const storedPassengers = await dataSource
      .getRepository(Passenger)
      .findBy({ bookingId });
    expect(storedPassengers).toHaveLength(2);
    expect(storedPassengers.every((row) => Boolean(row.ticketIssuedAt))).toBe(
      true,
    );
    expect(new Set(storedPassengers.map((row) => row.ticketNo)).size).toBe(2);

    const agencySales = await request(app.getHttpServer())
      .get('/agency-portal/sales')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(agencySales.status).toBe(200);
    const saleTickets = agencySales.body.data.tickets.filter(
      (row: { pnr: string }) => row.pnr === storedBooking.pnr,
    );
    expect(saleTickets).toHaveLength(2);
    expect(
      saleTickets.map((row: { ticketNo: string }) => row.ticketNo),
    ).toEqual(expect.arrayContaining(ticketNumbers));

    const invoices = await request(app.getHttpServer())
      .get('/agency-portal/invoices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invoices.status).toBe(200);
    expect(invoices.body.data as unknown[]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId,
          invoiceNo: `SALE-${storedBooking.pnr}`,
          status: 'PAID',
          amountIrr: paidFare.toString(),
        }),
      ]),
    );
  });

  it('prices selected travel costs from server configuration and stores an immutable snapshot', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000991');
    const repo = dataSource.getRepository(TravelExtraSetting);
    await repo.delete({ code: 'EXTRA_BAGGAGE' });
    await dataSource
      .getRepository(AncillaryService)
      .update({ key: 'baggage' }, { priceIrr: 4_500_000n, enabled: true });
    const extra = await repo.save(
      repo.create({
        code: 'EXTRA_BAGGAGE',
        titleFa: 'بار اضافه',
        titleEn: null,
        titleAr: null,
        descriptionFa: null,
        billingUnit: 'PER_KG',
        priceIrr: 4_500_000n,
        active: true,
        purchaseEnabled: true,
        sortOrder: 0,
        updatedById: null,
      }),
    );

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مسافر هزینه سفر', seatCode: '2A' }],
        extras: [{ id: extra.id, quantity: 2 }],
      })
      .expect(201);

    const seatPriceIrr = (
      await dataSource
        .getRepository(AncillaryService)
        .findOneByOrFail({ key: 'seat-window-aisle' })
    ).priceIrr;
    expect(createRes.body.data.extrasIrr).toBe(
      (9_000_000n + seatPriceIrr).toString(),
    );
    expect(createRes.body.data.extras).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: extra.id,
          code: 'EXTRA_BAGGAGE',
          unitPriceIrr: '4500000',
          quantity: 2,
          totalIrr: '9000000',
        }),
        expect.objectContaining({
          id: 'seat-type:seat-window-aisle',
          quantity: 1,
          totalIrr: seatPriceIrr.toString(),
        }),
      ]),
    );

    await repo.update({ id: extra.id }, { priceIrr: 9_000_000n });
    const stored = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: createRes.body.data.id })
      .getOneOrFail();
    expect(stored.extrasSnapshot[0]?.unitPriceIrr).toBe('4500000');
    await dataSource
      .getRepository(AncillaryService)
      .update({ key: 'baggage' }, { priceIrr: 2_000_000n, enabled: true });
  });

  describe('payment safety', () => {
    async function heldBooking() {
      const instance = await freshInstance();
      const phone = `0913${crypto.randomInt(1_000_000, 10_000_000)}`;
      const { accessToken } = await loginAsCustomer(app, phone);
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: 'تست ایمنی پرداخت', seatCode: '3B' }],
        });
      expect(response.status).toBe(201);
      return {
        accessToken,
        id: response.body.data.id as string,
        priceIrr: BigInt(response.body.data.priceIrr as string),
      };
    }

    const pay = (
      booking: { id: string; accessToken: string },
      key: string,
      options: object = {},
    ) =>
      request(app.getHttpServer())
        .post(`/bookings/${booking.id}/pay`)
        .set('Authorization', `Bearer ${booking.accessToken}`)
        .set('Idempotency-Key', key)
        .send(options);

    it('invalid promo is rejected before any gateway request', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest.spyOn(gateway, 'request');
      const response = await pay(booking, crypto.randomUUID(), {
        promoCode: 'INVALID-PAYMENT-PREFLIGHT',
      });
      expect(response.status).toBe(400);
      expect(dispatch).not.toHaveBeenCalled();
      expect(
        await dataSource
          .getRepository(PaymentReconciliation)
          .countBy({ bookingId: booking.id }),
      ).toBe(0);
    });

    it('gateway receives the discounted total used in the ledger', async () => {
      const booking = await heldBooking();
      const code = `SAFETY-${crypto.randomUUID()}`;
      const promos = dataSource.getRepository(PromoCode);
      await promos.save(
        promos.create({ code, type: 'FIXED', value: 100n, active: true }),
      );
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest.spyOn(gateway, 'request');
      const verify = jest.spyOn(gateway, 'verify');
      const response = await pay(booking, crypto.randomUUID(), {
        promoCode: code,
      });
      expect(response.status).toBe(201);
      expect(dispatch).toHaveBeenCalledWith(
        booking.priceIrr - 100n,
        booking.id,
      );
      expect(verify).toHaveBeenCalledWith(
        expect.any(String),
        booking.priceIrr - 100n,
      );
      expect(response.body.data.booking.priceIrr).toBe(
        (booking.priceIrr - 100n).toString(),
      );
    });

    it('concurrent gateway payments dispatch at most once', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest
        .spyOn(gateway, 'request')
        .mockImplementation(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 150));
          return { authority: `SBX-${crypto.randomUUID()}`, redirectUrl: null };
        });
      const responses = await Promise.all([
        pay(booking, crypto.randomUUID()),
        pay(booking, crypto.randomUUID()),
      ]);
      expect(responses.some((response) => response.status === 201)).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(
        await dataSource
          .getRepository(LedgerEntry)
          .countBy({ bookingId: booking.id, type: 'SALE' }),
      ).toBe(1);
    });

    it('fails before gateway dispatch when accountable ticket stock is unavailable', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest.spyOn(gateway, 'request');
      const stockRepo = dataSource.getRepository(TicketDocumentStock);
      const stocks = await stockRepo.find();
      try {
        await stockRepo
          .createQueryBuilder()
          .update(TicketDocumentStock)
          .set({ status: 'QUARANTINED' })
          .execute();

        const response = await pay(booking, crypto.randomUUID());

        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('TICKET_STOCK_UNAVAILABLE');
        expect(dispatch).not.toHaveBeenCalled();
        expect(
          await dataSource
            .getRepository(PaymentAttempt)
            .countBy({ bookingId: booking.id }),
        ).toBe(0);
        expect(
          await dataSource
            .getRepository(Booking)
            .findOneByOrFail({ id: booking.id }),
        ).toMatchObject({ status: 'HELD' });
      } finally {
        await Promise.all(
          stocks.map((stock) =>
            stockRepo.update({ id: stock.id }, { status: stock.status }),
          ),
        );
      }
    });

    it('replays a concurrent gateway payment with the same key', async () => {
      const booking = await heldBooking();
      const key = crypto.randomUUID();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      let releaseDispatch: (() => void) | undefined;
      let markDispatchStarted: (() => void) | undefined;
      const dispatchReleased = new Promise<void>((resolve) => {
        releaseDispatch = resolve;
      });
      const dispatchStarted = new Promise<void>((resolve) => {
        markDispatchStarted = resolve;
      });
      const dispatch = jest
        .spyOn(gateway, 'request')
        .mockImplementation(async () => {
          markDispatchStarted?.();
          await dispatchReleased;
          return { authority: `SBX-${crypto.randomUUID()}`, redirectUrl: null };
        });
      const first = Promise.resolve(pay(booking, key));
      await dispatchStarted;
      const second = pay(booking, key);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      releaseDispatch?.();
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(responses[1].body.data.booking.id).toBe(
        responses[0].body.data.booking.id,
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('unknown verification blocks another gateway attempt', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest.spyOn(gateway, 'request');
      jest
        .spyOn(gateway, 'verify')
        .mockRejectedValue(new Error('simulated lost verification response'));
      await pay(booking, crypto.randomUUID());
      const retry = await pay(booking, crypto.randomUUID());
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('PAYMENT_STATUS_UNKNOWN');
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('completed payment key rejects a different payment method', async () => {
      const booking = await heldBooking();
      const key = crypto.randomUUID();
      expect((await pay(booking, key)).status).toBe(201);
      const changed = await pay(booking, key, { paymentMethod: 'WALLET' });
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });

    it('persists an attempt before dispatch and records the exact captured amount', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const original: PaymentGateway['request'] = gateway.request.bind(gateway);
      jest
        .spyOn(gateway, 'request')
        .mockImplementation(
          async (
            amount: Irr,
            bookingId: string,
          ): Promise<GatewayRequestResult> => {
            const durable = await dataSource
              .getRepository(PaymentAttempt)
              .findOneByOrFail({ bookingId });
            expect(durable.status).toBe('REQUESTING');
            expect(durable.amountIrr).toBe(amount);
            expect(durable.requestHash).toBeUndefined();
            return original(amount, bookingId);
          },
        );
      expect((await pay(booking, crypto.randomUUID())).status).toBe(201);
      const attempt = await dataSource
        .getRepository(PaymentAttempt)
        .findOneByOrFail({ bookingId: booking.id });
      expect(attempt.status).toBe('COMPLETED');
      expect(attempt.authority).toBeUndefined();
      const ledger = await dataSource
        .getRepository(LedgerEntry)
        .findOneByOrFail({ bookingId: booking.id, type: 'SALE' });
      const capture = await dataSource
        .getRepository(PaymentReconciliation)
        .findOneByOrFail({ bookingId: booking.id });
      expect(ledger.signedAmountIrr).toBe(attempt.amountIrr);
      expect(capture.amountIrr).toBe(attempt.amountIrr);
      expect(capture.status).toBe('RESOLVED');
    });

    it('a lost request response survives restart and prohibits wallet fallback', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      jest
        .spyOn(gateway, 'request')
        .mockRejectedValueOnce(new Error('lost request response'));
      const first = await pay(booking, crypto.randomUUID());
      expect(first.status).toBe(409);
      expect(first.body.error.code).toBe('PAYMENT_STATUS_UNKNOWN');
      await app.close();
      app = await createTestApp();
      dataSource = app.get(DataSource);
      const restarted = jest.spyOn(
        app.get<PaymentGateway>(PAYMENT_GATEWAY),
        'request',
      );
      const retry = await pay(booking, crypto.randomUUID());
      const fallback = await pay(booking, crypto.randomUUID(), {
        paymentMethod: 'WALLET',
      });
      expect(retry.body.error.code).toBe('PAYMENT_STATUS_UNKNOWN');
      expect(fallback.body.error.code).toBe('PAYMENT_STATUS_UNKNOWN');
      expect(restarted).not.toHaveBeenCalled();
      expect(
        await dataSource
          .getRepository(PaymentAttempt)
          .countBy({ bookingId: booking.id, status: 'UNKNOWN' }),
      ).toBe(1);
      expect(
        await dataSource
          .getRepository(LedgerEntry)
          .countBy({ bookingId: booking.id }),
      ).toBe(0);
    });

    it('does not issue a ticket if the hold expires during verification', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const verify: PaymentGateway['verify'] = gateway.verify.bind(gateway);
      jest
        .spyOn(gateway, 'verify')
        .mockImplementationOnce(
          async (
            authority: string,
            amount: Irr,
          ): Promise<GatewayVerifyResult> => {
            await dataSource
              .getRepository(Booking)
              .update(
                { id: booking.id },
                { holdExpiresAt: new Date(Date.now() - 1000) },
              );
            return verify(authority, amount);
          },
        );
      expect((await pay(booking, crypto.randomUUID())).status).toBe(409);
      expect(
        await dataSource
          .getRepository(PaymentAttempt)
          .countBy({ bookingId: booking.id, status: 'VERIFIED' }),
      ).toBe(1);
      expect(
        await dataSource
          .getRepository(PaymentReconciliation)
          .countBy({ bookingId: booking.id, status: 'PENDING' }),
      ).toBe(1);
      expect(
        await dataSource
          .getRepository(LedgerEntry)
          .countBy({ bookingId: booking.id }),
      ).toBe(0);
      const passengers = await dataSource
        .getRepository(Passenger)
        .findBy({ bookingId: booking.id });
      expect(passengers.every((passenger) => passenger.ticketNo === null)).toBe(
        true,
      );
      await expect(
        new BookingHoldExpiryService(dataSource).expireOne(booking.id),
      ).resolves.toBe(true);
      expect(
        await dataSource.getRepository(Booking).findOneByOrFail({
          id: booking.id,
        }),
      ).toMatchObject({ status: 'EXPIRED' });
      expect(
        await dataSource.getRepository(BookingLifecycleEvent).countBy({
          bookingId: booking.id,
          eventType: 'HOLD_EXPIRED',
        }),
      ).toBe(1);
    });

    it('permits retry only after a proved non-dispatch', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest
        .spyOn(gateway, 'request')
        .mockRejectedValueOnce(new GatewayNotDispatchedError());
      const key = crypto.randomUUID();
      expect((await pay(booking, key)).status).toBe(503);
      expect(
        await dataSource
          .getRepository(PaymentAttempt)
          .countBy({ bookingId: booking.id, status: 'FAILED' }),
      ).toBe(1);
      expect((await pay(booking, key)).status).toBe(201);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(
        await dataSource
          .getRepository(PaymentAttempt)
          .countBy({ bookingId: booking.id }),
      ).toBe(1);
      expect(
        await dataSource
          .getRepository(LedgerEntry)
          .countBy({ bookingId: booking.id, type: 'SALE' }),
      ).toBe(1);
    });

    it('a negative verification is uncertain, not permission to retry', async () => {
      const booking = await heldBooking();
      const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
      const dispatch = jest.spyOn(gateway, 'request');
      jest
        .spyOn(gateway, 'verify')
        .mockResolvedValueOnce({ ok: false, refId: '' });
      const response = await pay(booking, crypto.randomUUID());
      expect(response.body.error.code).toBe('PAYMENT_STATUS_UNKNOWN');
      expect(JSON.stringify(response.body)).not.toContain('مبلغی کسر نشده');
      await pay(booking, crypto.randomUUID());
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('does not bind a legacy completed key to a new payment payload', async () => {
      const booking = await heldBooking();
      const key = crypto.randomUUID();
      expect((await pay(booking, key)).status).toBe(201);
      await dataSource
        .getRepository(PayIdempotencyRecord)
        .update({ idempotencyKey: key }, { requestHash: null });
      const retry = await pay(booking, key);
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });
  });

  it('a booking cannot be paid twice', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000002');

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'رضا محمدی', seatCode: '2B' }],
      });
    const bookingId = createRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    const secondPay = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(secondPay.status).toBe(409);
  });

  it('another customer cannot see or pay someone else’s booking', async () => {
    const instance = await freshInstance();
    const owner = await loginAsCustomer(app, '09130000003');
    const stranger = await loginAsCustomer(app, '09130000004');

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'مالک رزرو', seatCode: '2C' }],
      });
    const bookingId = createRes.body.data.id;

    const getRes = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(getRes.status).toBe(403);

    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({});
    expect(payRes.status).toBe(403);
  });

  it('rejects booking the same seat twice on the same flight', async () => {
    const instance = await freshInstance();
    const first = await loginAsCustomer(app, '09130000005');
    const second = await loginAsCustomer(app, '09130000006');

    const firstRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'نفر اول', seatCode: '3A' }],
      });
    expect(firstRes.status).toBe(201);

    const secondRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'نفر دوم', seatCode: '3A' }],
      });
    expect(secondRes.status).toBe(409);
  });

  it('booking replay rejects another owner without returning passenger data', async () => {
    const instance = await freshInstance();
    const owner = await loginAsCustomer(app, '09130000071');
    const other = await loginAsCustomer(app, '09130000072');
    const key = crypto.randomUUID();
    const payload = {
      flightInstanceId: instance.id,
      cabin: 'ECONOMY',
      passengers: [{ fullName: 'مسافر محرمانه', seatCode: '3B' }],
    };
    const first = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(first.status).toBe(201);

    const replay = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(replay.status).toBe(409);
    expect(JSON.stringify(replay.body)).not.toContain(first.body.data.id);
    expect(JSON.stringify(replay.body)).not.toContain('مسافر محرمانه');
    expect(
      await dataSource.getRepository(Booking).countBy({ idempotencyKey: key }),
    ).toBe(1);
  });

  it('booking replay rejects changed passenger input', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000073');
    const key = crypto.randomUUID();
    const send = (fullName: string) =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName, seatCode: '3B' }],
        });
    const first = await send('مسافر اول');
    expect(first.status).toBe(201);
    const replay = await send('مسافر متفاوت');
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(
      await dataSource.getRepository(Booking).countBy({ idempotencyKey: key }),
    ).toBe(1);
  });

  it('concurrent booking replay on different flights rejects payload mismatch instead of a unique-index failure', async () => {
    const instances = await Promise.all([freshInstance(), freshInstance(41)]);
    const { accessToken } = await loginAsCustomer(app, '09130000076');
    const key = crypto.randomUUID();
    const responses = await Promise.all(
      instances.map((instance) =>
        request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Idempotency-Key', key)
          .send({
            flightInstanceId: instance.id,
            cabin: 'ECONOMY',
            passengers: [{ fullName: 'رقابت کلید', seatCode: '3B' }],
          }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.error.code,
    ).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(
      await dataSource.getRepository(Booking).countBy({ idempotencyKey: key }),
    ).toBe(1);
  });

  it('booking replay rejects a legacy row without rebinding its key', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000075');
    const key = crypto.randomUUID();
    const payload = {
      flightInstanceId: instance.id,
      cabin: 'ECONOMY',
      passengers: [{ fullName: 'رزرو قدیمی', seatCode: '3B' }],
    };
    const send = () =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send(payload);
    const first = await send();
    expect(first.status).toBe(201);
    await dataSource
      .getRepository(Booking)
      .update({ idempotencyKey: key }, { idempotencyRequestHash: null });
    const replay = await send();
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const retrieved = await request(app.getHttpServer())
      .get(`/bookings/${first.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.data.id).toBe(first.body.data.id);
    expect(retrieved.body.data.idempotencyRequestHash).toBeUndefined();
    expect(
      await dataSource.getRepository(Booking).countBy({ idempotencyKey: key }),
    ).toBe(1);
  });

  it('concurrent booking replay creates one hold and returns it to both callers', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000074');
    const key = crypto.randomUUID();
    const send = () =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: 'مسافر همزمان', seatCode: '3B' }],
        });
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);
    expect(
      await dataSource.getRepository(Booking).countBy({ idempotencyKey: key }),
    ).toBe(1);
  });

  it('an idempotency-key retry on booking creation returns the same booking, not a duplicate', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000007');
    const key = `idem-${instance.id}`;

    const payload = {
      flightInstanceId: instance.id,
      cabin: 'ECONOMY',
      passengers: [{ fullName: 'تکرار درخواست', seatCode: '3B' }],
    };

    const first = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    const second = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.body.data.id).toBe(second.body.data.id);
    // Booking has no reverse `passengers` relation declared, so a
    // nested-relation filter needs an explicit join rather than
    // repo.countBy/find with a nested `where`.
    const count = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .innerJoin(Passenger, 'p', 'p."bookingId" = b.id')
      .where('b."flightInstanceId" = :fid', { fid: instance.id })
      .andWhere('p."seatCode" = :seat', { seat: '3B' })
      .getCount();
    expect(count).toBe(1);
  });

  it('an expired HELD booking cannot be paid and its seat becomes available again', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000008');

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'رزرو منقضی', seatCode: '3C' }],
      });
    const bookingId = createRes.body.data.id;

    await dataSource
      .createQueryBuilder()
      .update(Booking)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where('id = :id', { id: bookingId })
      .execute();

    const payRes = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(payRes.status).toBe(409);

    const updated = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.id = :id', { id: bookingId })
      .getOneOrFail();
    expect(updated.status).toBe('EXPIRED');
    expect(
      await dataSource.getRepository(BookingLifecycleEvent).countBy({
        bookingId,
        eventType: 'HOLD_EXPIRED',
      }),
    ).toBe(1);

    const seatmapRes = await request(app.getHttpServer()).get(
      `/search/flights/${instance.id}/seatmap`,
    );
    const seat = seatmapRes.body.data.seats.find(
      (s: { seatCode: string }) => s.seatCode === '3C',
    );
    expect(seat.status).toBe('FREE');
  });

  it('two expiry workers materialize one durable event and leave future holds untouched', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000008');
    const create = (seatCode: string) =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: `انقضای ${seatCode}`, seatCode }],
        });
    const [dueResponse, futureResponse] = await Promise.all([
      create('2A'),
      create('2B'),
    ]);
    expect(dueResponse.status).toBe(201);
    expect(futureResponse.status).toBe(201);
    const dueId = dueResponse.body.data.id as string;
    const futureId = futureResponse.body.data.id as string;
    await dataSource
      .getRepository(Booking)
      .update({ id: dueId }, { holdExpiresAt: new Date(0) });

    const [firstCount, secondCount] = await Promise.all([
      new BookingHoldExpiryWorker(
        new BookingHoldExpiryService(dataSource),
      ).sweepOnce(),
      new BookingHoldExpiryWorker(
        new BookingHoldExpiryService(dataSource),
      ).sweepOnce(),
    ]);
    expect(firstCount + secondCount).toBeGreaterThanOrEqual(1);
    expect(
      await dataSource.getRepository(Booking).findOneByOrFail({ id: dueId }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(
      await dataSource.getRepository(Booking).findOneByOrFail({ id: futureId }),
    ).toMatchObject({ status: 'HELD' });
    expect(
      await dataSource.getRepository(BookingLifecycleEvent).countBy({
        bookingId: dueId,
        eventType: 'HOLD_EXPIRED',
      }),
    ).toBe(1);
    await expect(
      new BookingHoldExpiryWorker(
        new BookingHoldExpiryService(dataSource),
      ).sweepOnce(),
    ).resolves.toBeGreaterThanOrEqual(0);
    expect(
      await dataSource.getRepository(BookingLifecycleEvent).countBy({
        bookingId: dueId,
        eventType: 'HOLD_EXPIRED',
      }),
    ).toBe(1);
  });

  it('an idempotency-key retry on payment returns the same ticketed booking, not a double charge', async () => {
    const instance = await freshInstance();
    const { accessToken } = await loginAsCustomer(app, '09130000011');
    const key = `pay-idem-${instance.id}`;

    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [{ fullName: 'پرداخت تکراری', seatCode: '3A' }],
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id;

    const first = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send({});
    expect(first.status).toBe(201);
    expect(first.body.data.booking.status).toBe('TICKETED');

    const second = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send({});
    expect(second.status).toBe(201);
    expect(second.body.data.booking.id).toBe(first.body.data.booking.id);

    const reconCount = await dataSource
      .getRepository(PaymentReconciliation)
      .countBy({ bookingId });
    expect(reconCount).toBe(1);
  });

  it('two concurrent wallet payment calls create one debit, one SALE, and one ticket per passenger', async () => {
    const instance = await freshInstance();
    const { accessToken, userId } = await loginAsCustomer(app, '09130000983');
    const walletRepo = dataSource.getRepository(WalletEntry);
    await walletRepo.save(
      walletRepo.create({
        userId: userId!,
        type: 'TOPUP',
        signedAmountIrr: 2_000_000_000n,
        bookingId: null,
      }),
    );
    const createRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        flightInstanceId: instance.id,
        cabin: 'ECONOMY',
        passengers: [
          { fullName: 'همزمان اول', nationalId: '0012345709', seatCode: '2A' },
          { fullName: 'همزمان دوم', nationalId: '0012345717', seatCode: '2B' },
        ],
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id as string;
    const key = `concurrent-wallet-${bookingId}`;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/bookings/${bookingId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send({ paymentMethod: 'WALLET' }),
      request(app.getHttpServer())
        .post(`/bookings/${bookingId}/pay`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send({ paymentMethod: 'WALLET' }),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);

    expect(
      await walletRepo.countBy({
        userId: userId!,
        bookingId,
        type: 'PURCHASE',
      }),
    ).toBe(1);
    expect(
      await dataSource.getRepository(LedgerEntry).countBy({
        bookingId,
        type: 'SALE',
      }),
    ).toBe(1);
    const tickets = await dataSource.getRepository(Passenger).findBy({
      bookingId,
    });
    expect(tickets).toHaveLength(2);
    expect(tickets.every((row) => Boolean(row.ticketNo))).toBe(true);
    expect(new Set(tickets.map((row) => row.ticketNo)).size).toBe(2);
  });

  // ── Mandatory concurrency test (CLAUDE.md) ───────────────────────────

  it('two concurrent buyers of the LAST seat — exactly one succeeds, inventory never goes negative', async () => {
    const oneSeatType = `${AIRCRAFT_TYPE}-1SEAT`;
    await upsertSeatMap(dataSource, oneSeatType, {
      businessRowStart: 1,
      businessRowEnd: 0,
      businessColsLeft: [],
      businessColsRight: [],
      economyRowStart: 1,
      economyRowEnd: 1,
      economyColsLeft: ['A'],
      economyColsRight: [],
    });
    const oneSeatFlight = await upsertFlight(
      dataSource,
      'BE-101',
      routeId,
      oneSeatType,
    );
    const departureAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const instanceRepo = dataSource.getRepository(FlightInstance);
    const instance = await instanceRepo.save(
      instanceRepo.create({
        flightId: oneSeatFlight.id,
        departureAt,
        arrivalAt: new Date(departureAt.getTime() + 90 * 60 * 1000),
        capacity: 1,
        status: 'SCHEDULED',
      }),
    );

    const buyerA = await loginAsCustomer(app, '09130000009');
    const buyerB = await loginAsCustomer(app, '09130000010');

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${buyerA.accessToken}`)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: 'خریدار الف', seatCode: '1A' }],
        }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${buyerB.accessToken}`)
        .send({
          flightInstanceId: instance.id,
          cabin: 'ECONOMY',
          passengers: [{ fullName: 'خریدار ب', seatCode: '1A' }],
        }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const activeBookings = await dataSource
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.flightInstanceId = :id', { id: instance.id })
      .andWhere('b.status IN (:...statuses)', {
        statuses: ['HELD', 'PAID', 'TICKETED'],
      })
      .getCount();
    expect(activeBookings).toBe(1);
  });
});
