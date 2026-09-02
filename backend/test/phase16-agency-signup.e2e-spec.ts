import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, Like } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { AgencyCreditLine } from '../src/database/entities/agency-credit-line.entity';
import { AgencyProfile } from '../src/database/entities/agency-profile.entity';
import { AgencyMembershipRequest } from '../src/database/entities/agency-membership-request.entity';
import { AgencyRequestOtp } from '../src/database/entities/agency-request-otp.entity';
import { SmsLog } from '../src/database/entities/sms-log.entity';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { Notification } from '../src/database/entities/notification.entity';
import { TWO_FACTOR_PROVIDER } from '../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../src/modules/auth/providers/mock-two-factor.provider';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

/** Phase 16 — public agency pre-registration + corrected review-chain role
 * gates (site admin refers → commercial manager approves + SMS). See
 * docs/DB_SCHEMA.md Phase 16. */
describe('Phase 16 — agency self-registration (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let twoFactor: MockTwoFactorProvider;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);
  });

  afterEach(async () => {
    // These phones are unique to this file, but the approve test really
    // creates a User+AgencyProfile+AgencyCreditLine — clean them up so a
    // re-run (or a combined suite run) doesn't hit the phone unique
    // constraint on a second approveRequest for the same number.
    const phonePrefix = '0912111000';
    const users = await dataSource.getRepository(User).find({
      where: { phone: Like(`${phonePrefix}%`) },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await dataSource
        .getRepository(AgencyCreditLine)
        .delete({ agencyId: In(userIds) });
      await dataSource
        .getRepository(AgencyProfile)
        .delete({ userId: In(userIds) });
      await dataSource.getRepository(User).delete({ id: In(userIds) });
    }
    await dataSource
      .getRepository(AgencyMembershipRequest)
      .delete({ phone: Like(`${phonePrefix}%`) });
    await dataSource
      .getRepository(AgencyRequestOtp)
      .delete({ phone: Like(`${phonePrefix}%`) });
    await app.close();
  });

  function auth(token: string | null | undefined) {
    return `Bearer ${token}`;
  }

  async function submitFreshRequest(phone: string) {
    const otpRes = await request(app.getHttpServer())
      .post('/agencies/requests/otp')
      .send({ phone });
    expect(otpRes.status).toBe(200);
    const challengeId = otpRes.body.data.challengeId as string;
    const code = twoFactor.getLastCode(challengeId)!;
    expect(code).toBeTruthy();

    const createRes = await request(app.getHttpServer())
      .post('/agencies/requests')
      .send({
        applicantName: 'آژانس مسافرتی تست',
        managerName: 'نگار رضایی',
        licenseNo: `LIC-${phone.slice(-4)}`,
        phone,
        challengeId,
        code,
      });
    return createRes;
  }

  it('public OTP + submit creates a real PENDING request with no email/city/documents collected', async () => {
    const phone = '09121110001';
    const res = await submitFreshRequest(phone);
    expect(res.status).toBe(201);

    const row = await dataSource
      .getRepository(AgencyMembershipRequest)
      .createQueryBuilder('r')
      .where('r.id = :id', { id: res.body.data.id })
      .getOneOrFail();
    expect(row.status).toBe('PENDING');
    expect(row.phone).toBe(phone);
    expect(row.email).toBeNull();
    expect(row.city).toBeNull();
  });

  it('submitting a request creates a cartable task and a notification for every active SITE_ADMIN', async () => {
    const phone = '09121110004';
    const res = await submitFreshRequest(phone);
    expect(res.status).toBe(201);
    const requestId = res.body.data.id as string;

    const siteAdmin = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'site.admin' });

    const task = await dataSource.getRepository(CartableTask).findOneBy({
      sourceType: 'AGENCY_REQUEST',
      sourceId: requestId,
      assigneeId: siteAdmin.id,
    });
    expect(task).not.toBeNull();
    expect(task!.category).toBe('AGENCY');
    expect(task!.status).toBe('OPEN');

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: siteAdmin.id })
      .andWhere("n.action = 'CREATED'")
      .andWhere('n.entityId = :entityId', { entityId: requestId })
      .getOne();
    expect(notification).not.toBeNull();

    // The site admin actually sees it in their own cartable.
    const siteAdminLogin = await loginAs(app, 'site.admin');
    const list = await request(app.getHttpServer())
      .get('/cartable?category=AGENCY')
      .set('Authorization', auth(siteAdminLogin.accessToken));
    expect(
      (list.body.data.tasks as { id: string }[]).some((t) => t.id === task!.id),
    ).toBe(true);
  });

  it('wrong OTP code is rejected, and a code cannot be reused', async () => {
    const phone = '09121110002';
    const otpRes = await request(app.getHttpServer())
      .post('/agencies/requests/otp')
      .send({ phone });
    const challengeId = otpRes.body.data.challengeId as string;

    const wrong = await request(app.getHttpServer())
      .post('/agencies/requests')
      .send({
        applicantName: 'آژانس',
        managerName: 'مدیر',
        licenseNo: 'LIC-0002',
        phone,
        challengeId,
        code: '000000',
      });
    expect(wrong.status).toBe(401);

    const code = twoFactor.getLastCode(challengeId)!;
    const first = await request(app.getHttpServer())
      .post('/agencies/requests')
      .send({
        applicantName: 'آژانس',
        managerName: 'مدیر',
        licenseNo: 'LIC-0002',
        phone,
        challengeId,
        code,
      });
    expect(first.status).toBe(201);

    const replay = await request(app.getHttpServer())
      .post('/agencies/requests')
      .send({
        applicantName: 'آژانس دوم',
        managerName: 'مدیر دوم',
        licenseNo: 'LIC-0003',
        phone,
        challengeId,
        code,
      });
    expect(replay.status).toBe(401);
  });

  it('review chain: commercial then finance approval creates the agency and sends credentials', async () => {
    const phone = '09121110003';
    const created = await submitFreshRequest(phone);
    const requestId = created.body.data.id as string;

    const siteAdmin = await loginAs(app, 'site.admin');
    const list = await request(app.getHttpServer())
      .get('/agencies/requests?status=PENDING')
      .set('Authorization', auth(siteAdmin.accessToken));
    expect(list.status).toBe(200);
    expect(
      (list.body.data as { id: string }[]).some((r) => r.id === requestId),
    ).toBe(true);

    const senior = await loginAs(app, 'senior');
    const seniorApprove = await request(app.getHttpServer())
      .patch(`/agencies/requests/${requestId}/approve`)
      .set('Authorization', auth(senior.accessToken));
    expect(seniorApprove.status).toBe(403);

    const commercial = await loginAs(app, 'comm');
    const approve = await request(app.getHttpServer())
      .patch(`/agencies/requests/${requestId}/approve`)
      .set('Authorization', auth(commercial.accessToken));
    expect(approve.status).toBe(200);
    expect(approve.body.data.stage).toBe('AWAITING_FINANCE');
    expect(
      await dataSource.getRepository(User).findOneBy({ phone }),
    ).toBeNull();

    const finance = await loginAs(app, 'finance');
    const finalApproval = await request(app.getHttpServer())
      .patch(`/agencies/requests/${requestId}/approve`)
      .set('Authorization', auth(finance.accessToken));
    expect(finalApproval.status).toBe(200);
    expect(finalApproval.body.data.stage).toBe('APPROVED');
    expect(finalApproval.body.data.tempPassword).toBeTruthy();

    const agencyUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: finalApproval.body.data.agencyId });
    expect(agencyUser.role).toBe('AGENCY');
    expect(agencyUser.phone).toBe(phone);

    const smsLog = await dataSource.getRepository(SmsLog).findOne({
      where: { phone, messageType: 'TEMP_PASSWORD' },
      order: { createdAt: 'desc' },
    });
    expect(smsLog).not.toBeNull();
    expect(smsLog!.status).toBe('SUCCESS');
  });
});
