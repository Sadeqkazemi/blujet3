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
} from './loyalty.dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('internal-loyalty')
@ApiHeader({ name: 'X-Internal-Token', required: true })
@ApiHeader({ name: 'X-Loyalty-User-Id', required: true })
@ApiResponse({ status: 401, description: 'هویت سرویس نامعتبر است' })
@ApiResponse({ status: 403, description: 'مالک درخواست مطابقت ندارد' })
@ApiResponse({ status: 400, description: 'ورودی نامعتبر است' })
@UseGuards(InternalAuthGuard)
@Controller('internal/v1/loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly config: ConfigService,
  ) {}

  @Get('membership/:userId')
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
