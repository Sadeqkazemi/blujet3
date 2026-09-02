import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as crypto from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { CartableTask } from '../src/database/entities/cartable-task.entity';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

describe('EMPLOYEE cartable (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createEmployeeWithPermissions(permissionKeys: string[]) {
    const it = await loginAs(app, 'itadmin');
    const username = `ect.${crypto.randomUUID().slice(0, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/it/employees')
      .set('Authorization', `Bearer ${it.accessToken}`)
      .send({
        fullName: 'کارمند کارتابل تست',
        username,
        phone: `09${crypto.randomInt(100_000_000, 1_000_000_000)}`,
        password: 'Blujet@1404',
        dept: 'commercial',
        permissionKeys,
      });
    expect(res.status).toBe(201);
    return { username, id: res.body.data.id as string };
  }

  async function seedTaskFor(assigneeId: string) {
    const commercial = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const repo = dataSource.getRepository(CartableTask);
    return repo.save(
      repo.create({
        assigneeId,
        category: 'ADMIN',
        title: 'کار تست کارمند',
        description: 'توضیح کار تست',
        senderId: commercial.id,
        senderLabelFa: 'مدیر بازرگانی',
      }),
    );
  }

  it('sales.moradi nav includes cartable when ct_list+ct_process are granted', async () => {
    const { accessToken } = await loginAs(app, 'sales.moradi');
    const res = await request(app.getHttpServer())
      .get('/panels/nav')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const keys = res.body.data.map((t: { key: string }) => t.key);
    expect(keys).toContain('cartable');
  });

  it("GET /cartable returns only the employee's own tasks with ct_list", async () => {
    const { username, id } = await createEmployeeWithPermissions([
      'ct_list',
      'ct_process',
    ]);
    const other = await createEmployeeWithPermissions(['ct_list']);
    await seedTaskFor(id);
    await seedTaskFor(other.id);

    const { accessToken } = await loginAs(app, username);
    const res = await request(app.getHttpServer())
      .get('/cartable')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
    expect(res.body.data.tasks[0].title).toBe('کار تست کارمند');
    expect(res.body.data.totalOpen).toBe(1);
  });

  it('employee without ct_list gets 403 on GET /cartable', async () => {
    const { username } = await createEmployeeWithPermissions(['ag_list']);
    const { accessToken } = await loginAs(app, username);
    const res = await request(app.getHttpServer())
      .get('/cartable')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it('PATCH approve marks task done; reject stays forbidden for EMPLOYEE', async () => {
    const { username, id } = await createEmployeeWithPermissions([
      'ct_list',
      'ct_process',
    ]);
    const task = await seedTaskFor(id);
    const { accessToken } = await loginAs(app, username);

    const approve = await request(app.getHttpServer())
      .patch(`/cartable/${task.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'انجام شد' });
    expect(approve.status).toBe(200);

    const reject = await request(app.getHttpServer())
      .patch(`/cartable/${crypto.randomUUID()}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'x' });
    expect(reject.status).toBe(403);
  });

  it('POST /cartable/manager-message delivers a cartable task to the manager', async () => {
    const { username } = await createEmployeeWithPermissions([
      'ct_list',
      'ct_process',
    ]);
    const manager = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'comm' });
    const { accessToken } = await loginAs(app, username);

    const send = await request(app.getHttpServer())
      .post('/cartable/manager-message')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ toId: manager.id, body: 'پیام تست کارمند' });
    expect(send.status).toBeGreaterThanOrEqual(200);
    expect(send.status).toBeLessThan(300);

    const mgrCartable = await request(app.getHttpServer())
      .get('/cartable')
      .set(
        'Authorization',
        `Bearer ${(await loginAs(app, 'comm')).accessToken}`,
      );
    expect(
      mgrCartable.body.data.tasks.some((t: { title: string }) =>
        t.title.includes('پیام'),
      ),
    ).toBe(true);

    const sent = await request(app.getHttpServer())
      .get('/cartable/manager-message/sent')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data).toHaveLength(1);
    expect(sent.body.data[0].body).toBe('پیام تست کارمند');
  });

  it('lets an employee reply to a manager in the same retained conversation', async () => {
    const { username, id: employeeId } = await createEmployeeWithPermissions([
      'ct_list',
      'ct_process',
    ]);
    const finance = await loginAs(app, 'finance');
    const financeId = (
      await dataSource
        .getRepository(User)
        .findOneByOrFail({ username: 'finance' })
    ).id;

    const initial = await request(app.getHttpServer())
      .post('/cartable/direct-message')
      .set('Authorization', `Bearer ${finance.accessToken}`)
      .send({
        toId: employeeId,
        subject: 'گفتگوی مدیر و کارمند',
        body: 'پیام مدیر مالی',
      });
    expect(initial.status).toBe(201);

    const employee = await loginAs(app, username);
    const reply = await request(app.getHttpServer())
      .post(`/cartable/${initial.body.data.id}/replies`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ body: 'پاسخ کارمند' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.assigneeId).toBe(financeId);

    const detail = await request(app.getHttpServer())
      .get(`/cartable/${reply.body.data.id}`)
      .set('Authorization', `Bearer ${finance.accessToken}`);
    expect(detail.status).toBe(200);
    expect(
      detail.body.data.history.map((entry: { detail: string }) => entry.detail),
    ).toEqual(expect.arrayContaining(['پیام مدیر مالی', 'پاسخ کارمند']));
  });

  it('GET /panels/employee-context returns dept and permission labels', async () => {
    const { accessToken } = await loginAs(app, 'sales.moradi');
    const res = await request(app.getHttpServer())
      .get('/panels/employee-context')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deptLabelFa).toBeTruthy();
    expect(res.body.data.permissionLabelsFa).toContain('کارتابل');
  });
});
