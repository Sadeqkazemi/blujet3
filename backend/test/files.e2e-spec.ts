import { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { StoredFile } from '../src/database/entities/stored-file.entity';
import { JobPosting } from '../src/database/entities/job-posting.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { JobType } from '../src/database/enums';
import { loginAs } from './helpers/login.helper';
import { createTestApp } from './helpers/app.helper';

// Smallest valid PNG (1×1 transparent pixel).
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Files (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeEach(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a PNG upload and returns an id; rejects disallowed types and oversize files', async () => {
    const { accessToken } = await loginAs(app, 'senior');

    const ok = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'pixel.png',
        contentType: 'image/png',
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.id).toBeDefined();

    const badType = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('#!/bin/sh'), {
        filename: 'x.sh',
        contentType: 'text/x-shellscript',
      });
    expect(badType.status).toBe(400);
  });

  it('preserves a Persian filename correctly instead of mojibake (multer/busboy decode multipart headers as latin1 by default)', async () => {
    const { accessToken } = await loginAs(app, 'senior');
    const res = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'مدرک-هویتی.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.fileName).toBe('مدرک-هویتی.png');
  });

  it('owner can read; an unrelated exec gets 403; a referral recipient can read an attached file', async () => {
    const senior = await loginAs(app, 'senior');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'doc.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    const own = await request(app.getHttpServer())
      .get(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toContain('image/png');

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .get(`/files/${fileId}`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);

    // Attach it to a referral addressed to Finance — Finance can now read it.
    const finance = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username: 'finance' });
    await request(app.getHttpServer())
      .post('/referrals')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .send({
        title: 'با پیوست',
        body: 'شرح',
        recipientIds: [finance.id],
        attachmentIds: [fileId],
      });

    const financeLogin = await loginAs(app, 'finance');
    const asRecipient = await request(app.getHttpServer())
      .get(`/files/${fileId}`)
      .set('Authorization', `Bearer ${financeLogin.accessToken}`);
    expect(asRecipient.status).toBe(200);
  });

  it('attaching a file you do not own to a referral → 400', async () => {
    const senior = await loginAs(app, 'senior');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'mine.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    // Senior owns the file; CEO cannot attach it to a message.
    const ceo = await loginAs(app, 'ceo');
    const res = await request(app.getHttpServer())
      .post('/manager-messages')
      .set('Authorization', `Bearer ${ceo.accessToken}`)
      .send({
        toDept: 'FINANCE',
        subject: 'س',
        body: 'ب',
        attachmentIds: [fileId],
      });
    expect(res.status).toBe(400);
  });

  // ── DELETE /files/:id (career attachment delete, task #32) ─────────────

  it('owner can delete their own file; it is then gone from disk, the DB, and the read endpoint 404s', async () => {
    const senior = await loginAs(app, 'senior');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'to-delete.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;
    const storedBefore = await dataSource
      .getRepository(StoredFile)
      .findOneByOrFail({ id: fileId });
    expect(fs.existsSync(storedBefore.path)).toBe(true);

    const del = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.id).toBe(fileId);

    expect(fs.existsSync(storedBefore.path)).toBe(false);
    expect(
      await dataSource.getRepository(StoredFile).findOneBy({ id: fileId }),
    ).toBeNull();

    const readAfter = await request(app.getHttpServer())
      .get(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(readAfter.status).toBe(404);

    const auditRow = await dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .where('a.entityType = :t', { t: 'StoredFile' })
      .andWhere('a.entityId = :id', { id: fileId })
      .getOne();
    expect(auditRow).not.toBeNull();
  });

  it('a non-owner cannot delete a file (403); deleting an unknown id 404s; a second delete of the same id 404s (safe, idempotent end-state)', async () => {
    const senior = await loginAs(app, 'senior');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'protected.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    const ceo = await loginAs(app, 'ceo');
    const forbidden = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${ceo.accessToken}`);
    expect(forbidden.status).toBe(403);
    expect(
      await dataSource.getRepository(StoredFile).findOneBy({ id: fileId }),
    ).not.toBeNull();

    const unknown = await request(app.getHttpServer())
      .delete('/files/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(unknown.status).toBe(404);

    const first = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(second.status).toBe(404);
  });

  it('deleting a file already missing from disk (manually removed) still deletes the DB record safely, no crash', async () => {
    const senior = await loginAs(app, 'senior');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${senior.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'vanish.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;
    const stored = await dataSource
      .getRepository(StoredFile)
      .findOneByOrFail({ id: fileId });
    fs.rmSync(stored.path);

    const del = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${senior.accessToken}`);
    expect(del.status).toBe(200);
    expect(
      await dataSource.getRepository(StoredFile).findOneBy({ id: fileId }),
    ).toBeNull();
  });

  it('deleting a job-posting cover image clears JobPosting.imageFileId (ON DELETE SET NULL)', async () => {
    const admin = await loginAs(app, 'site.admin');
    const uploaded = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .attach('file', PNG_BYTES, {
        filename: 'cover.png',
        contentType: 'image/png',
      });
    const fileId = uploaded.body.data.id as string;

    const jobPostingRepo = dataSource.getRepository(JobPosting);
    const posting = await jobPostingRepo.save(
      jobPostingRepo.create({
        title: 'آگهی با تصویر',
        dept: 'IT',
        city: 'تهران',
        type: JobType.FULL_TIME,
        generalReqs: [],
        specialReqs: [],
        active: true,
        imageFileId: fileId,
        updatedAt: new Date(),
      }),
    );

    const del = await request(app.getHttpServer())
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(del.status).toBe(200);

    const updatedPosting = await jobPostingRepo.findOneByOrFail({
      id: posting.id,
    });
    expect(updatedPosting.imageFileId).toBeNull();

    const detail = await request(app.getHttpServer()).get(
      `/careers/jobs/${posting.id}`,
    );
    expect(detail.body.data.imageFileId).toBeNull();
    expect(detail.body.data.imageUrl).toBeNull();

    await jobPostingRepo.delete({ id: posting.id });
  });
});
