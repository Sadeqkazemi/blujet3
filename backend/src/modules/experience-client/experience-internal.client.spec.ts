import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ExperienceInternalClient } from './experience-internal.client';

describe('ExperienceInternalClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.EXPERIENCE_INTEGRATION_ENABLED = 'true';
    process.env.EXPERIENCE_SERVICE_URL = 'http://experience.test';
    process.env.EXPERIENCE_INTERNAL_TOKEN = 'x'.repeat(32);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.EXPERIENCE_INTEGRATION_ENABLED;
    delete process.env.EXPERIENCE_SERVICE_URL;
    delete process.env.EXPERIENCE_INTERNAL_TOKEN;
  });

  it('submits contact data through the internal contract', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'id',
          name: 'نام',
          phone: '09121234567',
          subject: 'موضوع',
          body: 'پیام',
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      }),
    });
    const result = await new ExperienceInternalClient().submitContact({
      name: 'نام',
      phone: '09121234567',
      subject: 'موضوع',
      body: 'پیام',
    });
    expect(result.createdAt).toEqual(new Date('2026-09-02T00:00:00.000Z'));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://experience.test/internal/v1/contact',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps an unavailable service to a stable 503', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      new ExperienceInternalClient().listRecentContact(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('serializes the actor and revives blog date fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'post-id',
          slug: 'post',
          title: 'مقاله',
          category: 'GUIDE',
          categoryLabelFa: 'راهنمای سفر',
          authorName: 'مدیر',
          viewCount: 0,
          coverFileId: null,
          publishedAt: '2026-09-02T00:00:00.000Z',
          scheduledAt: null,
        },
      }),
    });
    const result = await new ExperienceInternalClient().createBlogPost(
      {
        id: '784bc95e-7679-4a29-8b4a-3c7413c09cf2',
        role: 'SITE_ADMIN',
        fullName: 'مدیر',
      },
      { title: 'مقاله', body: 'متن', category: 'GUIDE' },
    );
    expect(result.publishedAt).toEqual(new Date('2026-09-02T00:00:00.000Z'));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://experience.test/internal/v1/blog/admin/posts',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('preserves an expected remote not-found response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({
        code: 'NOT_FOUND',
        message: 'مقاله یافت نشد.',
      }),
    });
    await expect(
      new ExperienceInternalClient().getPublicBlogPost('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
