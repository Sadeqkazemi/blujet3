import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { loginAs, loginAsCustomer } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

/** Phase 20: تماس با ما + پشتیبانی — real ContactMessage inbox and a
 * SITE_ADMIN-gated SupportTicket workflow (submit/list/detail/forward/
 * status). See docs/API.md's Phase 20 section for scope/deferrals. */
describe('Phase 20 — contact + support tickets (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /contact', () => {
    it('accepts a public contact message with no login', async () => {
      const res = await request(app.getHttpServer()).post('/contact').send({
        name: 'نگار رضایی',
        phone: '09121234567',
        subject: 'مشکل در پرداخت',
        body: 'سلام، مشکلی در پرداخت داشتم.',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
    });

    it('400s when a required field is missing', async () => {
      const res = await request(app.getHttpServer()).post('/contact').send({
        name: 'نگار رضایی',
        phone: '09121234567',
        body: 'بدون موضوع',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /contact', () => {
    it('401s without login', async () => {
      const res = await request(app.getHttpServer()).get('/contact');
      expect(res.status).toBe(401);
    });

    it('lists recent messages for SITE_ADMIN', async () => {
      await request(app.getHttpServer()).post('/contact').send({
        name: 'آرش کریمی',
        phone: '09121110000',
        subject: 'سوال دربارهٔ استرداد',
        body: 'چطور می‌توانم بلیطم را استرداد کنم؟',
      });
      const { accessToken } = await loginAs(app, 'site.admin');

      const res = await request(app.getHttpServer())
        .get('/contact')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].subject).toBeTruthy();
    });

    it('403s for a non-SITE_ADMIN staff role', async () => {
      const { accessToken } = await loginAs(app, 'finance');
      const res = await request(app.getHttpServer())
        .get('/contact')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /support-tickets', () => {
    it('accepts a public ticket with no login and returns a tracking code', async () => {
      const res = await request(app.getHttpServer())
        .post('/support-tickets')
        .send({
          requesterName: 'سارا محمدی',
          requesterPhone: '09121234567',
          subject: 'مشکل در پرداخت',
          body: 'وجه کسر شد ولی بلیط صادر نشد.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trackingCode).toMatch(/^TK[0-9A-F]{8}$/);
    });
  });

  describe('GET /my/support-tickets (USER account)', () => {
    it('401s without login', async () => {
      const res = await request(app.getHttpServer()).get('/my/support-tickets');
      expect(res.status).toBe(401);
    });

    it('lists tickets linked by userId and by matching phone', async () => {
      const phone = '09120000001';
      await request(app.getHttpServer()).post('/support-tickets').send({
        requesterName: 'نگار رضایی',
        requesterPhone: phone,
        subject: 'سوال قبل از ورود',
        body: 'این تیکت با شمارهٔ تلفن ثبت شده.',
      });

      const { accessToken } = await loginAsCustomer(app, phone);

      const submitRes = await request(app.getHttpServer())
        .post('/my/support-tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          requesterName: 'نگار رضایی',
          requesterPhone: phone,
          subject: 'سوال بعد از ورود',
          body: 'این تیکت از پنل کاربر ثبت شده.',
        });
      expect(submitRes.status).toBe(201);

      const listRes = await request(app.getHttpServer())
        .get('/my/support-tickets')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
      const subjects = listRes.body.data.map(
        (t: { subject: string }) => t.subject,
      );
      expect(subjects).toContain('سوال قبل از ورود');
      expect(subjects).toContain('سوال بعد از ورود');
    });

    it('uploads an owned attachment and returns it with the customer ticket', async () => {
      const phone = '09120000103';
      const { accessToken } = await loginAsCustomer(app, phone);
      const upload = await request(app.getHttpServer())
        .post('/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('test-image'), {
          filename: 'payment.png',
          contentType: 'image/png',
        });
      expect(upload.status).toBe(201);

      const submit = await request(app.getHttpServer())
        .post('/my/support-tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          requesterName: 'کاربر پیوست',
          requesterPhone: phone,
          subject: 'خطای پرداخت',
          body: 'تصویر خطا پیوست شده است.',
          attachmentIds: [upload.body.data.id],
        });
      expect(submit.status).toBe(201);

      const detail = await request(app.getHttpServer())
        .get(`/my/support-tickets/${submit.body.data.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.attachments).toEqual([
        expect.objectContaining({
          id: upload.body.data.id,
          fileName: 'payment.png',
        }),
      ]);
    });

    it('404s when requesting another user ticket by id', async () => {
      const other = await request(app.getHttpServer())
        .post('/support-tickets')
        .send({
          requesterName: 'دیگری',
          requesterPhone: '09129999999',
          subject: 'خصوصی',
          body: 'نباید دیده شود.',
        });
      const id = other.body.data.id as string;

      // Not 09120000002 — that phone is claimed by src/database/seed.ts's AGENCY
      // fixture ("آژانس blujet"), and this route is USER-only (@Roles('USER')).
      const { accessToken } = await loginAsCustomer(app, '09120000102');
      const res = await request(app.getHttpServer())
        .get(`/my/support-tickets/${id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('SITE_ADMIN ticket review workflow', () => {
    async function submitTicket() {
      const res = await request(app.getHttpServer())
        .post('/support-tickets')
        .send({
          requesterName: 'حسین رضوی',
          requesterPhone: '09121230000',
          subject: 'بار و چک‌این',
          body: 'میزان بار مجاز من چقدر است؟',
        });
      return res.body.data.id as string;
    }

    it('401s the list endpoint without login', async () => {
      const res = await request(app.getHttpServer()).get('/support-tickets');
      expect(res.status).toBe(401);
    });

    it('allows FINANCE_MANAGER to list support tickets from its cartable', async () => {
      const { accessToken } = await loginAs(app, 'finance');
      const res = await request(app.getHttpServer())
        .get('/support-tickets')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('SITE_ADMIN lists, views detail, forwards, and changes status', async () => {
      const id = await submitTicket();
      const { accessToken } = await loginAs(app, 'site.admin');

      const list = await request(app.getHttpServer())
        .get('/support-tickets')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.some((t: { id: string }) => t.id === id)).toBe(
        true,
      );

      const detail = await request(app.getHttpServer())
        .get(`/support-tickets/${id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.status).toBe('OPEN');
      expect(detail.body.data.trackingCode).toBeTruthy();

      const targets = await request(app.getHttpServer())
        .get('/support-tickets/forward-targets')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(targets.status).toBe(200);
      const finance = targets.body.data.find(
        (t: { fullName: string }) => t.fullName,
      );
      expect(finance).toBeTruthy();

      const forward = await request(app.getHttpServer())
        .patch(`/support-tickets/${id}/forward`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetUserId: finance.id });
      expect(forward.status).toBe(200);
      expect(forward.body.data.status).toBe('IN_PROGRESS');
      expect(forward.body.data.forwardedTo.id).toBe(finance.id);

      const status = await request(app.getHttpServer())
        .patch(`/support-tickets/${id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'CLOSED' });
      expect(status.status).toBe(200);
      expect(status.body.data.status).toBe('CLOSED');
    });

    it('400s a forward to an invalid target', async () => {
      const id = await submitTicket();
      const { accessToken } = await loginAs(app, 'site.admin');

      const res = await request(app.getHttpServer())
        .patch(`/support-tickets/${id}/forward`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetUserId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(400);
    });

    it('404s detail for a nonexistent ticket', async () => {
      const { accessToken } = await loginAs(app, 'site.admin');
      const res = await request(app.getHttpServer())
        .get('/support-tickets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });
  });
});
