import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { FilesService, MAX_FILE_BYTES } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { STAFF_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@ApiTags('files')
@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF_ROLES, 'USER', 'AGENCY')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @ApiOperation({ summary: 'آپلود پیوست — فقط PDF/تصویر، حداکثر ۵MB' })
  @ApiConsumes('multipart/form-data')
  // limits.fileSize would make multer throw its own error shape — the size
  // cap is enforced in the service so the envelope/message stay ours.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES + 1024 } }),
  )
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.files.store(actor, file);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'دریافت فایل — مالک یا طرف‌های ارجاع/پیام مربوط' })
  async read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { stored, stream } = await this.files.read(actor, id);
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(stored.fileName)}`,
    );
    stream.pipe(res);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'حذف پیوست — فقط مالک فایل؛ ایمن و idempotent',
  })
  async delete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.files.delete(actor, id);
    return { success: true, data };
  }
}
