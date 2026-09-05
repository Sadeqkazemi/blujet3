import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InternalAuthGuard } from '../common/internal-auth.guard';
import {
  LockHistoryResponse,
  LocksResponse,
  MembershipResponse,
  MemberResponse,
  OwnerParams,
  ReadQuery,
  TierRulesResponse,
  MembersListQuery,
  MembersListResponse,
} from './loyalty.dto';
import { LoyaltyService } from './loyalty.service';
import { CardRequestsResponse } from './card-requests.dto';

@ApiTags('internal-loyalty')
@ApiHeader({ name: 'X-Internal-Token', required: true })
@ApiResponse({ status: 401, description: 'هویت سرویس نامعتبر است' })
@ApiResponse({ status: 400, description: 'ورودی نامعتبر است' })
@UseGuards(InternalAuthGuard)
@Controller('internal/v1/loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly config: ConfigService,
  ) {}

  @Get('card-requests')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'صف درخواست کارت مدیران بدون اطلاعات کد ملی' })
  @ApiResponse({ status: 200, type: CardRequestsResponse })
  @ApiResponse({ status: 404, description: 'نمای خواندنی غیرفعال است' })
  @ApiResponse({ status: 409, description: 'حجم نتیجه بیش از حد مجاز است' })
  async cardRequests() {
    if (
      this.config.get<string>('LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED') !==
      'true'
    )
      throw new NotFoundException();
    return { success: true, data: await this.loyalty.cardRequests() };
  }

  @Get('members-list')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'فهرست و شاخص‌های اعضای فعال بدون داده کد ملی' })
  @ApiResponse({ status: 200, type: MembersListResponse })
  @ApiResponse({ status: 404, description: 'projection غیرفعال است' })
  @ApiResponse({ status: 409, description: 'حد ایمن نتیجه رد شده است' })
  async membersList(@Query() query: MembersListQuery) {
    if (
      this.config.get<string>('LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED') !==
      'true'
    )
      throw new NotFoundException();
    return { success: true, data: await this.loyalty.membersList(query) };
  }

  @Get('tier-rules')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'نمای خواندنی قوانین سطوح وفاداری' })
  @ApiResponse({ status: 200, type: TierRulesResponse })
  @ApiResponse({ status: 404, description: 'projection غیرفعال یا ردیف غایب' })
  async tierRules() {
    if (
      this.config.get<string>('LOYALTY_TIER_RULES_PROJECTION_ENABLED') !==
      'true'
    )
      throw new NotFoundException();
    const data = await this.loyalty.tierRules();
    if (!data) throw new NotFoundException();
    return { success: true, data };
  }

  @Get('membership/:userId')
  @ApiHeader({ name: 'X-Loyalty-User-Id', required: true })
  @ApiResponse({ status: 403, description: 'مالک درخواست مطابقت ندارد' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'نمای کامل و امن عضویت مالک' })
  @ApiResponse({ status: 200, type: MembershipResponse })
  @ApiResponse({ status: 404, description: 'projection غیرفعال است' })
  async membership(
    @Param() params: OwnerParams,
    @Headers('x-loyalty-user-id') owner: string,
  ) {
    if (
      this.config.get<string>('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED') !==
      'true'
    )
      throw new NotFoundException();
    return {
      success: true,
      data: await this.loyalty.membership(params.userId, owner),
    };
  }

  @Get('members/:userId')
  @ApiHeader({ name: 'X-Loyalty-User-Id', required: true })
  @ApiResponse({ status: 403, description: 'مالک درخواست مطابقت ندارد' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'نمای امن عضویت مالک' })
  @ApiResponse({
    status: 200,
    type: MemberResponse,
    description: 'data در پاکت success',
  })
  @ApiResponse({ status: 404, description: 'عضویت فعال یافت نشد' })
  async member(
    @Param() params: OwnerParams,
    @Headers('x-loyalty-user-id') owner: string,
  ) {
    return {
      success: true,
      data: await this.loyalty.member(params.userId, owner),
    };
  }

  @Get('price-locks/:userId')
  @ApiHeader({ name: 'X-Loyalty-User-Id', required: true })
  @ApiResponse({ status: 403, description: 'مالک درخواست مطابقت ندارد' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'قفل‌های فعال مالک بدون دسترسی به موجودی پرواز' })
  @ApiResponse({
    status: 200,
    type: LocksResponse,
    description: 'data در پاکت success',
  })
  @ApiResponse({ status: 409, description: 'نتایج بیش از حد مجاز است' })
  async locks(
    @Param() params: OwnerParams,
    @Headers('x-loyalty-user-id') owner: string,
    @Query() query: ReadQuery,
  ) {
    return {
      success: true,
      data: await this.loyalty.locks(
        params.userId,
        owner,
        query.at ? new Date(query.at) : undefined,
      ),
    };
  }

  @Get('price-lock-history/:userId')
  @ApiHeader({ name: 'X-Loyalty-User-Id', required: true })
  @ApiResponse({ status: 403, description: 'مالک درخواست مطابقت ندارد' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'تاریخچه همه وضعیت‌های قفل قیمت مالک' })
  @ApiResponse({
    status: 200,
    type: LockHistoryResponse,
    description: 'تاریخچه مالک در پاکت success',
  })
  @ApiResponse({ status: 409, description: 'نتایج بیش از حد مجاز است' })
  async lockHistory(
    @Param() params: OwnerParams,
    @Headers('x-loyalty-user-id') owner: string,
  ) {
    return {
      success: true,
      data: await this.loyalty.lockHistory(params.userId, owner),
    };
  }
}
