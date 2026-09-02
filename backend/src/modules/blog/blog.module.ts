import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogAdminController } from './blog-admin.controller';
import { BlogPublicController } from './blog-public.controller';
import { BlogService } from './blog.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import { BlogPost } from '../../database/entities/blog-post.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlogPost, StoredFile]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [BlogAdminController, BlogPublicController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
