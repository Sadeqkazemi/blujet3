import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPost } from '../database/entities/blog-post.entity';
import { StoredFile } from '../database/entities/stored-file.entity';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [TypeOrmModule.forFeature([BlogPost, StoredFile])],
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
