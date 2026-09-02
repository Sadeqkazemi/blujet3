import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import { PreviewRefundDto, SubmitRefundDto } from './dto/submit-refund.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Public purchase engine: the customer's own submit/list/detail — kept
 * separate from RefundsController (staff-only, PanelAccessGuard-gated) so
 * a USER account never touches the staff panel-access machinery. */
@ApiTags('refunds')
@Controller('my/refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
// Customers and agencies can submit/refund only their own ticketed bookings;
// ownership is enforced by RefundsService using the authenticated user id.
@Roles('USER', 'AGENCY')
export class RefundsCustomerController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  @ApiOperation({
    summary: 'ثبت درخواست استرداد بلیط با ریز جریمه/مبلغ قابل استرداد',
  })
  async submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SubmitRefundDto,
  ) {
    const data = await this.refunds.submitFromCustomer(actor, dto);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'فهرست درخواست‌های استرداد مشتری جاری' })
  async listMine(@CurrentUser() actor: AuthenticatedUser) {
    return { success: true, data: await this.refunds.listMine(actor.id) };
  }

  @Get('eligible-bookings')
  @ApiOperation({
    summary: 'فهرست رزروهای قابل استرداد با پیش‌نمایش جریمه',
  })
  async eligibleBookings(@CurrentUser() actor: AuthenticatedUser) {
    return {
      success: true,
      data: await this.refunds.listEligibleBookings(actor.id),
    };
  }

  @Get('rules')
  @ApiOperation({ summary: 'قوانین جاری جریمه استرداد برای نمایش به مشتری' })
  async rules() {
    return { success: true, data: await this.refunds.listCustomerRules() };
  }

  @Post('preview')
  @ApiOperation({
    summary: 'بازمحاسبه مالکیت، امکان استرداد و جریمه پیش از تأیید',
  })
  async preview(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PreviewRefundDto,
  ) {
    return {
      success: true,
      data: await this.refunds.previewMine(actor.id, dto.bookingId),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک درخواست استرداد مشتری' })
  async getMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.refunds.getMine(actor.id, id) };
  }
}
