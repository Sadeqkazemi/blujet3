import { Controller, Delete, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MySessionsService } from './my-sessions.service';
import { REFRESH_COOKIE_NAME } from './auth-token.util';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Customer account: active sessions (نشست‌های فعال) — see docs/API.md. */
@ApiTags('profile')
@Controller('my/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class MySessionsController {
  constructor(private readonly sessions: MySessionsService) {}

  private refreshFromRequest(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
  }

  @Get()
  @ApiOperation({ summary: 'فهرست نشست‌های فعال مشتری' })
  async listMine(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const data = await this.sessions.listMine(
      user,
      this.refreshFromRequest(req),
    );
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'پایان نشست دستگاه دیگر' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.sessions.revoke(
      user,
      id,
      this.refreshFromRequest(req),
    );
    return { success: true, data };
  }
}
