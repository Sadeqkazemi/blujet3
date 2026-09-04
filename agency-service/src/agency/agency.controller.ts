import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { InternalAuthGuard } from '../common/internal-auth.guard';
import { ErrorResponse } from '../common/error.dto';
import { AgencyService } from './agency.service';
import {
  AgencyParams,
  InvoiceParams,
  InvoiceQuery,
  InvoiceResponse,
  InvoicesResponse,
  ProfileResponse,
  PortalInvoicesResponse,
  PortalProfileResponse,
} from './agency.dto';

// Internal service identity plus trusted tenant assertion, never a public route.
@ApiTags('internal-agency')
@ApiSecurity('internal')
@ApiHeader({ name: 'X-Internal-Token', required: true })
@ApiHeader({ name: 'X-Agency-Id', required: true })
@ApiResponse({ status: 400, type: ErrorResponse, description: 'ورودی نامعتبر' })
@ApiResponse({
  status: 401,
  type: ErrorResponse,
  description: 'هویت سرویس نامعتبر',
})
@ApiResponse({
  status: 403,
  type: ErrorResponse,
  description: 'مالک درخواست مطابقت ندارد',
})
@ApiResponse({
  status: 404,
  type: ErrorResponse,
  description: 'پروفایل یا فاکتور متعلق به مالک یافت نشد',
})
@ApiResponse({
  status: 500,
  type: ErrorResponse,
  description: 'خطای داخلی بدون اطلاعات حساس',
})
@UseGuards(InternalAuthGuard)
@Controller('internal/v1/agencies/:agencyId')
export class AgencyController {
  constructor(private readonly agency: AgencyService) {}

  @Get('portal-profile')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'پروفایل کامل مالک برای سازگاری پرتال؛ فعال‌سازی صریح',
  })
  @ApiResponse({ status: 200, type: PortalProfileResponse })
  @ApiResponse({
    status: 503,
    type: ErrorResponse,
    description: 'مسیر خاموش یا پاسخ خارج از سقف خواندن',
  })
  async portalProfile(
    @Param() params: AgencyParams,
    @Headers('x-agency-id') owner: string | undefined,
  ) {
    return {
      success: true,
      data: await this.agency.portalProfile(params.agencyId, owner),
    };
  }

  @Get('portal-invoices')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'فهرست کامل فاکتورهای مالک برای سازگاری پرتال؛ فعال‌سازی صریح',
  })
  @ApiResponse({ status: 200, type: PortalInvoicesResponse })
  @ApiResponse({
    status: 503,
    type: ErrorResponse,
    description: 'مسیر خاموش یا فهرست خارج از سقف خواندن',
  })
  async portalInvoices(
    @Param() params: AgencyParams,
    @Headers('x-agency-id') owner: string | undefined,
  ) {
    return {
      success: true,
      data: await this.agency.portalInvoices(params.agencyId, owner),
    };
  }

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'نمای محدود پروفایل آژانس خود' })
  @ApiResponse({ status: 200, type: ProfileResponse })
  async profile(
    @Param() params: AgencyParams,
    @Headers('x-agency-id') owner: string | undefined,
  ) {
    return {
      success: true,
      data: await this.agency.profile(params.agencyId, owner),
    };
  }

  @Get('invoices')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'فاکتورهای آژانس خود؛ صفحه‌بندی ۱۰ ردیفی' })
  @ApiResponse({ status: 200, type: InvoicesResponse })
  async invoices(
    @Param() params: AgencyParams,
    @Headers('x-agency-id') owner: string | undefined,
    @Query() query: InvoiceQuery,
  ) {
    return {
      success: true,
      data: await this.agency.invoices(params.agencyId, owner, query.page),
    };
  }

  @Get('invoices/:invoiceId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'نمای فاکتور متعلق به همان آژانس' })
  @ApiResponse({ status: 200, type: InvoiceResponse })
  async invoice(
    @Param() params: InvoiceParams,
    @Headers('x-agency-id') owner: string | undefined,
  ) {
    return {
      success: true,
      data: await this.agency.invoice(params.agencyId, owner, params.invoiceId),
    };
  }
}
