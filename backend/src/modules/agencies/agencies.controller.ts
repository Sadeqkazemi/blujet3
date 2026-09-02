import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgenciesService } from './agencies.service';
import { ListAgenciesQueryDto } from './dto/list-agencies-query.dto';
import { UpdateCreditDto } from './dto/update-credit.dto';
import { SuspendAgencyDto } from './dto/suspend-agency.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ReferRequestDto } from './dto/refer-request.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { DecideCreditRequestDto } from './dto/decide-credit-request.dto';
import { DecideWebserviceRequestDto } from './dto/decide-webservice-request.dto';
import { DecideDocumentDto } from './dto/decide-document.dto';
import { ListAggregateInvoicesQueryDto } from './dto/list-aggregate-invoices-query.dto';
import { DecideSeatRequestDto } from './dto/decide-seat-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { AgencyMembershipStatus } from '../../database/enums';

const AGENCY_TAB_ROLES = [
  'SENIOR_MANAGER',
  'FINANCE_MANAGER',
  'COMMERCIAL_MANAGER',
] as const;

@ApiTags('agencies')
@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles(...AGENCY_TAB_ROLES)
export class AgenciesController {
  constructor(private readonly agencies: AgenciesService) {}

  // NOTE: literal-segment routes ('requests', 'debtors/...') are declared
  // before ':id' so Nest/Express doesn't match them as an :id param first.

  @Get()
  @Roles('SITE_ADMIN', 'EMPLOYEE', ...AGENCY_TAB_ROLES)
  // ag_settle/fn_invoices act on a specific agency (settle/pay/remind
  // below), which is only reachable by first loading this list — an
  // EMPLOYEE holding only one of those two keys would otherwise have a
  // granted-but-unreachable permission.
  @RequiresPermission(
    'ag_list',
    'ag_partners',
    'ag_debtors',
    'ag_info',
    'ag_settle',
    'fn_invoices',
  )
  @ApiOperation({ summary: 'لیست آژانس‌ها + کارت‌های KPI' })
  async list(@Query() query: ListAgenciesQueryDto) {
    const data = await this.agencies.list(query);
    return { success: true, data };
  }

  @Get('requests')
  @Roles('SITE_ADMIN', 'EMPLOYEE', ...AGENCY_TAB_ROLES)
  @RequiresPermission('ag_requests')
  @ApiOperation({ summary: 'لیست درخواست‌های عضویت آژانس' })
  async listRequests(@Query('status') status?: AgencyMembershipStatus) {
    const data = await this.agencies.listRequests(status);
    return { success: true, data };
  }

  @Get('requests/:id')
  @Roles('SITE_ADMIN', 'EMPLOYEE', ...AGENCY_TAB_ROLES)
  @RequiresPermission('ag_requests')
  @ApiOperation({ summary: 'جزئیات درخواست عضویت + تاریخچه ارجاع' })
  async getRequest(@Param('id') id: string) {
    const data = await this.agencies.getRequest(id);
    return { success: true, data };
  }

  @Get('webservice-requests')
  @Roles('SITE_ADMIN', 'COMMERCIAL_MANAGER', 'SENIOR_MANAGER')
  @ApiOperation({
    summary:
      'صف درخواست‌های خرید وب‌سرویس همه آژانس‌ها (تب «درخواست وب‌سرویس» پنل ادمین سایت)',
  })
  async listAllWebserviceRequests(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const data = await this.agencies.listAllWebserviceRequests(status);
    return { success: true, data };
  }

  @Patch('requests/:id/approve')
  @Roles('COMMERCIAL_MANAGER', 'FINANCE_MANAGER')
  @ApiOperation({
    summary:
      'تأیید دومرحله‌ای درخواست: مدیر بازرگانی سپس مدیر مالی؛ ایجاد حساب فقط در مرحله مالی',
  })
  async approveRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.agencies.approveRequest(actor, id);
    return { success: true, data };
  }

  @Patch('requests/:id/reject')
  @Roles('SITE_ADMIN', ...AGENCY_TAB_ROLES)
  @ApiOperation({ summary: 'رد درخواست عضویت' })
  async rejectRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
  ) {
    const data = await this.agencies.rejectRequest(actor, id, dto.reviewNote);
    return { success: true, data };
  }

  @Patch('requests/:id/refer')
  @Roles('SITE_ADMIN', 'SENIOR_MANAGER', 'COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'ارجاع درخواست — ادمین سایت یا مدیر ارشد/بازرگانی' })
  async referRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReferRequestDto,
  ) {
    const data = await this.agencies.referRequest(
      actor,
      id,
      dto.referredToId,
      dto.note,
    );
    return { success: true, data };
  }

  @Post('debtors/notify-all')
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'ارسال اعلان به همه آژانس‌های بدهکار' })
  async notifyAllDebtors(@CurrentUser() actor: AuthenticatedUser) {
    const data = await this.agencies.notifyAllDebtors(actor);
    return { success: true, data };
  }

  @Get('invoices')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_invoices')
  @ApiOperation({
    summary:
      'فهرست تجمیعی فاکتورهای همه آژانس‌ها. ?status=UNPAID شامل OVERDUE داخلی است و OVERDUE هرگز VOIDED نیست.',
  })
  async listAggregateInvoices(@Query() query: ListAggregateInvoicesQueryDto) {
    const data = await this.agencies.listAggregateInvoices(query.status);
    return { success: true, data };
  }

  @Get('seat-requests')
  @Roles('COMMERCIAL_MANAGER', 'FINANCE_MANAGER')
  @ApiOperation({
    summary:
      'صف درخواست‌های خرید صندلی همه آژانس‌ها (خواندن؛ تصمیم فقط بازرگانی)',
  })
  async listSeatRequests() {
    const data = await this.agencies.listSeatRequests();
    return { success: true, data };
  }

  @Patch('seat-requests/:id/decide')
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({
    summary: 'تأیید (صدور یک فاکتور واقعی) یا رد درخواست خرید صندلی',
  })
  async decideSeatRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideSeatRequestDto,
  ) {
    const data = await this.agencies.decideSeatRequest(actor, id, dto);
    return { success: true, data };
  }

  @Get(':id')
  @Roles('SITE_ADMIN', 'EMPLOYEE', ...AGENCY_TAB_ROLES)
  // Same reachability reasoning as the list endpoint above.
  @RequiresPermission('ag_info', 'ag_settle', 'fn_invoices')
  @ApiOperation({
    summary: 'جزئیات آژانس — پروفایل، اعتبار، آمار، فعالیت اخیر',
  })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.agencies.detail(actor, id);
    return { success: true, data };
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'تعلیق آژانس' })
  async suspend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendAgencyDto,
  ) {
    const data = await this.agencies.suspend(actor, id, dto.reason);
    return { success: true, data };
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'رفع تعلیق آژانس' })
  async reactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.agencies.reactivate(actor, id);
    return { success: true, data };
  }

  @Get(':id/credit')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cr_view')
  @ApiOperation({ summary: 'سقف/مصرف/باقیمانده اعتبار (مصرف همیشه مشتق‌شده)' })
  async getCredit(@Param('id') id: string) {
    const data = await this.agencies.getCredit(id);
    return { success: true, data };
  }

  @Patch(':id/credit')
  @Roles('SENIOR_MANAGER', 'FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cr_manage')
  @ApiOperation({ summary: 'تغییر سقف اعتبار' })
  async updateCredit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCreditDto,
  ) {
    const data = await this.agencies.updateCredit(actor, id, dto.limitIrr);
    return { success: true, data };
  }

  @Post(':id/settle')
  @Roles('SENIOR_MANAGER', 'FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('ag_settle')
  @ApiOperation({ summary: 'ثبت تسویه دستی — غیرفعال برای مدیر بازرگانی' })
  async settle(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.agencies.settle(actor, id);
    return { success: true, data };
  }

  @Get(':id/api-key')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'لیست کلیدهای API — فقط مدیر ارشد' })
  async listApiKeys(@Param('id') id: string) {
    const data = await this.agencies.listApiKeys(id);
    return { success: true, data };
  }

  @Post(':id/api-key')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'صدور کلید API — فقط مدیر ارشد' })
  async issueApiKey(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    const data = await this.agencies.issueApiKey(
      actor,
      id,
      dto.scope,
      dto.stepUpChallengeId,
      dto.stepUpCode,
      {
        environment: dto.environment,
        flightDomain: dto.flightDomain,
        capabilities: dto.capabilities,
        ipWhitelist: dto.ipWhitelist,
        rateLimitPerMinute: dto.rateLimitPerMinute,
        expiresAt: dto.expiresAt,
      },
    );
    return { success: true, data };
  }

  @Patch(':id/api-key/:keyId')
  @Roles('SENIOR_MANAGER')
  @ApiOperation({ summary: 'تعلیق/فعال‌سازی/صدور مجدد کلید API' })
  async updateApiKey(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('keyId') keyId: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    const data = await this.agencies.updateApiKey(actor, id, keyId, dto);
    return { success: true, data };
  }

  @Get(':id/invoices')
  @Roles('EMPLOYEE', ...AGENCY_TAB_ROLES)
  @RequiresPermission('fn_invoices')
  @ApiOperation({ summary: 'لیست فاکتورها — همه ۳ نقش (خواندنی)' })
  async listInvoices(@Param('id') id: string) {
    const data = await this.agencies.listInvoices(id);
    return { success: true, data };
  }

  @Post(':id/invoices')
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'صدور فاکتور — فقط مدیر بازرگانی' })
  async issueInvoice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: IssueInvoiceDto,
  ) {
    const data = await this.agencies.issueInvoice(actor, id, dto);
    return { success: true, data };
  }

  @Post(':id/_test/debt')
  @ApiOperation({
    summary:
      'E2E only — بدهی مشتق‌شده آژانس را به رقم ثابت برمی‌گرداند؛ در production 404',
  })
  async resetTestDebt(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.agencies.resetTestDebt(actor, id);
    return { success: true, data };
  }

  @Patch(':id/invoices/:invoiceId/pay')
  @Roles('FINANCE_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_invoices')
  @ApiOperation({
    summary: 'تسویه فاکتور — ثبت LedgerEntry(SETTLEMENT)، ایدمپوتنت',
  })
  async payInvoice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const data = await this.agencies.payInvoice(actor, id, invoiceId);
    return { success: true, data };
  }

  // FINANCE_MANAGER added in Phase 11 — its مالی tab's «تسویه‌حساب آژانس‌ها»
  // rows carry an «ارسال یادآوری» action in the design.
  @Post(':id/invoices/:invoiceId/remind')
  @Roles('COMMERCIAL_MANAGER', 'FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fn_invoices')
  @ApiOperation({ summary: 'یادآوری فاکتور معوق' })
  async remindInvoice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const data = await this.agencies.remindInvoice(actor, id, invoiceId);
    return { success: true, data };
  }

  @Get(':id/messages')
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'مکاتبه‌ها — فقط مدیر بازرگانی' })
  async listMessages(@Param('id') id: string) {
    const data = await this.agencies.listMessages(id);
    return { success: true, data };
  }

  @Post(':id/messages')
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({ summary: 'ارسال پیام در مکاتبه‌ها — فقط مدیر بازرگانی' })
  async postMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    const data = await this.agencies.postMessage(
      actor,
      id,
      dto.body,
      false,
      dto.attachmentIds,
    );
    return { success: true, data };
  }

  @Get(':id/credit-requests')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cr_view')
  @ApiOperation({ summary: 'لیست درخواست‌های افزایش اعتبار آژانس' })
  async listCreditRequests(@Param('id') id: string) {
    const data = await this.agencies.listCreditRequests(id);
    return { success: true, data };
  }

  @Patch(':id/credit-requests/:reqId/decide')
  @Roles('FINANCE_MANAGER', 'EMPLOYEE')
  @RequiresPermission('cr_manage')
  @ApiOperation({
    summary:
      'تأیید/رد درخواست افزایش اعتبار — تأیید سقف را واقعاً تغییر می‌دهد',
  })
  async decideCreditRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Body() dto: DecideCreditRequestDto,
  ) {
    const data = await this.agencies.decideCreditRequest(
      actor,
      id,
      reqId,
      dto.approve,
    );
    return { success: true, data };
  }

  @Get(':id/webservice-requests')
  @ApiOperation({ summary: 'لیست درخواست‌های خرید وب‌سرویس آژانس' })
  async listWebserviceRequests(@Param('id') id: string) {
    const data = await this.agencies.listWebserviceRequests(id);
    return { success: true, data };
  }

  @Patch(':id/webservice-requests/:reqId/decide')
  @ApiOperation({
    summary:
      'تأیید/رد درخواست وب‌سرویس — تأیید کلید API واقعی صادر می‌کند (نیازمند تأیید دومرحله‌ای)',
  })
  async decideWebserviceRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Body() dto: DecideWebserviceRequestDto,
  ) {
    const data = await this.agencies.decideWebserviceRequest(
      actor,
      id,
      reqId,
      dto.approve,
      dto.stepUpChallengeId,
      dto.stepUpCode,
    );
    return { success: true, data };
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'مدارک آپلودشده آژانس (مجوز/قرارداد) برای بازبینی' })
  async listDocuments(@Param('id') id: string) {
    const data = await this.agencies.listDocuments(id);
    return { success: true, data };
  }

  @Patch(':id/documents/:docId/decide')
  @ApiOperation({ summary: 'تأیید/رد مدرک آپلودشدهٔ آژانس' })
  async decideDocument(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: DecideDocumentDto,
  ) {
    const data = await this.agencies.decideDocument(
      actor,
      id,
      docId,
      dto.approve,
    );
    return { success: true, data };
  }
}
