import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { FlightsService } from './flights.service';
import { FlightDefinitionService } from './flight-definition.service';
import { FlightWorkflowService } from './flight-workflow.service';
import { AircraftService } from './aircraft.service';
import { UpsertAircraftDto } from './dto/aircraft.dto';
import { CommitmentsService } from './commitments.service';
import { CreateCommitmentDto } from './dto/commitment.dto';
import {
  CompleteScheduledFlightDto,
  CreateFlightDefinitionDto,
  UpdateFlightDefinitionDto,
} from './dto/flight-definition.dto';
import {
  OperationsDecisionDto,
  SubmitOperationsDto,
} from './dto/flight-workflow.dto';
import {
  CreateScheduleTemplateDto,
  ListScheduleTemplatesQueryDto,
  ResolveScheduleTemplateQueryDto,
  RouteDistanceSuggestionDto,
  ScheduleTemplatePreviewDto,
} from './dto/schedule-template.dto';
import { PatchCommercialPanelSettingsDto } from './dto/commercial-panel-settings.dto';
import { ScheduleTemplateService } from './schedule-template.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PanelAccessGuard } from '../panels/panel-access.guard';
import { EmployeePermissionGuard } from '../../common/guards/employee-permission.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../common/dto/irr.decorator';
import type { Irr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CabinClass, Role } from '../../database/enums';

class CreateAirportDto {
  @ApiProperty({ description: 'نام شهر', example: 'وان' })
  @IsString()
  cityFa: string;

  @ApiProperty({
    required: false,
    description: 'نام فارسی فرودگاه',
    example: 'فرودگاه بین‌المللی وان',
  })
  @IsOptional()
  @IsString()
  airportNameFa?: string;

  @ApiProperty({ description: 'کد IATA فرودگاه', example: 'VAS' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  code: string;

  @ApiProperty({
    required: false,
    description: 'منطقه زمانی IANA',
    example: 'Asia/Tehran',
  })
  @IsOptional()
  @IsString()
  tz?: string;

  @ApiProperty({
    required: false,
    description: 'True when the airport is outside Iran',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;
}

class CreateScheduleDto {
  @ApiProperty({ description: 'کد فرودگاه مبدأ', example: 'THR' })
  @IsString()
  originCode!: string;

  @ApiProperty({ description: 'کد فرودگاه مقصد', example: 'MHD' })
  @IsString()
  destCode!: string;

  @ApiProperty({ description: 'شماره پرواز', example: 'BJ-410' })
  @Matches(/^[A-Z]{2}-\d{2,4}$/)
  flightNo!: string;

  @ApiProperty({
    description: 'الگوی تکرار RRULE (RFC 5545)',
    example: 'FREQ=WEEKLY;BYDAY=SA,MO,WE',
  })
  @IsString()
  rrule!: string;

  @ApiProperty({ description: 'ساعت حرکت (UTC)', example: '07:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  depTime!: string;

  @ApiProperty({ description: 'ظرفیت هر پرواز', example: 146 })
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  @ApiProperty({
    description: 'چند روز آینده از حالا ساخته شود (پیش‌فرض ۳۰)',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  daysAhead?: number;
}

class CancelFlightDto {
  @ApiProperty({
    description: 'علت کنسلی که در سوابق بازرگانی و مالی نگهداری می‌شود',
    example: 'محدودیت عملیاتی فرودگاه مقصد',
  })
  @IsString()
  @MinLength(3)
  reason!: string;
}

class PlanFlightDto {
  @ApiProperty({
    description: 'نرخ برنامه‌ریزی (ریال)',
    example: '39000000',
    type: String,
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  priceIrr: Irr;

  @ApiProperty({ description: 'تخصیص صندلی آژانس', example: 60 })
  @IsInt()
  @Min(0)
  @Max(1000)
  agencySeats: number;

  @ApiProperty({
    description: 'شروع بازه فروش (UTC ISO) — خالی/حذف یعنی بدون محدودیت',
    required: false,
  })
  @IsOptional()
  @IsISO8601()
  saleStartsAt?: string;

  @ApiProperty({
    description: 'پایان بازه فروش (UTC ISO) — خالی/حذف یعنی بدون محدودیت',
    required: false,
  })
  @IsOptional()
  @IsISO8601()
  saleEndsAt?: string;
}

class ChangeAircraftTypeDto {
  @ApiProperty({ description: 'نوع هواپیمای جدید', example: 'Boeing 737' })
  @IsString()
  aircraftType: string;

  @ApiProperty({
    description: 'از POST /auth/step-up/request (scope: PRICE_CAPACITY_CHANGE)',
  })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  stepUpCode: string;
}

const FARE_RULE_CABIN_CLASSES = Object.values(CabinClass);

class CreateFareRuleDto {
  @ApiProperty({ enum: FARE_RULE_CABIN_CLASSES })
  @IsIn(FARE_RULE_CABIN_CLASSES)
  cabin: CabinClass;

  @ApiProperty({ description: 'کد کلاس نرخی', example: 'Y' })
  @IsString()
  classCode: string;

  @ApiProperty({
    description: 'قیمت (ریال)',
    example: '30000000',
    type: String,
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  priceIrr: Irr;

  @ApiProperty({ description: 'تعداد صندلی تخصیص‌یافته', example: 20 })
  @IsInt()
  @Min(1)
  @Max(1000)
  seatsAllocated: number;

  @ApiProperty({ required: false, description: 'سهم این برنامه برای سایت' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  siteSeats?: number;

  @ApiProperty({
    required: false,
    type: String,
    description: 'نرخ فروش سایت (ریال)',
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  sitePriceIrr?: Irr;

  @ApiProperty({ required: false, description: 'سهم این برنامه برای آژانس‌ها' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  agencySeats?: number;

  @ApiProperty({
    required: false,
    type: String,
    description: 'نرخ فروش آژانس (ریال)',
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  agencyPriceIrr?: Irr;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  agencySpecialOffer?: boolean;

  @ApiProperty({
    description: 'مالیات/عوارض (ریال)',
    required: false,
    example: '0',
    type: String,
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  taxIrr?: Irr;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  changeable?: boolean;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  baggageAllowanceKg?: number;

  @ApiProperty({ required: false, description: 'شروع بازه اعتبار (UTC ISO)' })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiProperty({ required: false, description: 'پایان بازه اعتبار (UTC ISO)' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiProperty({
    required: false,
    description: 'کانال‌های مجاز — خالی یعنی همه کانال‌ها',
    isArray: true,
    enum: ['SYSTEM', 'CHARTER', 'AGENCY'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['SYSTEM', 'CHARTER', 'AGENCY'], { each: true })
  allowedChannels?: ('SYSTEM' | 'CHARTER' | 'AGENCY')[];
}

class UpdateFareRuleDto {
  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  priceIrr?: Irr;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seatsAllocated?: number;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  taxIrr?: Irr;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  changeable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  baggageAllowanceKg?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: ['SYSTEM', 'CHARTER', 'AGENCY'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['SYSTEM', 'CHARTER', 'AGENCY'], { each: true })
  allowedChannels?: ('SYSTEM' | 'CHARTER' | 'AGENCY')[];
}

class UpdateSalesVisibilityDto {
  @ApiProperty({ description: 'نمایش و فروش این پرواز در سایت عمومی' })
  @IsBoolean()
  enabled: boolean;
}

class UpdateFareClassSitePriceDto {
  @ApiProperty({ type: String, example: '38000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  priceIrr: Irr;

  @ApiProperty({
    required: false,
    description: 'تعداد صندلی آزادشده برای فروش سایت',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  seats?: number;

  @ApiProperty({ example: 'افزایش تقاضا در این کلاس' })
  @IsString()
  reason: string;
}

class UpsertAgencyFareReleaseDto {
  @ApiProperty({ description: 'تعداد صندلی آزادشده برای آژانس‌ها' })
  @IsInt()
  @Min(0)
  @Max(1000)
  seats: number;

  @ApiProperty({ type: String, example: '32000000' })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  priceIrr: Irr;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  specialOffer?: boolean;
}

class FareClassPriceSuggestionDto {
  @ApiProperty({ enum: ['SYSTEM', 'AGENCY'] })
  @IsIn(['SYSTEM', 'AGENCY'])
  channel: 'SYSTEM' | 'AGENCY';

  @ApiProperty({
    required: false,
    type: String,
    description:
      'نرخ مشاهده‌شده رقبا (ریال)؛ در صورت خالی بودن از نرخ رقیب ثبت‌شده پرواز استفاده می‌شود',
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  competitorPriceIrr?: Irr;
}

class UpdateFareClassChannelReleaseDto {
  @ApiProperty({ description: 'ظرفیت فروش عمومی سایت' })
  @IsInt()
  @Min(0)
  @Max(1000)
  siteSeats: number;

  @ApiProperty({ type: String, example: '38000000' })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  sitePriceIrr: Irr;

  @ApiProperty({ description: 'ظرفیت فروش آژانسی' })
  @IsInt()
  @Min(0)
  @Max(1000)
  agencySeats: number;

  @ApiProperty({ type: String, example: '32000000' })
  @IsIrrAmount()
  @MinIrrAmount(0n)
  @TransformToIrr()
  agencyPriceIrr: Irr;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  specialOffer?: boolean;

  @ApiProperty({ required: false, description: 'الزامی هنگام تغییر قیمت سایت' })
  @IsOptional()
  @IsString()
  reason?: string;
}

class CreateAllotmentDto {
  @ApiProperty({ description: 'شناسه کاربری آژانس' })
  @IsString()
  agencyId: string;

  @ApiProperty({ description: 'تعداد صندلی تخصیص‌یافته', example: 10 })
  @IsInt()
  @Min(1)
  @Max(1000)
  seatsAllocated: number;

  @ApiProperty({ enum: ['SOFT', 'HARD'], required: false, default: 'HARD' })
  @IsOptional()
  @IsIn(['SOFT', 'HARD'])
  type?: 'SOFT' | 'HARD';

  @ApiProperty({
    required: false,
    description: 'موعد آزادسازی خودکار (فقط برای نوع SOFT، UTC ISO)',
  })
  @IsOptional()
  @IsISO8601()
  releaseAt?: string;

  @ApiProperty({
    required: false,
    description: 'نرخ قراردادی این آژانس (ریال)',
    type: String,
  })
  @IsOptional()
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  contractPriceIrr?: Irr;
}

@ApiTags('flights')
@Controller('flights')
@UseGuards(JwtAuthGuard, RolesGuard, PanelAccessGuard, EmployeePermissionGuard)
@Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER')
export class FlightsController {
  constructor(
    private readonly flights: FlightsService,
    private readonly definitions: FlightDefinitionService,
    private readonly workflow: FlightWorkflowService,
    private readonly scheduleTemplates: ScheduleTemplateService,
    private readonly aircraft: AircraftService,
    private readonly commitments: CommitmentsService,
  ) {}

  // EMPLOYEE: PERMISSION_CATALOG's fl_view for the GET endpoints below;
  // fl_manage (Phase 27) additionally unlocks every write endpoint —
  // create/schedule/ai-analysis/plan/aircraft/fare-rule/allotment.
  @Get('overview')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'fl_active', 'fl_completed')
  @ApiOperation({
    summary: 'کل تب مدیریت پروازها: KPI + فعال/انجام‌شده/آینده',
  })
  async overview() {
    const data = await this.flights.overview();
    return { success: true, data };
  }

  @Get('airports')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'fl_cities')
  @ApiOperation({ summary: 'کاتالوگ فرودگاه‌ها برای فرم افزودن پرواز' })
  async airports() {
    const data = await this.flights.airports();
    return { success: true, data };
  }

  @Post('airports')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_cities')
  @ApiOperation({ summary: 'افزودن شهر/فرودگاه جدید به کاتالوگ' })
  async createAirport(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAirportDto,
  ) {
    const data = await this.flights.createAirport(actor, dto);
    return { success: true, data };
  }

  @Delete('airports/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_cities')
  @ApiOperation({
    summary: 'حذف فرودگاه ثبت‌شده در صورت استفاده‌نشدن در مسیرها',
  })
  async removeAirport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return {
      success: true,
      data: await this.flights.removeAirport(actor, id),
    };
  }

  @Get('aircraft-types')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({ summary: 'کاتالوگ انواع هواپیما برای فرم تغییر نوع هواپیما' })
  async aircraftTypes() {
    const data = await this.flights.aircraftTypes();
    return { success: true, data };
  }

  @Get('aircraft')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({
    summary: 'فهرست تعریف هواپیماها (کد/مدل/وضعیت/ظرفیت/کابین‌ها)',
  })
  async listAircraft() {
    const data = await this.aircraft.list();
    return { success: true, data };
  }

  @Get('aircraft/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({ summary: 'جزئیات تعریف هواپیما شامل کابین‌ها و صندلی‌ها' })
  async aircraftDetail(@Param('id') id: string) {
    const data = await this.aircraft.detail(id);
    return { success: true, data };
  }

  @Post('aircraft')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'ac_manage')
  @ApiOperation({
    summary:
      'افزودن تعریف هواپیما — کابین‌ها و صندلی‌ها از نقشه ردیف/ستون تولید می‌شوند',
  })
  async createAircraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpsertAircraftDto,
  ) {
    const data = await this.aircraft.create(actor, dto);
    return { success: true, data };
  }

  @Put('aircraft/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'ac_manage')
  @ApiOperation({ summary: 'ویرایش تعریف هواپیما' })
  async updateAircraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertAircraftDto,
  ) {
    const data = await this.aircraft.update(actor, id, dto);
    return { success: true, data };
  }

  // ── /flights/aircraft-definitions — canonical aircraft-catalog contract
  // (frontend PR #126). Same AircraftService methods as /flights/aircraft
  // above; both paths stay live so nothing that already calls /flights/
  // aircraft breaks. PATCH accepts the same full UpsertAircraftDto body as
  // PUT (no partial-patch semantics) — documented in docs/API.md.

  @Get('aircraft-definitions')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({
    summary:
      'فهرست تعریف هواپیماها (نام معیار canonical؛ معادل GET /flights/aircraft)',
  })
  async listAircraftDefinitions() {
    const data = await this.aircraft.list();
    return { success: true, data };
  }

  @Post('aircraft-definitions')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'ac_manage')
  @ApiOperation({
    summary:
      'افزودن تعریف هواپیما (نام معیار canonical؛ معادل POST /flights/aircraft)',
  })
  async createAircraftDefinition(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpsertAircraftDto,
  ) {
    const data = await this.aircraft.create(actor, dto);
    return { success: true, data };
  }

  @Get('aircraft-definitions/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({
    summary:
      'جزئیات تعریف هواپیما شامل cabins، totalCapacity و seatMap (نام معیار canonical)',
  })
  async aircraftDefinitionDetail(@Param('id') id: string) {
    const data = await this.aircraft.detail(id);
    return { success: true, data };
  }

  @Put('aircraft-definitions/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'ac_manage')
  @ApiOperation({ summary: 'ویرایش تعریف هواپیما (نام معیار canonical)' })
  async putAircraftDefinition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertAircraftDto,
  ) {
    const data = await this.aircraft.update(actor, id, dto);
    return { success: true, data };
  }

  @Patch('aircraft-definitions/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'ac_manage')
  @ApiOperation({
    summary:
      'ویرایش تعریف هواپیما — همان بدنه کامل UpsertAircraftDto که PUT می‌پذیرد',
  })
  async patchAircraftDefinition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertAircraftDto,
  ) {
    const data = await this.aircraft.update(actor, id, dto);
    return { success: true, data };
  }

  @Get('aircraft-definitions/:id/seat-map')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'ac_view')
  @ApiOperation({
    summary: 'نقشه صندلی (cabinLayout + seats) این تعریف هواپیما',
  })
  async aircraftDefinitionSeatMap(@Param('id') id: string) {
    const data = await this.aircraft.seatMap(id);
    return { success: true, data };
  }

  @Post()
  @Roles(Role.SENIOR_MANAGER, Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('fl_manage', 'fl_add')
  @ApiOperation({
    summary:
      'افزودن تعریف پرواز به‌صورت پیش‌نویس (DRAFT) — سپس submit-operations',
  })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateFlightDefinitionDto,
  ) {
    const data = await this.definitions.createDefinition(actor, dto);
    return { success: true, data };
  }

  @Get('operations-queue')
  @Roles(
    Role.OPERATIONS_MANAGER,
    Role.SENIOR_MANAGER,
    Role.COMMERCIAL_MANAGER,
    Role.EMPLOYEE,
  )
  @RequiresPermission('op_view')
  @ApiOperation({
    summary: 'صف بررسی مدیر عملیات (PENDING_OPERATIONS)',
  })
  async operationsQueue(@Query('status') status?: string) {
    const data = await this.workflow.listOperationsQueue(status);
    return { success: true, data };
  }

  @Get('operations-overview')
  @Roles(
    Role.OPERATIONS_MANAGER,
    Role.SENIOR_MANAGER,
    Role.COMMERCIAL_MANAGER,
    Role.EMPLOYEE,
  )
  @RequiresPermission('op_view')
  @ApiOperation({
    summary: 'داشبورد و فهرست وضعیت‌های گردش کار مدیر عملیات',
  })
  async operationsOverview() {
    const data = await this.workflow.operationsOverview();
    return { success: true, data };
  }

  @Post(':id/submit-operations')
  @HttpCode(200)
  @Roles(Role.SENIOR_MANAGER, Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('fl_manage', 'op_manage')
  @ApiOperation({
    summary: 'ارسال تعریف پرواز به مدیر عملیات (→ PENDING_OPERATIONS)',
  })
  async submitOperations(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitOperationsDto,
  ) {
    const data = await this.workflow.submitOperations(
      actor,
      id,
      dto.expectedVersion,
    );
    return { success: true, data };
  }

  @Put(':id/complete-and-submit')
  @Roles(Role.SENIOR_MANAGER, Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('fl_manage', 'fl_add')
  @ApiOperation({
    summary:
      'تکمیل اتمیک رخداد ساخته‌شده از مسیر پروازی و ارسال به مدیر عملیات',
  })
  async completeScheduledAndSubmit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteScheduledFlightDto,
  ) {
    const data = await this.definitions.completeScheduledAndSubmit(
      actor,
      id,
      dto,
    );
    return { success: true, data };
  }

  @Post(':id/operations-decision')
  @HttpCode(200)
  @Roles(Role.OPERATIONS_MANAGER, Role.SENIOR_MANAGER)
  @ApiOperation({
    summary: 'تصمیم مدیر عملیات — تأیید (→ PENDING_CEO) یا رد',
  })
  async operationsDecision(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OperationsDecisionDto,
  ) {
    const data = await this.workflow.operationsDecision(actor, id, dto);
    return { success: true, data };
  }

  @Get(':id/history')
  @Roles(
    Role.SENIOR_MANAGER,
    Role.COMMERCIAL_MANAGER,
    Role.OPERATIONS_MANAGER,
    Role.CEO,
    Role.EMPLOYEE,
  )
  @RequiresPermission('fl_view', 'fl_history')
  @ApiOperation({ summary: 'تاریخچه بررسی و audit تعریف پرواز' })
  async history(@Param('id') id: string) {
    const data = await this.workflow.history(id);
    return { success: true, data };
  }

  @Get(':id/definition')
  @Roles(
    Role.SENIOR_MANAGER,
    Role.COMMERCIAL_MANAGER,
    Role.OPERATIONS_MANAGER,
    Role.EMPLOYEE,
  )
  @RequiresPermission('fl_view')
  @ApiOperation({ summary: 'دریافت تعریف کامل قابل ویرایش پرواز' })
  async getDefinition(@Param('id') id: string) {
    const data = await this.definitions.getDefinition(id);
    return { success: true, data };
  }

  @Put(':id/definition')
  @Roles(Role.SENIOR_MANAGER, Role.COMMERCIAL_MANAGER, Role.EMPLOYEE)
  @RequiresPermission('fl_manage', 'fl_add', 'fl_assign')
  @ApiOperation({
    summary:
      'ویرایش تعریف پرواز — روی نسخه منتشرشده revision جدید (PENDING_REVISION) می‌سازد',
  })
  async updateDefinition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFlightDefinitionDto,
  ) {
    const data = await this.definitions.updateDefinition(actor, id, dto);
    return { success: true, data };
  }

  @Post('schedule-templates/preview')
  @HttpCode(200)
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'rt_create')
  @ApiOperation({
    summary: 'پیش‌نمایش تاریخ‌های برنامه فصلی (بدون ذخیره)',
  })
  async previewScheduleTemplate(@Body() dto: ScheduleTemplatePreviewDto) {
    const data = await this.scheduleTemplates.preview(dto);
    return { success: true, data };
  }

  @Post('routes/distance-suggestion')
  @HttpCode(200)
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'rt_create')
  @ApiOperation({ summary: 'پیشنهاد هوشمند و غیرالزام‌آور مسافت مسیر' })
  async suggestRouteDistance(@Body() dto: RouteDistanceSuggestionDto) {
    const data = await this.scheduleTemplates.suggestDistance(dto);
    return { success: true, data };
  }

  @Post('schedule-templates')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'rt_create')
  @ApiOperation({
    summary:
      'ایجاد برنامه فصلی و تولید instanceها (idempotent؛ بدون تغییر نقشه MD-80)',
  })
  async createScheduleTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateScheduleTemplateDto,
  ) {
    const data = await this.scheduleTemplates.create(actor, dto);
    return { success: true, data };
  }

  @Get('schedule-templates')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'rt_view')
  @ApiOperation({ summary: 'فهرست برنامه‌های فصلی' })
  async listScheduleTemplates(@Query() query: ListScheduleTemplatesQueryDto) {
    const data = await this.scheduleTemplates.list(
      query.page ?? 1,
      query.pageSize ?? 20,
    );
    return { success: true, data };
  }

  @Get('schedule-templates/resolve')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'rt_view')
  @ApiOperation({
    summary: 'تکمیل مشخصات پرواز از روی شماره پرواز و مسیر فعال',
  })
  async resolveScheduleTemplate(
    @Query() query: ResolveScheduleTemplateQueryDto,
  ) {
    const data = await this.scheduleTemplates.resolveActiveByFlightNo(
      query.flightNo,
    );
    return { success: true, data };
  }

  @Get('schedule-templates/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'rt_view')
  @ApiOperation({ summary: 'جزئیات برنامه فصلی' })
  async getScheduleTemplate(@Param('id') id: string) {
    const data = await this.scheduleTemplates.get(id);
    return { success: true, data };
  }

  @Post('schedule-templates/:id/deactivate')
  @HttpCode(200)
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'rt_manage')
  @ApiOperation({
    summary: 'غیرفعال‌سازی آینده برنامه فصلی بدون حذف سوابق فروش‌شده',
  })
  async deactivateScheduleTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.scheduleTemplates.deactivate(actor, id);
    return { success: true, data };
  }

  @Post('schedules')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'rt_create')
  @ApiOperation({
    summary: 'ثبت برنامه تکرارشونده پرواز (RRULE) و ساخت پروازهای آینده',
  })
  async createSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateScheduleDto,
  ) {
    return {
      success: true,
      data: await this.flights.createSchedule(user, dto),
    };
  }

  @Get('schedules')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'rt_view')
  @ApiOperation({ summary: 'فهرست برنامه‌های تکرارشونده پرواز' })
  async listSchedules() {
    return { success: true, data: await this.flights.listSchedules() };
  }

  @Post('ai-analysis')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage')
  @ApiOperation({
    summary:
      'تحلیل قیمت‌گذاری پروازهای آینده با هوش مصنوعی — advisory، با degrade امن',
  })
  async aiAnalysis(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const data = await this.flights.runAiAnalysis(
      actor,
      req.headers['x-request-id'] as string | undefined,
    );
    return { success: true, data };
  }

  @Get('cancellations')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'FINANCE_MANAGER')
  @ApiOperation({
    summary: 'فهرست پروازهای کنسل‌شده و وضعیت استرداد مسافران',
  })
  async listCancellations() {
    const data = await this.flights.listCancellations();
    return { success: true, data };
  }

  @Post(':instanceId/cancel')
  @HttpCode(200)
  @Roles('COMMERCIAL_MANAGER')
  @ApiOperation({
    summary: 'کنسل کردن پرواز، توقف فروش و ارسال پیامک به خریداران',
  })
  async cancelFlight(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() dto: CancelFlightDto,
  ) {
    const data = await this.flights.cancelFlight(actor, instanceId, dto.reason);
    return { success: true, data };
  }

  @Post(':instanceId/cancellations/:bookingId/refund')
  @HttpCode(200)
  @Roles('FINANCE_MANAGER')
  @ApiOperation({
    summary: 'بازگشت وجه بلیط پرواز کنسل‌شده به حساب مسافر',
  })
  async refundCancelledBooking(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.flights.refundCancelledBooking(
      actor,
      instanceId,
      bookingId,
    );
    return { success: true, data };
  }

  @Get(':instanceId')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view')
  @ApiOperation({
    summary: 'مودال جزئیات پرواز: تفکیک واقعی کانال فروش + مجموع درآمد',
  })
  async detail(@Param('instanceId') instanceId: string) {
    const data = await this.flights.detail(instanceId);
    return { success: true, data };
  }

  @Get(':instanceId/commercial-control')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_sales_view', 'fl_view', 'fl_active')
  @ApiOperation({ summary: 'کنترل فروش عمومی و تفکیک فروش کلاس‌های نرخی' })
  async commercialControl(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
  ) {
    const data = await this.flights.commercialControl(instanceId);
    return { success: true, data };
  }

  @Patch(':instanceId/sales-visibility')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_site_sales', 'fl_manage', 'fl_assign')
  @ApiOperation({ summary: 'فعال یا غیرفعال کردن فروش پرواز در سایت عمومی' })
  async updateSalesVisibility(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() dto: UpdateSalesVisibilityDto,
  ) {
    const data = await this.flights.updateSalesVisibility(
      actor,
      instanceId,
      dto.enabled,
    );
    return { success: true, data };
  }

  @Patch(':instanceId/agency-sales-visibility')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_agency_sales', 'fl_manage', 'fl_assign')
  @ApiOperation({
    summary: 'فعال یا غیرفعال کردن نمایش و درخواست پرواز برای آژانس‌ها',
  })
  async updateAgencySalesVisibility(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() dto: UpdateSalesVisibilityDto,
  ) {
    const data = await this.flights.updateAgencySalesVisibility(
      actor,
      instanceId,
      dto.enabled,
    );
    return { success: true, data };
  }

  @Patch(':instanceId/commercial-settings')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission(
    'fl_site_sales',
    'fl_agency_sales',
    'fl_manage',
    'fl_assign',
  )
  @ApiOperation({
    summary:
      'تنظیمات پنل بازرگانی: نمایش در سایت، قیمت کلاس‌ها، آزادسازی آژانس',
  })
  async patchCommercialSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: PatchCommercialPanelSettingsDto,
  ) {
    const data = await this.flights.patchCommercialPanelSettings(
      actor,
      instanceId,
      {
        siteVisible: dto.siteVisible,
        classSitePrices: dto.classSitePrices,
        agencyRelease: dto.agencyRelease
          ? Object.fromEntries(
              Object.entries(dto.agencyRelease).map(([label, row]) => [
                label,
                {
                  seats: row.seats ?? 0,
                  priceIrr: row.priceIrr ?? '0',
                  special: row.special,
                },
              ]),
            )
          : undefined,
      },
    );
    return { success: true, data };
  }

  @Patch(':instanceId/plan')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({
    summary:
      'نرخ‌گذاری و تخصیص پرواز آینده — نرخ قابل فروش همچنان با تأیید مدیر عامل (فاز ۶)',
  })
  async plan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: PlanFlightDto,
  ) {
    const data = await this.flights.plan(actor, instanceId, dto);
    return { success: true, data };
  }

  @Patch(':instanceId/aircraft')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({
    summary:
      'تغییر نوع هواپیمای پرواز — رد با ۴۰۹ اگر ظرفیت جدید کمتر از رزروهای قطعی/لاک‌شده باشد',
  })
  async changeAircraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: ChangeAircraftTypeDto,
  ) {
    const data = await this.flights.changeAircraftType(
      actor,
      instanceId,
      dto.aircraftType,
      dto.stepUpChallengeId,
      dto.stepUpCode,
    );
    return { success: true, data };
  }

  @Get(':instanceId/fare-rules')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'fl_active')
  @ApiOperation({ summary: 'فهرست کلاس‌های نرخی این پرواز' })
  async listFareRules(@Param('instanceId') instanceId: string) {
    const data = await this.flights.listFareRules(instanceId);
    return { success: true, data };
  }

  @Patch(':instanceId/fare-rules/:ruleId/site-price')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_site_sales', 'fl_manage', 'fl_assign')
  @ApiOperation({ summary: 'ثبت قیمت فروش سایت برای یک کلاس نرخی' })
  async updateFareClassSitePrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateFareClassSitePriceDto,
  ) {
    const data = await this.flights.updateFareClassSitePrice(
      actor,
      instanceId,
      ruleId,
      dto.priceIrr,
      dto.reason,
      dto.seats,
    );
    return { success: true, data };
  }

  @Put(':instanceId/fare-rules/:ruleId/agency-release')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_agency_sales', 'fl_manage', 'fl_assign')
  @ApiOperation({ summary: 'آزادسازی صندلی یک کلاس برای فروش آژانسی' })
  async upsertAgencyFareRelease(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpsertAgencyFareReleaseDto,
  ) {
    const data = await this.flights.upsertAgencyFareRelease(
      actor,
      instanceId,
      ruleId,
      dto,
    );
    return { success: true, data };
  }

  @Post(':instanceId/fare-rules/:ruleId/price-suggestion')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission(
    'fl_site_sales',
    'fl_agency_sales',
    'fl_manage',
    'fl_assign',
  )
  @ApiOperation({
    summary:
      'پیشنهاد مشورتی نرخ هر کلاس بر پایه ظرفیت، فروش، زمان پرواز و نرخ رقبا؛ بدون ثبت یا انتشار خودکار',
  })
  async suggestFareClassPrice(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: FareClassPriceSuggestionDto,
    @Req() req: Request,
  ) {
    const data = await this.flights.suggestFareClassPrice(
      instanceId,
      ruleId,
      dto.channel,
      dto.competitorPriceIrr,
      req.headers['x-request-id'] as string | undefined,
    );
    return { success: true, data };
  }

  @Put(':instanceId/fare-rules/:ruleId/channel-release')
  @Roles('COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission(
    'fl_site_sales',
    'fl_agency_sales',
    'fl_manage',
    'fl_assign',
  )
  @ApiOperation({
    summary: 'ثبت اتمیک نرخ و ظرفیت فروش سایت و آژانس برای یک کلاس نرخی',
  })
  async updateFareClassChannelRelease(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateFareClassChannelReleaseDto,
  ) {
    const data = await this.flights.updateFareClassChannelRelease(
      actor,
      instanceId,
      ruleId,
      dto,
    );
    return { success: true, data };
  }

  @Post(':instanceId/fare-rules')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({
    summary:
      'ایجاد کلاس نرخی — رد با ۴۰۰ اگر مجموع صندلی تخصیص‌یافته از ظرفیت کابین بیشتر شود',
  })
  async createFareRule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: CreateFareRuleDto,
  ) {
    const data = await this.flights.createFareRule(actor, instanceId, dto);
    return { success: true, data };
  }

  @Patch(':instanceId/fare-rules/:ruleId')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({ summary: 'ویرایش کلاس نرخی' })
  async updateFareRule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateFareRuleDto,
  ) {
    const data = await this.flights.updateFareRule(
      actor,
      instanceId,
      ruleId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(':instanceId/fare-rules/:ruleId')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({
    summary: 'حذف کلاس نرخی — رد با ۴۰۹ اگر رزرو فعالی از آن استفاده کند',
  })
  async deleteFareRule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('ruleId') ruleId: string,
  ) {
    const data = await this.flights.deleteFareRule(actor, instanceId, ruleId);
    return { success: true, data };
  }

  @Get(':instanceId/allotments')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission(
    'fl_sales_view',
    'fl_agency_allotments',
    'fl_view',
    'fl_assign',
  )
  @ApiOperation({ summary: 'فهرست سهمیه‌های آژانس این پرواز' })
  async listAllotments(@Param('instanceId') instanceId: string) {
    const data = await this.flights.listAllotments(instanceId);
    return { success: true, data };
  }

  @Get(':instanceId/allotments/summary')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission(
    'fl_sales_view',
    'fl_agency_allotments',
    'fl_view',
    'fl_assign',
  )
  @ApiOperation({
    summary: 'خلاصه خودکار تعهدات آژانس، ظرفیت آزاد و درآمد قراردادی',
  })
  async allotmentsSummary(@Param('instanceId') instanceId: string) {
    const data = await this.flights.allotmentSummary(instanceId);
    return { success: true, data };
  }

  @Post(':instanceId/allotments')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_agency_allotments', 'fl_manage', 'fl_assign')
  @ApiOperation({
    summary:
      'تخصیص سهمیه به آژانس — رد با ۴۰۰ اگر مجموع سهمیه‌ها از سقف کلی آژانس‌های پرواز بیشتر شود',
  })
  async createAllotment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: CreateAllotmentDto,
  ) {
    const data = await this.flights.createAllotment(actor, instanceId, dto);
    return { success: true, data };
  }

  @Delete(':instanceId/allotments/:allotmentId')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_agency_allotments', 'fl_manage', 'fl_assign')
  @ApiOperation({
    summary: 'حذف سهمیه آژانس — رد با ۴۰۹ اگر آژانس رزرو فعالی داشته باشد',
  })
  async deleteAllotment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('allotmentId') allotmentId: string,
  ) {
    const data = await this.flights.deleteAllotment(
      actor,
      instanceId,
      allotmentId,
    );
    return { success: true, data };
  }

  @Get(':instanceId/commitments')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'fl_assign')
  @ApiOperation({
    summary: 'فهرست تعهدات صندلی چارتر و آژانس این پرواز',
  })
  async listCommitments(@Param('instanceId') instanceId: string) {
    const data = await this.commitments.listForInstance(instanceId);
    return { success: true, data };
  }

  @Get(':instanceId/commitments/summary')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_view', 'fl_assign')
  @ApiOperation({
    summary:
      'خلاصه ظرفیت هر کابین: کل / متعهد چارتر / متعهد آژانس / فروخته‌شده / قابل فروش آنلاین',
  })
  async commitmentsSummary(@Param('instanceId') instanceId: string) {
    const data = await this.commitments.capacitySummary(instanceId);
    return { success: true, data };
  }

  @Post(':instanceId/commitments')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({
    summary:
      'ثبت تعهد صندلی (چارتر بدون agencyId؛ آژانس با agencyId) — رد با ۴۰۹ اگر مجموع تعهدات از ظرفیت کابین بیشتر شود',
  })
  async createCommitment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: CreateCommitmentDto,
  ) {
    const data = await this.commitments.create(actor, instanceId, dto);
    return { success: true, data };
  }

  @Delete(':instanceId/commitments/:id')
  @Roles('SENIOR_MANAGER', 'COMMERCIAL_MANAGER', 'EMPLOYEE')
  @RequiresPermission('fl_manage', 'fl_assign')
  @ApiOperation({ summary: 'لغو تعهد صندلی (چارتر یا آژانس)' })
  async cancelCommitment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('id') id: string,
  ) {
    const data = await this.commitments.cancel(actor, instanceId, id);
    return { success: true, data };
  }
}
