import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { ActorContextDto } from '../common/actor-context.dto';
import { StoredFile } from '../database/entities/stored-file.entity';
import type { FilePayloadDto } from './dto/file.dto';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR =
  process.env.EXPERIENCE_UPLOAD_DIR ??
  process.env.UPLOAD_DIR ??
  path.join(process.cwd(), 'uploads');

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(StoredFile)
    private readonly fileRepo: Repository<StoredFile>,
  ) {}

  async store(actor: ActorContextDto, file: FilePayloadDto) {
    const buffer = Buffer.from(file.contentBase64, 'base64');
    if (file.sizeBytes > MAX_FILE_BYTES || buffer.length !== file.sizeBytes) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'فایل معتبر نیست یا بیش از ۵ مگابایت است.',
      });
    }
    const extension =
      file.mimeType === 'application/pdf'
        ? '.pdf'
        : file.mimeType === 'image/png'
          ? '.png'
          : '.jpg';
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const diskPath = path.join(UPLOAD_DIR, `${randomUUID()}${extension}`);
    fs.writeFileSync(diskPath, buffer);
    const stored = await this.fileRepo.save(
      this.fileRepo.create({
        ownerId: actor.id,
        fileName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        path: diskPath,
      }),
    );
    return {
      id: stored.id,
      fileName: stored.fileName,
      sizeBytes: stored.sizeBytes,
    };
  }

  async delete(actor: ActorContextDto, id: string) {
    const stored = await this.fileRepo.findOneBy({ id });
    if (!stored) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'فایل یافت نشد.',
      });
    }
    if (stored.ownerId !== actor.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'فقط مالک فایل مجاز به حذف آن است.',
      });
    }
    await this.fileRepo.delete({ id });
    fs.rmSync(stored.path, { force: true });
    return { id };
  }
}
