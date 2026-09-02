import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import { BlogPost } from '../database/entities/blog-post.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import { BlogService } from './blog.service';

describe('BlogService', () => {
  const actor: ActorContextDto = {
    id: '784bc95e-7679-4a29-8b4a-3c7413c09cf2',
    fullName: 'مدیر محتوا',
    role: 'SITE_ADMIN',
    isSuperAdmin: false,
  };

  function setup() {
    const save = jest.fn((value: BlogPost) => Promise.resolve(value));
    const create = jest.fn(
      (value: Partial<BlogPost>) =>
        ({
          ...value,
          id: 'post-id',
          viewCount: 0,
          publishedAt: null,
          scheduledAt: null,
          deletedAt: null,
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        }) as BlogPost,
    );
    const findOne = jest.fn().mockResolvedValue(null);
    const findOneBy = jest.fn().mockResolvedValue(null);
    const blogRepo = {
      create,
      save,
      findOne,
      findOneBy,
    } as unknown as Repository<BlogPost>;
    const fileRepo = {
      findOneBy: jest.fn(),
    } as unknown as Repository<StoredFile>;
    return {
      service: new BlogService(blogRepo, fileRepo),
      create,
      save,
      findOne,
    };
  }

  it('rejects admin commands when the trusted actor lacks SITE_ADMIN access', async () => {
    const { service } = setup();
    await expect(
      service.getAdminPost({ ...actor, role: 'USER' }, 'post-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('persists the author display name as an identity-free snapshot', async () => {
    const { service, create } = setup();
    await service.createPost(actor, {
      title: ' عنوان مقاله ',
      body: 'متن مقاله',
      category: 'GUIDE',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'عنوان مقاله',
        authorId: actor.id,
        authorName: actor.fullName,
        status: 'DRAFT',
      }),
    );
  });

  it('hides draft posts from the public contract', async () => {
    const { service, findOne } = setup();
    findOne.mockResolvedValue({
      id: 'post-id',
      slug: 'draft',
      status: 'DRAFT',
      scheduledAt: null,
      deletedAt: null,
    });
    await expect(service.getPublicPost('draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
