import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource, In, Not } from 'typeorm';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { User } from '../src/database/entities/user.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { ChairReportPermission } from '../src/database/entities/chair-report-permission.entity';
import { ManagerReferral } from '../src/database/entities/manager-referral.entity';
import { ManagerReferralReport } from '../src/database/entities/manager-referral-report.entity';
import { AgencyMembershipRequest } from '../src/database/entities/agency-membership-request.entity';
import { Notification } from '../src/database/entities/notification.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';
import { EXEC_ROLES } from '../src/common/exec-roles';

describe('Cartable + referrals + messages (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function userId(username: string): Promise<string> {
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username });
    return user.id;
  }

  /** A throwaway OPEN task for the given assignee, independent of seed data. */
  async function createFreshTask(assigneeId: string) {
    const repo = dataSource.getRepository(CartableTask);
    return repo.save(
      repo.create({
        assigneeId,
        category: 'ADMIN',
        title: `تست ${crypto.randomUUID().slice(0, 8)}`,
        description: 'مورد تستی',
        senderLabelFa: 'تست',
      }),
    );
  }

  // ── Listing & filters ─────────────────────────────────────────────────

  it('GET /cartable returns only the caller’s own tasks and per-category counts', async () => {
    const ceoId = await userId('ceo');
    const financeId = await userId('finance');
    const ceoTask = await createFreshTask(ceoId);
    const financeTask = await createFreshTask(financeId);

    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/cartable')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.tasks.map((t: { id: string }) => t.id);
    expect(ids).toContain(ceoTask.id);
    expect(ids).not.toContain(financeTask.id);
    expect(
      res.body.data.counts.ADMIN +
        res.body.data.counts.AGENCY +
        res.body.data.counts.MANAGER,
    ).toBe(res.body.data.totalOpen);
  });

  it('category= filters rows; counts stay unfiltered (KPI cards show all OPEN)', async () => {
    const ceoId = await userId('ceo');
    await createFreshTask(ceoId); // ADMIN
    const cartableTaskRepo = dataSource.getRepository(CartableTask);
    await cartableTaskRepo.save(
      cartableTaskRepo.create({
        assigneeId: ceoId,
        category: 'AGENCY',
        title: 'تست دسته',
        description: 'د',
        senderLabelFa: 'ت',
      }),
    );

    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/cartable?category=AGENCY')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(
      res.body.data.tasks.every(
        (t: { category: string }) => t.category === 'AGENCY',
      ),
    ).toBe(true);
    expect(res.body.data.counts.ADMIN).toBeGreaterThan(0);
  });

  it('IT_MANAGER can access the unified cartable', async () => {
    const { accessToken } = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/cartable')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        tasks: expect.any(Array),
        counts: expect.any(Object),
      }),
    );
  });

  // ── Detail + unread state ────────────────────────────────────────────

  it('GET /cartable/:id returns the task, marks it read (idempotently), and is 404 for someone else’s task', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const { accessToken } = await loginAs(app, 'ceo');

    const first = await request(app.getHttpServer())
      .get(`/cartable/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.id).toBe(task.id);
    expect(first.body.data.readAt).not.toBeNull();
    expect(first.body.data).toHaveProperty('history');
    expect(Array.isArray(first.body.data.history)).toBe(true);

    // Repeat view doesn't move readAt forward — mark-read is idempotent.
    const readAtFirst = first.body.data.readAt;
    const second = await request(app.getHttpServer())
      .get(`/cartable/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(second.body.data.readAt).toBe(readAtFirst);

    const foreignTask = await createFreshTask(await userId('finance'));
    const foreign = await request(app.getHttpServer())
      .get(`/cartable/${foreignTask.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(foreign.status).toBe(404);
  });

  it('GET /cartable/:id includes audit history after a resolution', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const { accessToken } = await loginAs(app, 'ceo');

    await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'تأیید برای تاریخچه' });

    const detail = await request(app.getHttpServer())
      .get(`/cartable/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('APPROVED');
    const history = detail.body.data.history as { detail: string }[];
    expect(history.length).toBeGreaterThan(0);
    expect(history.some((h) => h.detail.includes('تأیید برای تاریخچه'))).toBe(
      true,
    );
  });

  it('GET /cartable/unread-count only counts never-viewed tasks; viewing one via detail drops the count', async () => {
    const ceoId = await userId('ceo');
    const { accessToken } = await loginAs(app, 'ceo');

    const before = await request(app.getHttpServer())
      .get('/cartable/unread-count')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);
    const baseline = before.body.data.count as number;

    const task = await createFreshTask(ceoId);
    const afterCreate = await request(app.getHttpServer())
      .get('/cartable/unread-count')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(afterCreate.body.data.count).toBe(baseline + 1);

    await request(app.getHttpServer())
      .get(`/cartable/${task.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const afterView = await request(app.getHttpServer())
      .get('/cartable/unread-count')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(afterView.body.data.count).toBe(baseline);
  });

  // ── Review actions ───────────────────────────────────────────────────

  it('approve/reject without a note → 400 with the design’s message', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const { accessToken } = await loginAs(app, 'ceo');

    const res = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('resolving an already-resolved task → 409; resolving someone else’s → 403', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const ceo = await loginAs(app, 'ceo');

    const first = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/approve`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ note: 'تأیید شد' });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/reject`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ note: 'رد' });
    expect(second.status).toBe(409);

    const otherTask = await createFreshTask(await userId('finance'));
    const foreign = await request(app.getHttpServer())
      .patch(`/cartable/${otherTask.id}/approve`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ note: 'تأیید' });
    expect(foreign.status).toBe(403);
  });

  it('resolution writes an AuditLog row with the note', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const { accessToken } = await loginAs(app, 'ceo');

    await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'دلیل مشخص' });

    const auditRow = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :entityType', { entityType: 'CartableTask' })
      .andWhere('a.entityId = :entityId', { entityId: task.id })
      .getOne();
    expect(auditRow).not.toBeNull();
    expect(auditRow!.detail).toContain('دلیل مشخص');
  });

  it('transfer creates a new OPEN task for the target and marks the original TRANSFERRED', async () => {
    const ceoId = await userId('ceo');
    const financeId = await userId('finance');
    const task = await createFreshTask(ceoId);
    const ceo = await loginAs(app, 'ceo');

    const res = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/transfer`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ toId: financeId, note: 'به مدیر مالی منتقل شود' });
    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBe(financeId);
    expect(res.body.data.status).toBe('OPEN');

    const original = await dataSource
      .getRepository(CartableTask)
      .findOneByOrFail({ id: task.id });
    expect(original.status).toBe('TRANSFERRED');
    expect(original.transferredToId).toBe(financeId);

    // The target actually sees it.
    const finance = await loginAs(app, 'finance');
    const list = await request(app.getHttpServer())
      .get('/cartable')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(list.body.data.tasks.map((t: { id: string }) => t.id)).toContain(
      res.body.data.id,
    );
  });

  it('transfer to a non-staff user → 400', async () => {
    const ceoId = await userId('ceo');
    const task = await createFreshTask(ceoId);
    const customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ role: 'USER' });
    const { accessToken } = await loginAs(app, 'ceo');

    const res = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/transfer`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ toId: customer.id, note: 'انتقال' });
    expect(res.status).toBe(400);
  });

  // ── Chair permission gate ─────────────────────────────────────────────

  it('chair-permission full loop: request → chair cartable task → approve → requester sees APPROVED', async () => {
    // Fresh slate for the commercial manager's requests.
    const commId = await userId('comm');
    await dataSource
      .getRepository(CartableTask)
      .delete({ sourceType: 'CHAIR_PERMISSION' });
    await dataSource
      .getRepository(ChairReportPermission)
      .delete({ requesterId: commId });

    const comm = await loginAs(app, 'comm');
    const created = await request(app.getHttpServer())
      .post('/cartable/chair-permission')
      .set('Authorization', `Bearer ${comm.accessToken}`);
    expect(created.status).toBe(201);

    // Duplicate while PENDING → 409.
    const dup = await request(app.getHttpServer())
      .post('/cartable/chair-permission')
      .set('Authorization', `Bearer ${comm.accessToken}`);
    expect(dup.status).toBe(409);

    // The chair received a cartable task and approves it.
    const chair = await loginAs(app, 'chair');
    const chairId = await userId('chair');
    const chairTask = await dataSource
      .getRepository(CartableTask)
      .findOneByOrFail({
        sourceType: 'CHAIR_PERMISSION',
        sourceId: created.body.data.id,
        assigneeId: chairId,
      });
    const approve = await request(app.getHttpServer())
      .patch(`/cartable/${chairTask.id}/approve`)
      .set('Authorization', `Bearer ${chair.accessToken}`)
      .send({ note: 'مجوز صادر شد' });
    expect(approve.status).toBe(200);
    const siblingTasks = await dataSource.getRepository(CartableTask).findBy({
      sourceType: 'CHAIR_PERMISSION',
      sourceId: created.body.data.id,
    });
    expect(siblingTasks.length).toBeGreaterThan(0);
    expect(siblingTasks.every((task) => task.status === 'APPROVED')).toBe(true);

    const status = await request(app.getHttpServer())
      .get('/cartable/chair-permission')
      .set('Authorization', `Bearer ${comm.accessToken}`);
    expect(status.body.data.latest.status).toBe('APPROVED');
  });

  it('chair-permission request as SENIOR_MANAGER → 403 (gate exists only in Finance/Commercial)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .post('/cartable/chair-permission')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  // ── Referrals ────────────────────────────────────────────────────────

  it('creating a referral requires title/body/≥1 recipient and creates recipient cartable tasks', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');

    const invalid = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ title: '', body: '', recipientIds: [] });
    expect(invalid.status).toBe(400);

    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'گزارش تستی',
        body: 'شرح تستی',
        recipientIds: [financeId],
        priority: 'HIGH',
      });
    expect(created.status).toBe(201);

    const recipientTask = await dataSource
      .getRepository(CartableTask)
      .findOneBy({
        sourceType: 'MANAGER_REFERRAL',
        sourceId: created.body.data.id,
        assigneeId: financeId,
      });
    expect(recipientTask).not.toBeNull();
    expect(recipientTask!.category).toBe('MANAGER');
  });

  it('POST /referrals as a non-senior role → 403; KPI counts reconcile with statuses', async () => {
    const finance = await loginAs(app, 'finance');
    const forbidden = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ title: 'ت', body: 'ت', recipientIds: [await userId('ceo')] });
    expect(forbidden.status).toBe(403);

    const senior = await loginAs(app, 'senior');
    const list = await request(app.getHttpServer())
      .get('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(list.status).toBe(200);
    const { kpis, referrals } = list.body.data as {
      kpis: {
        total: number;
        awaitingReport: number;
        reported: number;
        closed: number;
      };
      referrals: { status: string }[];
    };
    expect(kpis.total).toBe(referrals.length);
    expect(kpis.awaitingReport).toBe(
      referrals.filter((r) => r.status === 'SENT' || r.status === 'REVIEWING')
        .length,
    );
  });

  it('a non-recipient, non-sender exec gets 403 on referral detail; a non-recipient cannot report', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ title: 'محرمانه', body: 'شرح', recipientIds: [financeId] });

    const ceo = await loginAs(app, 'ceo');
    const detail = await request(app.getHttpServer())
      .get(`/referrals/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(detail.status).toBe(403);

    const report = await request(app.getHttpServer())
      .post(`/referrals/${created.body.data.id}/reports`)
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ body: 'گزارش نامربوط' });
    expect(report.status).toBe(403);
  });

  it('full referral loop: report flips to REPORTED, close only from REPORTED, revision back to REVIEWING', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ title: 'چرخه کامل', body: 'شرح', recipientIds: [financeId] });
    const referralId = created.body.data.id as string;

    // Closing before any report → 409.
    const early = await request(app.getHttpServer())
      .patch(`/referrals/${referralId}/close`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(early.status).toBe(409);

    const finance = await loginAs(app, 'finance');
    const report = await request(app.getHttpServer())
      .post(`/referrals/${referralId}/reports`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'گزارش آماده است' });
    expect(report.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/referrals/${referralId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(detail.body.data.status).toBe('REPORTED');
    expect(detail.body.data.reports).toHaveLength(1);

    const revision = await request(app.getHttpServer())
      .patch(`/referrals/${referralId}/request-revision`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(revision.status).toBe(200);
    expect(revision.body.data.status).toBe('REVIEWING');

    // Report again, then close.
    await request(app.getHttpServer())
      .post(`/referrals/${referralId}/reports`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'گزارش اصلاح‌شده' });
    const close = await request(app.getHttpServer())
      .patch(`/referrals/${referralId}/close`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(close.status).toBe(200);
    expect(close.body.data.status).toBe('CLOSED');

    // Reporting on a CLOSED referral → 409.
    const late = await request(app.getHttpServer())
      .post(`/referrals/${referralId}/reports`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'دیر شد' });
    expect(late.status).toBe(409);
  });

  // ── Attachments (Phase 29 — resolve raw StoredFile ids into metadata) ──
  const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('a referral created with attachmentIds resolves real fileName/mimeType/sizeBytes in list() and detail(); myReferrals() resolves it for the recipient too', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');

    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'مدرک.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'با پیوست',
        body: 'شرح',
        recipientIds: [financeId],
        attachmentIds: [fileId],
      });
    expect(created.status).toBe(201);
    const referralId = created.body.data.id as string;

    const list = await request(app.getHttpServer())
      .get('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`);
    const listed = (
      list.body.data.referrals as {
        id: string;
        attachments: { id: string; fileName: string }[];
      }[]
    ).find((r) => r.id === referralId)!;
    expect(listed.attachments).toEqual([
      expect.objectContaining({
        id: fileId,
        fileName: 'مدرک.png',
        mimeType: 'image/png',
        sizeBytes: expect.any(Number),
      }),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/referrals/${referralId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(detail.body.data.attachments).toEqual([
      expect.objectContaining({ id: fileId, fileName: 'مدرک.png' }),
    ]);

    const finance = await loginAs(app, 'finance');
    const mine = await request(app.getHttpServer())
      .get('/referrals/mine')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    const mineRow = (
      mine.body.data.referrals as {
        id: string;
        attachments: { id: string; fileName: string }[];
      }[]
    ).find((r) => r.id === referralId)!;
    expect(mineRow.attachments).toEqual([
      expect.objectContaining({ id: fileId, fileName: 'مدرک.png' }),
    ]);
  });

  it('a report submitted with attachmentIds resolves real metadata inside detail().reports', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'گزارش با پیوست',
        body: 'شرح',
        recipientIds: [financeId],
      });
    const referralId = created.body.data.id as string;

    const finance = await loginAs(app, 'finance');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'گزارش.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/referrals/${referralId}/reports`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'گزارش آماده است', attachmentIds: [fileId] });

    const detail = await request(app.getHttpServer())
      .get(`/referrals/${referralId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(detail.body.data.reports[0].attachments).toEqual([
      expect.objectContaining({ id: fileId, fileName: 'گزارش.png' }),
    ]);
  });

  it('a referral with no attachments resolves to an empty array, not null/undefined', async () => {
    const senior = await loginAs(app, 'senior');
    const financeId = await userId('finance');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ title: 'بدون پیوست', body: 'شرح', recipientIds: [financeId] });
    const referralId = created.body.data.id as string;

    const detail = await request(app.getHttpServer())
      .get(`/referrals/${referralId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(detail.body.data.attachments).toEqual([]);
  });

  // ── GET /referrals/mine (Phase 26 — recipient-side listing) ────────────

  it('GET /referrals/mine returns only referrals where the caller is a recipient, not ones they sent', async () => {
    const senior = await loginAs(app, 'senior');
    const employeeId = await userId('com.ahmadi');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'ارجاع به کارمند',
        body: 'شرح',
        recipientIds: [employeeId],
      });
    expect(created.status).toBe(201);

    const employee = await loginAs(app, 'com.ahmadi');
    const mine = await request(app.getHttpServer())
      .get('/referrals/mine')
      .set('Authorization', `Bearer ${employee.accessToken}`);
    expect(mine.status).toBe(200);
    const ids = (mine.body.data.referrals as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(created.body.data.id);

    // The sender is not a recipient of their own referral.
    const seniorMine = await request(app.getHttpServer())
      .get('/referrals/mine')
      .set('Authorization', `Bearer ${senior.accessToken}`);
    const seniorIds = (seniorMine.body.data.referrals as { id: string }[]).map(
      (r) => r.id,
    );
    expect(seniorIds).not.toContain(created.body.data.id);
  });

  it('GET /referrals/mine: hasMyReport flips true only after this recipient reports, and counts reconcile', async () => {
    const senior = await loginAs(app, 'senior');
    const employeeId = await userId('com.ahmadi');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'گزارش من کجاست',
        body: 'شرح',
        recipientIds: [employeeId],
      });
    const referralId = created.body.data.id as string;

    const employee = await loginAs(app, 'com.ahmadi');
    const before = await request(app.getHttpServer())
      .get('/referrals/mine')
      .set('Authorization', `Bearer ${employee.accessToken}`);
    const rowBefore = (
      before.body.data.referrals as { id: string; hasMyReport: boolean }[]
    ).find((r) => r.id === referralId)!;
    expect(rowBefore.hasMyReport).toBe(false);
    expect(before.body.data.counts.total).toBe(
      before.body.data.referrals.length,
    );
    expect(before.body.data.counts.awaitingMyReport).toBe(
      (
        before.body.data.referrals as { hasMyReport: boolean; status: string }[]
      ).filter((r) => !r.hasMyReport && r.status !== 'CLOSED').length,
    );

    await request(app.getHttpServer())
      .post(`/referrals/${referralId}/reports`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ body: 'گزارش من' });

    const after = await request(app.getHttpServer())
      .get('/referrals/mine')
      .set('Authorization', `Bearer ${employee.accessToken}`);
    const rowAfter = (
      after.body.data.referrals as { id: string; hasMyReport: boolean }[]
    ).find((r) => r.id === referralId)!;
    expect(rowAfter.hasMyReport).toBe(true);
  });

  it('GET /referrals/mine: 401 without login', async () => {
    const res = await request(app.getHttpServer()).get('/referrals/mine');
    expect(res.status).toBe(401);
  });

  it('approving a referral-sourced cartable task submits the note as the report', async () => {
    const senior = await loginAs(app, 'senior');
    const commId = await userId('comm');
    const created = await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ title: 'از طریق کارتابل', body: 'شرح', recipientIds: [commId] });
    const referralId = created.body.data.id as string;

    const recipientTask = await dataSource
      .getRepository(CartableTask)
      .findOneByOrFail({
        sourceType: 'MANAGER_REFERRAL',
        sourceId: referralId,
        assigneeId: commId,
      });

    const comm = await loginAs(app, 'comm');
    const approve = await request(app.getHttpServer())
      .patch(`/cartable/${recipientTask.id}/approve`)
      .set('Authorization', `Bearer ${comm.accessToken}`)
      .send({ note: 'گزارش من از طریق کارتابل' });
    expect(approve.status).toBe(200);

    const referral = await dataSource
      .getRepository(ManagerReferral)
      .createQueryBuilder('r')
      .where('r.id = :id', { id: referralId })
      .getOneOrFail();
    expect(referral.status).toBe('REPORTED');

    const reports = await dataSource
      .getRepository(ManagerReferralReport)
      .createQueryBuilder('rep')
      .where('rep.referralId = :referralId', { referralId })
      .getMany();
    expect(reports.some((r) => r.body === 'گزارش من از طریق کارتابل')).toBe(
      true,
    );
  });

  // ── Manager messages ─────────────────────────────────────────────────

  it('a message to FINANCE delivers one cartable task to every active finance manager', async () => {
    const ceo = await loginAs(app, 'ceo');
    const expectedRecipients = await dataSource.getRepository(User).countBy({
      role: 'FINANCE_MANAGER',
      isActive: true,
    });
    const res = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ toDept: 'FINANCE', subject: 'موضوع تستی', body: 'متن تستی' });
    expect(res.status).toBe(201);
    expect(res.body.data.deliveredCount).toBe(expectedRecipients);

    const financeId = await userId('finance');
    const delivered = await dataSource.getRepository(CartableTask).findOneBy({
      sourceType: 'MANAGER_MESSAGE',
      sourceId: res.body.data.message.id,
      assigneeId: financeId,
    });
    expect(delivered).not.toBeNull();
    expect(delivered!.title).toBe('موضوع تستی');
  });

  it('allows the site admin to send an organizational message from cartable', async () => {
    const siteAdmin = await loginAs(app, 'site.admin');
    const res = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${siteAdmin.accessToken}`)
      .send({
        toDept: 'COMMERCIAL',
        subject: 'پیام ادمین سایت',
        body: 'متن تست ادمین سایت',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.deliveredCount).toBeGreaterThan(0);
  });

  it('ALL_MANAGERS fans out to every active exec account except the sender; SUPPORT routes through active site admins', async () => {
    const ceo = await loginAs(app, 'ceo');
    const ceoId = await userId('ceo');
    const expectedRecipients = await dataSource.getRepository(User).count({
      where: {
        role: In([...EXEC_ROLES]),
        isActive: true,
        id: Not(ceoId),
      },
    });
    const broadcast = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ toDept: 'ALL_MANAGERS', subject: 'اعلان عمومی', body: 'متن' });
    expect(broadcast.status).toBe(201);
    expect(broadcast.body.data.deliveredCount).toBe(expectedRecipients);

    const support = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ toDept: 'SUPPORT', subject: 'به پشتیبانی', body: 'متن' });
    expect(support.status).toBe(201);
    const activeSiteAdmins = await dataSource.getRepository(User).countBy({
      role: 'SITE_ADMIN',
      isActive: true,
    });
    expect(support.body.data.deliveredCount).toBe(activeSiteAdmins);
    expect(support.body.data.warning).toBeUndefined();
  });

  it('GET /manager-messages/sent returns only the caller’s messages', async () => {
    const ceo = await loginAs(app, 'ceo');
    await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({ toDept: 'COMMERCIAL', subject: 'مال من', body: 'متن' });

    const finance = await loginAs(app, 'finance');
    const sent = await request(app.getHttpServer())
      .get('/manager-messages/sent')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(sent.status).toBe(200);
    expect(
      (sent.body.data as { subject: string }[]).every(
        (m) => m.subject !== 'مال من',
      ),
    ).toBe(true);
  });

  it('supports an IT -> finance -> IT internal reply loop and retains history after closure', async () => {
    const it = await loginAs(app, 'itadmin');
    const finance = await loginAs(app, 'finance');
    const itId = await userId('itadmin');
    const financeId = await userId('finance');

    const sent = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        toDept: 'FINANCE',
        subject: 'هماهنگی مالی دوطرفه',
        body: 'پیام مدیر فناوری اطلاعات',
      });
    expect(sent.status).toBe(201);

    const incoming = await dataSource
      .getRepository(CartableTask)
      .findOneByOrFail({
        sourceType: 'MANAGER_MESSAGE',
        sourceId: sent.body.data.message.id,
        assigneeId: financeId,
      });

    const reply = await request(app.getHttpServer())
      .post(`/cartable/${incoming.id}/replies`)
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({ body: 'پاسخ مدیر مالی به مدیر فناوری اطلاعات' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.assigneeId).toBe(itId);
    expect(reply.body.data.senderId).toBe(financeId);
    expect(reply.body.data.status).toBe('OPEN');
    expect(reply.body.data.conversationId).toBeTruthy();

    const originalAfterReply = await dataSource
      .getRepository(CartableTask)
      .findOneByOrFail({ id: incoming.id });
    expect(originalAfterReply.status).toBe('APPROVED');
    expect(originalAfterReply.conversationId).toBe(
      reply.body.data.conversationId,
    );

    const itDetail = await request(app.getHttpServer())
      .get(`/cartable/${reply.body.data.id}`)
      .set('Authorization', `Bearer ${it.accessToken}`);
    expect(itDetail.status).toBe(200);
    expect(
      itDetail.body.data.history.map(
        (entry: { detail: string }) => entry.detail,
      ),
    ).toEqual(
      expect.arrayContaining([
        'پیام مدیر فناوری اطلاعات',
        'پاسخ مدیر مالی به مدیر فناوری اطلاعات',
      ]),
    );

    const closed = await request(app.getHttpServer())
      .patch(`/cartable/${reply.body.data.id}/close`)
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send();
    expect(closed.status).toBe(200);

    const historyAfterClose = await request(app.getHttpServer())
      .get(`/cartable/${reply.body.data.id}`)
      .set('Authorization', `Bearer ${it.accessToken}`);
    expect(historyAfterClose.status).toBe(200);
    expect(historyAfterClose.body.data.status).toBe('APPROVED');
    expect(historyAfterClose.body.data.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detail: 'پیام مدیر فناوری اطلاعات' }),
        expect.objectContaining({
          detail: 'پاسخ مدیر مالی به مدیر فناوری اطلاعات',
        }),
      ]),
    );
  });

  it('archives an internal conversation after four days without activity', async () => {
    const it = await loginAs(app, 'itadmin');
    const finance = await loginAs(app, 'finance');
    const financeId = await userId('finance');

    const message = await request(app.getHttpServer())
      .post('/cartable/direct-message')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        toId: financeId,
        subject: 'گفتگوی بدون فعالیت',
        body: 'این گفتگو باید پس از چهار روز بایگانی شود',
      });
    expect(message.status).toBe(201);

    const staleAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await dataSource
      .getRepository(CartableTask)
      .update(
        { conversationId: message.body.data.conversationId },
        { createdAt: staleAt },
      );

    const list = await request(app.getHttpServer())
      .get('/cartable?status=APPROVED')
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: message.body.data.id,
          status: 'APPROVED',
          resolutionNote: 'بسته‌شدن خودکار پس از ۴ روز عدم فعالیت',
        }),
      ]),
    );
  });

  it('lets every staff role address another staff member directly but rejects external accounts', async () => {
    const finance = await loginAs(app, 'finance');
    const employeeId = await userId('sales.moradi');
    const customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ role: 'USER' });

    const delivered = await request(app.getHttpServer())
      .post('/cartable/direct-message')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({
        toId: employeeId,
        subject: 'پیام مستقیم به کارمند',
        body: 'متن پیام مستقیم',
      });
    expect(delivered.status).toBe(201);
    expect(delivered.body.data.assigneeId).toBe(employeeId);

    const external = await request(app.getHttpServer())
      .post('/cartable/direct-message')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({
        toId: customer.id,
        subject: 'نباید ارسال شود',
        body: 'متن',
      });
    expect(external.status).toBe(400);
  });

  it('allows the IT manager to load the complete internal staff recipient directory', async () => {
    const it = await loginAs(app, 'itadmin');
    const res = await request(app.getHttpServer())
      .get('/staff-directory')
      .set('Authorization', `Bearer ${it.accessToken}`);
    expect(res.status).toBe(200);
    const roles = (res.body.data as { role: string }[]).map((row) => row.role);
    expect(roles).toContain('FINANCE_MANAGER');
    expect(roles).toContain('EMPLOYEE');
    expect(roles).not.toContain('USER');
    expect(roles).not.toContain('AGENCY');
  });

  // ── Staff directory & agency-request wiring ─────────────────────────

  it('staff-directory lists active staff (no customers/agencies, not the caller)', async () => {
    const { accessToken } = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .get('/staff-directory')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as { id: string; role: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.role !== 'USER' && r.role !== 'AGENCY')).toBe(
      true,
    );
    const ceoId = await userId('ceo');
    expect(rows.every((r) => r.id !== ceoId)).toBe(true);
  });

  it('referring an agency membership request creates a cartable task for the referred-to manager', async () => {
    const financeId = await userId('finance');
    const agencyMembershipRequestRepo = dataSource.getRepository(
      AgencyMembershipRequest,
    );
    const reqRow = await agencyMembershipRequestRepo.save(
      agencyMembershipRequestRepo.create({
        applicantName: `متقاضی کارتابل ${crypto.randomUUID().slice(0, 6)}`,
        managerName: 'م',
        licenseNo: `AG-CT-${crypto.randomUUID().slice(0, 8)}`,
        city: 'تهران',
        phone: `+9893${crypto.randomUUID().replace(/\D/g, '').slice(0, 8)}`,
        email: `${crypto.randomUUID().slice(0, 8)}@x.example`,
        status: 'PENDING',
      }),
    );

    const senior = await loginAs(app, 'senior');
    const refer = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/refer`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ referredToId: financeId, note: 'بررسی اعتباری شود' });
    expect(refer.status).toBe(200);

    const task = await dataSource.getRepository(CartableTask).findOneBy({
      sourceType: 'AGENCY_REQUEST',
      sourceId: reqRow.id,
      assigneeId: financeId,
    });
    expect(task).not.toBeNull();
    expect(task!.category).toBe('AGENCY');
  });

  it('referring an agency membership request also notifies the referred-to manager', async () => {
    const commId = await userId('comm');
    const agencyMembershipRequestRepo = dataSource.getRepository(
      AgencyMembershipRequest,
    );
    const reqRow = await agencyMembershipRequestRepo.save(
      agencyMembershipRequestRepo.create({
        applicantName: `متقاضی اعلان ${crypto.randomUUID().slice(0, 6)}`,
        managerName: 'م',
        licenseNo: `AG-NT-${crypto.randomUUID().slice(0, 8)}`,
        city: 'تهران',
        phone: `+9893${crypto.randomUUID().replace(/\D/g, '').slice(0, 8)}`,
        email: `${crypto.randomUUID().slice(0, 8)}@x.example`,
        status: 'PENDING',
      }),
    );

    const senior = await loginAs(app, 'senior');
    const refer = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/refer`)
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({ referredToId: commId, note: 'بررسی شود' });
    expect(refer.status).toBe(200);

    const notification = await dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.recipientId = :id', { id: commId })
      .andWhere("n.action = 'REFERRED'")
      .andWhere('n.entityId = :entityId', { entityId: reqRow.id })
      .getOne();
    expect(notification).not.toBeNull();
  });

  it('a finance-approve racing a reject after commercial approval: exactly one wins, never both (no lost update)', async () => {
    // PENDING/REFERRED are both "decidable", so e.g. refer-then-reject can
    // legitimately both succeed in sequence — that's intentional, not a
    // race bug. The one genuinely mutually-exclusive pair is the terminal
    // finance-approval stage (→ APPROVED, creates a real Agency User) vs.
    // reject (→ REJECTED): at most one of those two may ever win.
    const agencyMembershipRequestRepo = dataSource.getRepository(
      AgencyMembershipRequest,
    );
    const phone = `+9893${crypto.randomUUID().replace(/\D/g, '').slice(0, 8)}`;
    const reqRow = await agencyMembershipRequestRepo.save(
      agencyMembershipRequestRepo.create({
        applicantName: `متقاضی همزمان ${crypto.randomUUID().slice(0, 6)}`,
        managerName: 'م',
        licenseNo: `AG-CC-${crypto.randomUUID().slice(0, 8)}`,
        city: 'تهران',
        phone,
        email: `${crypto.randomUUID().slice(0, 8)}@x.example`,
        status: 'PENDING',
      }),
    );

    const commercial = await loginAs(app, 'comm');
    const commApprove = await request(app.getHttpServer())
      .patch(`/agencies/requests/${reqRow.id}/approve`)
      .set('Authorization', `Bearer ${commercial.accessToken}`);
    expect(commApprove.status).toBe(200);

    const finance = await loginAs(app, 'finance');
    const senior = await loginAs(app, 'senior');
    const [financeApprove, rejectRes] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/agencies/requests/${reqRow.id}/approve`)
        .set('Authorization', `Bearer ${finance.accessToken}`),
      request(app.getHttpServer())
        .patch(`/agencies/requests/${reqRow.id}/reject`)
        .set('Authorization', `Bearer ${senior.accessToken}`)
        .send({ reviewNote: 'رد همزمان' }),
    ]);
    const statuses = [financeApprove.status, rejectRes.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalRequest = await agencyMembershipRequestRepo
      .createQueryBuilder('r')
      .where('r.id = :id', { id: reqRow.id })
      .getOneOrFail();
    const agencyUser = await dataSource
      .getRepository(User)
      .findOneBy({ phone });

    if (financeApprove.status === 200) {
      expect(finalRequest.status).toBe('APPROVED');
      expect(agencyUser).not.toBeNull();
      expect(agencyUser!.role).toBe('AGENCY');
    } else {
      expect(finalRequest.status).toBe('REJECTED');
      expect(agencyUser).toBeNull();
    }
  });
});
