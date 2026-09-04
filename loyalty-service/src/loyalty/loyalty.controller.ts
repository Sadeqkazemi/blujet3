import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InternalAuthGuard } from '../common/internal-auth.guard';
import {
  LocksResponse,
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
  constructor(private readonly loyalty: LoyaltyService) {}

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
}
