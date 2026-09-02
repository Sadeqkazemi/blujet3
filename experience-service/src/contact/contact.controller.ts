import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { SubmitContactMessageDto } from './dto/contact.dto';

@ApiTags('internal-contact')
@ApiSecurity('internal-token')
@Controller('internal/v1/contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'ثبت پیام فرم تماس از درگاه blujet' })
  @ApiResponse({ status: 201, description: 'پیام تماس ثبت شد.' })
  @ApiResponse({ status: 400, description: 'داده ورودی معتبر نیست.' })
  @ApiResponse({ status: 401, description: 'هویت سرویس داخلی معتبر نیست.' })
  async submit(@Body() dto: SubmitContactMessageDto) {
    return { success: true, data: await this.contact.submit(dto) };
  }

  @Get()
  @ApiOperation({ summary: 'فهرست آخرین پیام‌های تماس برای پنل سایت' })
  @ApiResponse({ status: 200, description: 'آخرین پیام‌های تماس.' })
  @ApiResponse({ status: 401, description: 'هویت سرویس داخلی معتبر نیست.' })
  async listRecent() {
    return { success: true, data: await this.contact.listRecent() };
  }
}
