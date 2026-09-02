import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AircraftSeatMap } from '../src/database/entities/aircraft-seat-map.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyInvoice } from '../src/database/entities/agency-invoice.entity';
import { Booking } from '../src/database/entities/booking.entity';
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
import { loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

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

    const seatmapRes = await request(app.getHttpServer()).get(
      `/search/flights/${instance.id}/seatmap`,
    );
    const seat = seatmapRes.body.data.seats.find(
      (s: { seatCode: string }) => s.seatCode === '3C',
    );
    expect(seat.status).toBe('FREE');
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
