import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { ClubMember } from '../src/database/entities/club-member.entity';
import { ClubCardRequest } from '../src/database/entities/club-card-request.entity';
import { ClubPointsEntry } from '../src/database/entities/club-points-entry.entity';
import { ClubTierRule } from '../src/database/entities/club-tier-rule.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { FlightInstance } from '../src/database/entities/flight-instance.entity';
import { Booking } from '../src/database/entities/booking.entity';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { resetCustomerPhones } from './helpers/customer-state.helper';
import { encryptPii, hashPii } from '../src/common/pii-crypto';
import { ClubPointsService } from '../src/modules/booking-engine/club-points.service';

/** Generates a checksum-valid, non-repeating synthetic national ID. */
function validNationalId(): string {
  for (;;) {
    const base = Array.from({ length: 9 }, () => crypto.randomInt(0, 10)).join(
      '',
    );
    if (/^(\d)\1{8}$/.test(base)) continue;
    const sum = base
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
    const r = sum % 11;
    return base + String(r < 2 ? r : 11 - r);
  }
}

describe('Club (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  async function findLatestAudit(where: {
    category: string;
    entityType: string;
    entityId: string;
  }) {
    return dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.category = :category', { category: where.category })
      .andWhere('a.entityType = :entityType', {
        entityType: where.entityType,
      })
      .andWhere('a.entityId = :entityId', { entityId: where.entityId })
      .orderBy('a.createdAt', 'DESC')
      .getOne();
  }

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await resetCustomerPhones(dataSource, [
      '09180000001',
      '09180000002',
      '09180000003',
      '09180000004',
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createFreshMember(overrides?: {
    cardStatus?: 'NONE' | 'ISSUED';
  }) {
    const nid = validNationalId();
    const repo = dataSource.getRepository(ClubMember);
    return repo.save(
      repo.create({
        fullName: `عضو تست ${crypto.randomUUID().slice(0, 6)}`,
        email: `${crypto.randomUUID().slice(0, 8)}@club.example`,
        nationalIdEnc: encryptPii(nid),
        nationalIdHash: hashPii(nid),
        points: 6000,
        level: 'GOLD',
        cardStatus: overrides?.cardStatus ?? 'NONE',
        cardNo: overrides?.cardStatus === 'ISSUED' ? 'GOLD-0001' : null,
      }),
    );
  }

  async function createReferredRequest(assignedTo: 'SENIOR' | 'CHAIR') {
    const member = await createFreshMember();
    const repo = dataSource.getRepository(ClubCardRequest);
    const req = await repo.save(
      repo.create({
        memberId: member.id,
        level: 'GOLD',
        points: 6000,
        status: 'REFERRED',
        assignedTo,
        history: [{ step: 'referred', labelFa: 'ارجاع تستی', at: 'اکنون' }],
      }),
    );
    return { member, req };
  }

  async function createSubmittedRequest() {
    const nid = validNationalId();
    const memberRepo = dataSource.getRepository(ClubMember);
    const member = await memberRepo.save(
      memberRepo.create({
        fullName: `عضو ارجاع ${crypto.randomUUID().slice(0, 6)}`,
        email: `${crypto.randomUUID().slice(0, 8)}@submit.example`,
        nationalIdEnc: encryptPii(nid),
        nationalIdHash: hashPii(nid),
        points: 6000,
        level: 'GOLD',
        cardStatus: 'REVIEW',
      }),
    );
    const reqRepo = dataSource.getRepository(ClubCardRequest);
    const req = await reqRepo.save(
      reqRepo.create({
        memberId: member.id,
        level: 'GOLD',
        points: 6000,
        status: 'SUBMITTED',
        history: [
          {
            step: 'submitted',
            labelFa: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت',
            at: 'اکنون',
          },
        ],
      }),
    );
    return { member, req, nid };
  }

  it('GET /club/members returns members + reconciling KPI counts; non-club roles get 403', async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/club/members')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const { members, kpis } = res.body.data as {
      members: { level: string; cardStatus: string; nationalIdEnc?: string }[];
      kpis: {
        totalMembers: number;
        issuedCards: number;
        tierCounts: Record<string, number>;
      };
    };
    expect(kpis.totalMembers).toBeGreaterThanOrEqual(
      members.length > 0 ? 1 : 0,
    );
    expect(
      kpis.tierCounts.SILVER + kpis.tierCounts.GOLD + kpis.tierCounts.PLATINUM,
    ).toBe(kpis.totalMembers);
    // PII columns never leave the API.
    expect(
      members.every((m) => !('nationalIdEnc' in m) && !('nationalIdHash' in m)),
    ).toBe(true);

    const finance = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .get('/club/members')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('national-ID search matches exactly via the hash; plaintext never stored', async () => {
    const nid = validNationalId();
    const memberRepo = dataSource.getRepository(ClubMember);
    await memberRepo.save(
      memberRepo.create({
        fullName: 'قابل‌جستجو',
        email: 'search@club.example',
        nationalIdEnc: encryptPii(nid),
        nationalIdHash: hashPii(nid),
        level: 'SILVER',
      }),
    );

    const { accessToken } = await loginAs(app, 'chair');
    const res = await request(app.getHttpServer())
      .get(`/club/members?q=${nid}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.members.some(
        (m: { fullName: string }) => m.fullName === 'قابل‌جستجو',
      ),
    ).toBe(true);

    const row = await dataSource
      .getRepository(ClubMember)
      .findOneBy({ nationalIdHash: hashPii(nid) });
    expect(row!.nationalIdEnc).not.toContain(nid);
  });

  it('POST /club/members: Senior Manager can add manually; bad checksum 400; duplicate 409', async () => {
    const senior = await loginAs(app, 'senior');
    const dto = {
      fullName: 'عضو جدید',
      email: `${crypto.randomUUID().slice(0, 8)}@new.example`,
      nationalId: validNationalId(),
      level: 'GOLD',
    };
    const createdBySenior = await request(app.getHttpServer())
      .post('/club/members')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send(dto);
    expect(createdBySenior.status).toBe(201);

    const ceo = await loginAs(app, 'ceo');
    const badChecksum = await request(app.getHttpServer())
      .post('/club/members')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ ...dto, nationalId: '0012345678' });
    expect(badChecksum.status).toBe(400);

    const dup = await request(app.getHttpServer())
      .post('/club/members')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ ...dto, email: 'other@new.example' });
    expect(dup.status).toBe(409);
  });

  it('PATCH /club/members/:id/deactivate preserves history, blocks benefits and replaces deletion', async () => {
    const member = await createFreshMember();
    const { accessToken: customerToken, userId } = await loginAsCustomer(
      app,
      '09180000004',
    );
    await linkMemberToUser(member.id, userId!, 6200);

    const { accessToken } = await loginAs(app, 'chair');
    const deactivated = await request(app.getHttpServer())
      .patch(`/club/members/${member.id}/deactivate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data).toMatchObject({
      id: member.id,
      isActive: false,
    });
    expect(deactivated.body.data.deactivatedAt).toBeTruthy();

    const persisted = await dataSource
      .getRepository(ClubMember)
      .findOneByOrFail({ id: member.id });
    expect(persisted.deactivatedAt).toBeInstanceOf(Date);

    const membership = await request(app.getHttpServer())
      .get('/my/club/membership')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(membership.status).toBe(200);
    expect(membership.body.data.isMember).toBe(false);

    const oldDelete = await request(app.getHttpServer())
      .delete(`/club/members/${member.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(oldDelete.status).toBe(404);

    const audit = await findLatestAudit({
      category: 'CLUB',
      entityType: 'ClubMember',
      entityId: member.id,
    });
    expect(audit?.action).toContain('غیرفعال');
  });

  it('PATCH level is Senior-only and audited', async () => {
    const member = await createFreshMember();
    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .patch(`/club/members/${member.id}/level`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ level: 'PLATINUM' });
    expect(forbidden.status).toBe(403);

    const senior = await loginAs(app, 'senior');
    const ok = await request(app.getHttpServer())
      .patch(`/club/members/${member.id}/level`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ level: 'PLATINUM' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.level).toBe('PLATINUM');

    const audit = await findLatestAudit({
      category: 'CLUB',
      entityType: 'ClubMember',
      entityId: member.id,
    });
    expect(audit).not.toBeNull();
  });

  it('direct issuance sets the card + issuedBy label, 409 when already issued, audited', async () => {
    const member = await createFreshMember();
    const { accessToken } = await loginAs(app, 'chair');

    const ok = await request(app.getHttpServer())
      .post(`/club/members/${member.id}/issue-card`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ok.status).toBe(201);
    expect(ok.body.data.cardStatus).toBe('ISSUED');
    expect(ok.body.data.cardNo).toMatch(/^GOLD-\d{4}$/);
    expect(ok.body.data.issuedByLabelFa).toBe('رئیس هیئت مدیره (صدور مستقیم)');

    const again = await request(app.getHttpServer())
      .post(`/club/members/${member.id}/issue-card`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(again.status).toBe(409);

    const audit = await findLatestAudit({
      category: 'CLUB',
      entityType: 'ClubMember',
      entityId: member.id,
    });
    expect(audit).not.toBeNull();
  });

  it('GET /club/submitted-card-requests: SITE_ADMIN lists SUBMITTED with nationalId; exec roles get 403', async () => {
    const { req, nid } = await createSubmittedRequest();
    const siteAdmin = await loginAs(app, 'site.admin');

    const list = await request(app.getHttpServer())
      .get('/club/submitted-card-requests')
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: { id: string }) => r.id === req.id);
    expect(row).toBeDefined();
    expect(row.status).toBe('SUBMITTED');
    expect(row.member.nationalId).toBe(nid);

    for (const username of ['ceo', 'senior', 'chair']) {
      const { accessToken } = await loginAs(app, username);
      const forbidden = await request(app.getHttpServer())
        .get('/club/submitted-card-requests')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(forbidden.status).toBe(403);
    }
  });

  it('PATCH /club/card-requests/:id/refer: SITE_ADMIN SUBMITTED→REFERRED + audit; exec 403; already referred → 409', async () => {
    const { req } = await createSubmittedRequest();
    const siteAdmin = await loginAs(app, 'site.admin');

    const referred = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/refer`)
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`)
      .send({ assignedTo: 'SENIOR' });
    expect(referred.status).toBe(200);
    expect(referred.body.data.status).toBe('REFERRED');
    expect(referred.body.data.assignedTo).toBe('SENIOR');
    const history = referred.body.data.history as { step: string }[];
    expect(history.some((h) => h.step === 'referred')).toBe(true);

    const audit = await findLatestAudit({
      category: 'CLUB',
      entityType: 'ClubCardRequest',
      entityId: req.id,
    });
    expect(audit).not.toBeNull();

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/refer`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ assignedTo: 'CHAIR' });
    expect(forbidden.status).toBe(403);

    const again = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/refer`)
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`)
      .send({ assignedTo: 'CHAIR' });
    expect(again.status).toBe(409);
  });

  it('GET /club/card-requests never returns SUBMITTED rows', async () => {
    const member = await createFreshMember();
    const reqRepo = dataSource.getRepository(ClubCardRequest);
    await reqRepo.save(
      reqRepo.create({
        memberId: member.id,
        level: 'GOLD',
        points: 6000,
        status: 'SUBMITTED',
        history: [],
      }),
    );

    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/club/card-requests')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.every((r: { status: string }) => r.status !== 'SUBMITTED'),
    ).toBe(true);
  });

  it('CEO/Chair approve any REFERRED request regardless of assignedTo (⚑ design override)', async () => {
    const { member, req } = await createReferredRequest('SENIOR');
    const { accessToken } = await loginAs(app, 'ceo');

    const res = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.cardNo).toMatch(/^GOLD-\d{4}$/);

    const updatedMember = await dataSource
      .getRepository(ClubMember)
      .findOneByOrFail({ id: member.id });
    expect(updatedMember.cardStatus).toBe('ISSUED');
    expect(updatedMember.cardNo).toBe(res.body.data.cardNo);
    expect(updatedMember.issuedByLabelFa).toBe('مدیر عامل (تأیید درخواست)');

    // History timeline gained the approval step.
    const history = res.body.data.history as { step: string }[];
    expect(history.some((h) => h.step === 'approved')).toBe(true);
  });

  it('Senior can approve only senior-assigned requests: CHAIR-assigned → 403, SENIOR-assigned → 200', async () => {
    const chairAssigned = await createReferredRequest('CHAIR');
    const senior = await loginAs(app, 'senior');

    const forbidden = await request(app.getHttpServer())
      .patch(`/club/card-requests/${chairAssigned.req.id}/approve`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(forbidden.status).toBe(403);

    const seniorAssigned = await createReferredRequest('SENIOR');
    const ok = await request(app.getHttpServer())
      .patch(`/club/card-requests/${seniorAssigned.req.id}/approve`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(ok.status).toBe(200);
  });

  it('reject sets the member back to NONE; deciding an already-decided request → 409', async () => {
    const { member, req } = await createReferredRequest('CHAIR');
    const chair = await loginAs(app, 'chair');

    const rejected = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/reject`)
      .set('Authorization', `Bearer ${chair.accessToken}`);
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');

    const updatedMember = await dataSource
      .getRepository(ClubMember)
      .findOneByOrFail({ id: member.id });
    expect(updatedMember.cardStatus).toBe('NONE');

    const again = await request(app.getHttpServer())
      .patch(`/club/card-requests/${req.id}/approve`)
      .set('Authorization', `Bearer ${chair.accessToken}`);
    expect(again.status).toBe(409);
  });

  describe('tier rules (Phase 65)', () => {
    it('GET returns the seeded defaults + computed preview for COMMERCIAL_MANAGER; other roles get 403', async () => {
      const commercial = await loginAs(app, 'comm');
      const commercialRes = await request(app.getHttpServer())
        .get('/club/tier-rules')
        .set('Authorization', `Bearer ${commercial.accessToken}`);
      expect(commercialRes.status).toBe(200);
      expect(commercialRes.body.data.goldMinPoints).toBe(5000);
      expect(commercialRes.body.data.platinumMinPoints).toBe(15000);
      expect(commercialRes.body.data.cardRequestMinPoints).toBe(5000);
      expect(commercialRes.body.data.preview).toEqual([
        { tier: 'SILVER', minPoints: 0, maxPoints: 4999 },
        { tier: 'GOLD', minPoints: 5000, maxPoints: 14999 },
        { tier: 'PLATINUM', minPoints: 15000, maxPoints: null },
      ]);

      for (const username of ['ceo', 'finance', 'senior', 'chair']) {
        const { accessToken } = await loginAs(app, username);
        const res = await request(app.getHttpServer())
          .get('/club/tier-rules')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(403);
      }
    });

    it('PATCH rejects goldMinPoints >= platinumMinPoints with VALIDATION_FAILED', async () => {
      const { accessToken } = await loginAs(app, 'comm');
      const res = await request(app.getHttpServer())
        .patch('/club/tier-rules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          goldMinPoints: 15000,
          platinumMinPoints: 15000,
          cardRequestMinPoints: 5000,
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('PATCH updates the singleton row, is reflected on the next GET, and is audited', async () => {
      const { accessToken } = await loginAs(app, 'comm');
      const patchRes = await request(app.getHttpServer())
        .patch('/club/tier-rules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          goldMinPoints: 4000,
          platinumMinPoints: 12000,
          cardRequestMinPoints: 4000,
        });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.goldMinPoints).toBe(4000);
      expect(patchRes.body.data.platinumMinPoints).toBe(12000);

      const getRes = await request(app.getHttpServer())
        .get('/club/tier-rules')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.data.goldMinPoints).toBe(4000);
      expect(getRes.body.data.platinumMinPoints).toBe(12000);

      const rule = await dataSource
        .getRepository(ClubTierRule)
        .find({ take: 1 })
        .then((rows) => rows[0]);
      const audit = await findLatestAudit({
        category: 'CLUB',
        entityType: 'ClubTierRule',
        entityId: rule.id,
      });
      expect(audit).not.toBeNull();

      // Restore defaults so later tests in this file see the seeded values.
      await request(app.getHttpServer())
        .patch('/club/tier-rules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          goldMinPoints: 5000,
          platinumMinPoints: 15000,
          cardRequestMinPoints: 5000,
        });
    });

    it('a real points credit recomputes ClubMember.level from the current rules, with no separate action', async () => {
      const suffix = crypto.randomUUID().slice(0, 6);
      const memberRepo = dataSource.getRepository(ClubMember);
      const member = await memberRepo.save(
        memberRepo.create({
          fullName: `عضو تست ${suffix}`,
          email: `${crypto.randomUUID().slice(0, 8)}@club.example`,
          nationalIdEnc: encryptPii(validNationalId()),
          nationalIdHash: hashPii(crypto.randomUUID()),
          points: 0,
          level: 'SILVER',
        }),
      );
      const instance = await dataSource
        .getRepository(FlightInstance)
        .createQueryBuilder('fi')
        .getOneOrFail();
      const bookingRepo = dataSource.getRepository(Booking);
      const booking = await bookingRepo.save(
        bookingRepo.create({
          pnr: `TR${suffix.toUpperCase()}`,
          flightInstanceId: instance.id,
          channel: 'SYSTEM',
          status: 'TICKETED',
          priceIrr: 2_000_000_000n,
        }),
      );

      const clubPoints = app.get(ClubPointsService);
      // 2,000,000,000 IRR at 100,000 IRR/point = 20,000 points — comfortably
      // past the seeded PLATINUM threshold (15,000).
      await dataSource.manager.transaction((tx) =>
        clubPoints.earnForPurchase(tx, member.id, 2_000_000_000n, booking.id),
      );

      const updated = await memberRepo.findOneByOrFail({ id: member.id });
      expect(updated.points).toBe(20000);
      expect(updated.level).toBe('PLATINUM');
    });
  });

  // ── Customer self-service (user panel club tab) ───────────────────────

  async function linkMemberToUser(
    memberId: string,
    userId: string,
    points: number,
  ) {
    const memberRepo = dataSource.getRepository(ClubMember);
    await memberRepo.update({ userId }, { userId: null });
    await dataSource
      .getRepository(ClubPointsEntry)
      .delete({ clubMemberId: memberId });
    const pointsEntryRepo = dataSource.getRepository(ClubPointsEntry);
    await pointsEntryRepo.save(
      pointsEntryRepo.create({
        clubMemberId: memberId,
        type: 'EARN',
        signedPoints: points,
      }),
    );
    await memberRepo.update(
      { id: memberId },
      { userId, points, cardStatus: 'NONE', cardNo: null },
    );
  }

  it('GET /my/club/membership returns full view for a linked member; 403 for staff', async () => {
    const member = await createFreshMember();
    const { accessToken, userId } = await loginAsCustomer(app, '09180000001');
    await linkMemberToUser(member.id, userId!, 6200);

    const res = await request(app.getHttpServer())
      .get('/my/club/membership')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isMember).toBe(true);
    expect(res.body.data.balance).toBe(6200);
    expect(res.body.data.canRequestCard).toBe(true);

    const { accessToken: ceoToken } = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get('/my/club/membership')
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('POST /my/club/card-request creates SUBMITTED request and sets REVIEW; rejects duplicate', async () => {
    const member = await createFreshMember();
    const { accessToken, userId } = await loginAsCustomer(app, '09180000002');
    await linkMemberToUser(member.id, userId!, 6000);

    const submit = await request(app.getHttpServer())
      .post('/my/club/card-request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(submit.status).toBe(201);
    expect(submit.body.data.status).toBe('SUBMITTED');

    const memberAfter = await dataSource
      .getRepository(ClubMember)
      .findOneByOrFail({ id: member.id });
    expect(memberAfter.cardStatus).toBe('REVIEW');

    const duplicate = await request(app.getHttpServer())
      .post('/my/club/card-request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(duplicate.status).toBe(409);
  });

  it('POST /my/club/card-request rejects when below cardRequestMinPoints', async () => {
    const member = await createFreshMember();
    const { accessToken, userId } = await loginAsCustomer(app, '09180000003');
    await linkMemberToUser(member.id, userId!, 1000);

    const res = await request(app.getHttpServer())
      .post('/my/club/card-request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
