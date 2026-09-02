import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BankAccountsService } from './bank-accounts.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dtos';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer account: saved bank accounts (حساب‌های بانکی) — see docs/API.md. */
@ApiTags('profile')
@Controller('my/bank-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MyBankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'فهرست حساب‌های بانکی مشتری' })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.bankAccounts.listMine(user);
    return { success: true, data };
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'ثبت کارت/شبای جدید' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankAccountDto,
  ) {
    const data = await this.bankAccounts.create(user, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تنظیم حساب پیش‌فرض' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    const data = await this.bankAccounts.update(user, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف حساب بانکی' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.bankAccounts.remove(user, id);
    return { success: true, data };
  }
}
