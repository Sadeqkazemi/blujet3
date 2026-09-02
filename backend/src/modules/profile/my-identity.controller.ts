import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdentityVerificationService } from './identity-verification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MAX_FILE_BYTES } from '../files/files.service';

/** Customer KYC — national ID card upload + submit (no selfie, per CLAUDE.md). */
@ApiTags('profile')
@Controller('my/identity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MyIdentityController {
  constructor(private readonly identity: IdentityVerificationService) {}

  @Get()
  @ApiOperation({ summary: 'وضعیت احراز هویت و مراحل تکمیل' })
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.identity.getMine(user);
    return { success: true, data };
  }

  @Post('id-card')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'بارگذاری تصویر کارت ملی (PDF/PNG/JPG)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES + 1024 } }),
  )
  async uploadIdCard(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.identity.uploadIdCard(user, file);
    return { success: true, data };
  }

  @Post('submit')
  @ApiOperation({ summary: 'ثبت و ارسال مدارک برای بررسی' })
  async submit(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.identity.submit(user);
    return { success: true, data };
  }
}
