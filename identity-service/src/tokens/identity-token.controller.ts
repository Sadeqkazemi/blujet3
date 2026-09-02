import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListIdentitySessionsDto,
  LogoutIdentityTokenDto,
  RefreshIdentityTokenDto,
  IssueIdentityTokenDto,
  RevokeIdentitySessionDto,
} from './identity-token.dto';
import { IdentityTokenService } from './identity-token.service';

@ApiTags('identity-internal')
@Controller('internal/v1/identity')
export class IdentityTokenController {
  constructor(private readonly tokens: IdentityTokenService) {}

  @Post('tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'صدور access و refresh token برای facade احراز هویت' })
  issue(@Body() dto: IssueIdentityTokenDto) {
    return this.tokens.issue(dto);
  }

  @Post('sessions/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'چرخش refresh token و ابطال token قبلی' })
  refresh(@Body() dto: RefreshIdentityTokenDto) {
    return this.tokens.refresh(dto);
  }

  @Post('sessions/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'ابطال نشست Identity' })
  async logout(@Body() dto: LogoutIdentityTokenDto): Promise<void> {
    await this.tokens.logout(dto.refreshToken);
  }

  @Post('sessions/list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'فهرست نشست‌های فعال یک کاربر برای facade' })
  list(@Body() dto: ListIdentitySessionsDto) {
    return this.tokens.listSessions(dto.userId, dto.currentRefreshToken);
  }

  @Post('sessions/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ابطال یکی از نشست‌های کاربر برای facade' })
  revoke(@Body() dto: RevokeIdentitySessionDto) {
    return this.tokens.revokeSession(
      dto.userId,
      dto.sessionId,
      dto.currentRefreshToken,
    );
  }
}
