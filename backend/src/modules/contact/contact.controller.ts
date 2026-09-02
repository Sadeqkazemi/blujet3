import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SubmitContactMessageDto } from './dto/contact.dtos';

/** تماس با ما — public inbound inquiry, no login required (see
 * docs/API.md's Phase 20 for why this stays a plain inbox rather than a
 * tracked workflow like SupportTicket). */
@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'ارسال پیام از فرم تماس با ما' })
  async submit(@Body() dto: SubmitContactMessageDto) {
    const data = await this.contact.submit(dto);
    return { success: true, data };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SITE_ADMIN')
  @ApiOperation({ summary: 'فهرست آخرین پیام‌های تماس با ما (برای داشبورد)' })
  async listRecent() {
    const data = await this.contact.listRecent();
    return { success: true, data };
  }
}
