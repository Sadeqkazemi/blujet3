import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AgencyPortalService } from './agency-portal.service';
import {
  AgencySeatInquiryDto,
  PostInboxMessageDto,
  RequestCreditIncreaseDto,
  RequestAgencySeatsDto,
  RequestWebserviceDto,
  UploadDocumentDto,
} from './dto/agency-portal.dtos';
import { MAX_FILE_BYTES } from '../files/files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BookingService } from '../booking-engine/booking.service';
import { CreateAllotmentBookingDto } from './dto/create-allotment-booking.dto';

@ApiTags('agency-portal')
@Controller('agency-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AGENCY')
export class AgencyPortalController {
  constructor(
    private readonly portal: AgencyPortalService,
    private readonly bookings: BookingService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'داشبورد خودِ آژانس — KPI + نمودار ۶ماهه + اعتبار' })
  async dashboard(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.dashboard(actor) };
  }

  @Get('credit')
  @ApiOperation({ summary: 'سقف/مصرف/باقیمانده اعتبار خودِ آژانس' })
  async credit(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.credit(actor) };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'گردش حساب اخیر' })
  async ledger(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.ledger(actor) };
  }

  @Get('financial-events')
  @ApiOperation({ summary: 'تایم‌لاین واقعی همه رویدادهای مالی آژانس' })
  async financialEvents(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.financialEvents(actor) };
  }

  @Get('invoices')
  @ApiOperation({ summary: 'فاکتورهای خودِ آژانس' })
  async invoices(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.invoices(actor) };
  }

  @Post('invoices/:invoiceId/pay')
  @ApiOperation({
    summary: 'پرداخت فاکتور از اعتبار — همان مسیر تراکنشی سمت کارمند',
  })
  async payInvoice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return {
      success: true,
      data: await this.portal.payInvoice(actor, invoiceId),
    };
  }

  @Post('credit-requests')
  @ApiOperation({
    summary: 'درخواست افزایش اعتبار — مستقیماً سقف را تغییر نمی‌دهد',
  })
  async requestCreditIncrease(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RequestCreditIncreaseDto,
  ) {
    return {
      success: true,
      data: await this.portal.requestCreditIncrease(actor, dto),
    };
  }

  @Get('credit-requests')
  @ApiOperation({ summary: 'تاریخچه درخواست‌های افزایش اعتبار خودِ آژانس' })
  async myCreditRequests(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.myCreditRequests(actor) };
  }

  @Get('sales')
  @ApiOperation({ summary: 'فروش و گزارش خودِ آژانس' })
  async sales(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.sales(actor) };
  }

  @Get('sales/export')
  @ApiOperation({ summary: 'خروجی CSV فروش آژانس برای Excel' })
  @ApiProduces('text/csv')
  async salesExport(
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csv = await this.portal.salesCsv(actor);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="agency-sales.csv"',
    );
    res.send(csv);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'کارتابل و پیام‌ها — خواندن' })
  async inbox(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.inbox(actor) };
  }

  @Post('inbox')
  @ApiOperation({ summary: 'ارسال پیام در کارتابل' })
  async postInboxMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PostInboxMessageDto,
  ) {
    return {
      success: true,
      data: await this.portal.postInboxMessage(
        actor,
        dto.body,
        dto.attachmentIds,
      ),
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'پروفایل خودِ آژانس' })
  async profile(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.profile(actor) };
  }

  @Get('allotments')
  @ApiOperation({ summary: 'سهمیه‌های صندلی تخصیص‌یافته به خودِ آژانس' })
  async allotments(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.allotments(actor) };
  }

  @Get('seat-request-options')
  @ApiOperation({
    summary: 'مسیرها و پروازهای زمان‌بندی‌شده قابل درخواست توسط آژانس',
  })
  async seatRequestOptions(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.seatRequestOptions(actor) };
  }

  @Post('seat-inquiry')
  @ApiOperation({
    summary: 'استعلام واقعی ظرفیت و تقاضای رزرو پرواز برای آژانس',
  })
  async seatInquiry(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: AgencySeatInquiryDto,
  ) {
    return { success: true, data: await this.portal.seatInquiry(actor, dto) };
  }

  @Get('seat-requests')
  @ApiOperation({ summary: 'تاریخچه درخواست‌های صندلی خودِ آژانس' })
  async mySeatRequests(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.mySeatRequests(actor) };
  }

  @Post('seat-requests')
  @ApiOperation({
    summary: 'ثبت درخواست خرید صندلی و ارجاع واقعی به مدیر بازرگانی',
  })
  async requestSeats(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RequestAgencySeatsDto,
  ) {
    return { success: true, data: await this.portal.requestSeats(actor, dto) };
  }

  @Post('allotments/:allotmentId/bookings')
  @ApiOperation({
    summary: 'فروش قطعی بلیت از سهمیه فعال آژانس و کسر اعتبار',
  })
  async createAllotmentBooking(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allotmentId') allotmentId: string,
    @Body() dto: CreateAllotmentBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    await this.portal.assertAgencyWritable(actor);
    return {
      success: true,
      data: await this.bookings.createAgencyAllotmentBooking(
        actor,
        allotmentId,
        dto,
        idempotencyKey,
      ),
    };
  }

  @Get('documents')
  @ApiOperation({ summary: 'مدارک آپلودشده خودِ آژانس' })
  async documents(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.documents(actor) };
  }

  @Post('documents')
  @ApiOperation({ summary: 'آپلود مدرک — فقط PDF/تصویر، حداکثر ۵MB' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES + 1024 } }),
  )
  async uploadDocument(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return {
      success: true,
      data: await this.portal.uploadDocument(actor, file, dto),
    };
  }

  @Get('webservice-plans')
  @ApiOperation({ summary: 'قیمت‌های فعلی پلن‌های وب‌سرویس (ریال)' })
  async webservicePlans(@CurrentUser() actor: AuthenticatedUser) {
    await this.portal.assertAgency(actor);
    return { success: true, data: await this.portal.webservicePlans() };
  }

  @Post('webservice-requests')
  @ApiOperation({
    summary: 'درخواست خرید وب‌سرویس B2B — مستقیماً کلید صادر نمی‌کند',
  })
  async requestWebservice(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RequestWebserviceDto,
  ) {
    return {
      success: true,
      data: await this.portal.requestWebservice(actor, dto),
    };
  }

  @Get('webservice-requests')
  @ApiOperation({ summary: 'تاریخچه درخواست‌های وب‌سرویس خودِ آژانس' })
  async myWebserviceRequests(@CurrentUser() actor: AuthenticatedUser) {
    return {
      success: true,
      data: await this.portal.myWebserviceRequests(actor),
    };
  }

  @Get('api-keys')
  @ApiOperation({
    summary:
      'کلیدهای API خودِ آژانس — فقط ابرداده؛ کلید خام فقط یک‌بار هنگام تأیید در پیام‌رسان ارسال می‌شود',
  })
  async apiKeys(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.portal.apiKeys(actor) };
  }
}
