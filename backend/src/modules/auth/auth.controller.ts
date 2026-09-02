import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { StepUpService } from './step-up.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { AgencyLoginDto } from './dto/agency-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestStepUpDto } from './dto/step-up.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { CustomerPasswordLoginDto } from './dto/customer-password-login.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { SandboxImpersonationDto } from './dto/sandbox-impersonation.dto';
import { RequestPasswordResetEmailDto } from './dto/request-password-reset-email.dto';
import { VerifyPasswordResetEmailDto } from './dto/verify-password-reset-email.dto';
import {
  AgencyPasswordResetRequestDto,
  AgencyPasswordResetVerifyDto,
} from './dto/agency-password-reset.dto';
import {
  AgencyFirstLoginRequestDto,
  StaffFirstLoginRequestDto,
  StaffLoginModeDto,
} from './dto/sandbox-first-login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipMustChangePassword } from '../../common/decorators/skip-must-change-password.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const REFRESH_COOKIE = 'blujet_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** `Secure` cookies are silently dropped by browsers over plain HTTP —
 * defaults to the NODE_ENV heuristic (matches every existing deployment
 * assumption) but stays overridable via COOKIE_SECURE for an interim
 * IP-only/no-TLS deployment (see docs/DEPLOY_IP.md), which would otherwise
 * break session refresh with no visible error. */
function isCookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function setRefreshCookie(res: Response, token: string, expiresAt?: Date) {
  const maxAge = expiresAt
    ? Math.max(
        0,
        Math.min(REFRESH_COOKIE_MAX_AGE_MS, expiresAt.getTime() - Date.now()),
      )
    : REFRESH_COOKIE_MAX_AGE_MS;
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'strict',
    maxAge,
    path: '/',
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly stepUp: StepUpService,
  ) {}

  @Post('staff/login-mode')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resolve the sandbox staff first-login UI mode' })
  async staffLoginMode(@Body() dto: StaffLoginModeDto) {
    const data = await this.auth.staffLoginMode(dto.username);
    return { success: true, data };
  }

  @Post('staff/first-login/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sandbox staff first login: set password/mobile and issue OTP',
  })
  async staffFirstLogin(@Body() dto: StaffFirstLoginRequestDto) {
    const data = await this.auth.requestStaffFirstLogin(
      dto.username,
      dto.phone,
      dto.newPassword,
    );
    return { success: true, data };
  }

  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Step 1 of staff login: verify username/password, issue a 2FA challenge',
  })
  @ApiResponse({ status: 200, description: 'Challenge issued' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  async staffLogin(
    @Body() dto: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.staffLogin(dto.username, dto.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (result.loginMode === 'TWO_FACTOR') {
      return { success: true, data: result };
    }
    if (result.loginMode === 'PASSWORD_ONLY') {
      const { refreshToken, ...publicResult } = result;
      setRefreshCookie(res, refreshToken);
      return { success: true, data: publicResult };
    }
    const { refreshToken, temporaryAccessExpiresAt, ...publicResult } = result;
    setRefreshCookie(res, refreshToken, new Date(temporaryAccessExpiresAt));
    return {
      success: true,
      data: { ...publicResult, temporaryAccessExpiresAt },
    };
  }

  @Post('staff/login/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Step 2 of staff login: verify the 2FA code, issue tokens',
  })
  @ApiResponse({ status: 200, description: 'Login complete' })
  @ApiResponse({ status: 401, description: 'Invalid/expired code' })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.verifyTwoFactor(
      dto.challengeId,
      dto.code,
      {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
    );
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Post('agency/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Agency Portal login: phone+password, issues tokens directly (no 2FA)',
  })
  @ApiResponse({ status: 200, description: 'Login complete' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account or agency suspended' })
  async agencyLogin(
    @Body() dto: AgencyLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.agencyLogin(dto.phone, dto.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if ('challengeId' in result) {
      return { success: true, data: result };
    }
    const { accessToken, refreshToken, user } = result;
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Post('agency/first-login/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sandbox agency first login: set password and issue OTP',
  })
  async agencyFirstLogin(@Body() dto: AgencyFirstLoginRequestDto) {
    const data = await this.auth.requestAgencyFirstLogin(
      dto.phone,
      dto.newPassword,
    );
    return { success: true, data };
  }

  @Post('agency/login/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify agency sandbox login OTP and issue tokens' })
  async agencyLoginVerify(
    @Body() dto: VerifyTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.auth.verifyAgencyLogin(dto.challengeId, dto.code, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Post('agency/password-reset/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'بازیابی رمز آژانس — درخواست OTP پیامکی' })
  async agencyPasswordResetRequest(@Body() dto: AgencyPasswordResetRequestDto) {
    const result = await this.auth.requestAgencyPasswordReset(dto.phone);
    return { success: true, data: result };
  }

  @Post('agency/password-reset/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'بازیابی رمز آژانس — تأیید OTP و صدور توکن' })
  async agencyPasswordResetVerify(
    @Body() dto: AgencyPasswordResetVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.auth.verifyAgencyPasswordResetOtp(dto.challengeId, dto.code, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Public purchase engine — step 1: request an OTP for a customer phone number',
  })
  @ApiResponse({ status: 200, description: 'Challenge issued' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    const result = await this.auth.requestOtp(dto.phone, dto.referralCode);
    return { success: true, data: result };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public purchase engine — step 2: verify the OTP, issue tokens',
  })
  @ApiResponse({ status: 200, description: 'Login complete' })
  @ApiResponse({ status: 401, description: 'Invalid/expired code' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.verifyOtp(
      dto.challengeId,
      dto.code,
      { userAgent: req.headers['user-agent'], ip: req.ip },
    );
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Get('_test/last-otp/:phone')
  @ApiOperation({
    summary: 'E2E-test only: reads back the mock OTP code. 404s in production.',
  })
  async testLastOtp(@Param('phone') phone: string) {
    const code = await this.auth.getLastOtpForE2e(phone);
    if (code === null) throw new NotFoundException();
    return { success: true, data: { code } };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and issue a new access token',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    if (!presented) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'نشست یافت نشد.' },
      };
    }
    const { accessToken, refreshToken } = await this.auth.refresh(presented, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken } };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    if (presented) await this.auth.logout(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { success: true };
  }

  @Get('me')
  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Current authenticated user's identity and role" })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.auth.getMe(user);
    return { success: true, data };
  }

  @Get('sandbox/tenant-accounts')
  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Sandbox only: list active customer/agency accounts for owner preview',
  })
  async sandboxTenantAccounts(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.auth.listSandboxTenantAccounts(user);
    return { success: true, data };
  }

  @Post('sandbox/impersonate')
  @HttpCode(HttpStatus.OK)
  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sandbox only: issue a short-lived customer/agency preview token',
  })
  async sandboxImpersonate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SandboxImpersonationDto,
  ) {
    const data = await this.auth.startSandboxImpersonation(
      user,
      dto.targetUserId,
    );
    return { success: true, data };
  }

  @Patch('me/locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'ذخیرهٔ ترجیح زبان نمایش (fa/en/ar) — برای همگام‌سازی بین‌دستگاهی',
  })
  async updateLocale(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLocaleDto,
  ) {
    const data = await this.auth.updateLocale(user, dto.locale);
    return { success: true, data };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'تغییر رمز عبور خود — رمز فعلی باید تأیید شود',
  })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changeOwnPassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true, data: { changed: true } };
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'AGENCY')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'تعیین/بازنشانی رمز عبور مشتری پس از احراز هویت با OTP — بدون نیاز به رمز فعلی',
  })
  @ApiResponse({ status: 200, description: 'Password set' })
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
  ) {
    await this.auth.setOwnPassword(user, dto.newPassword);
    return { success: true, data: { changed: true } };
  }

  @Post('customer/login-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'ورود مشتری با موبایل + رمز عبور' })
  @ApiResponse({ status: 200, description: 'Login complete' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async customerPasswordLogin(
    @Body() dto: CustomerPasswordLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.auth.customerPasswordLogin(dto.phone, dto.password, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Post('password-reset/email/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'فراموشی رمز — مسیر ایمیل: ارسال کد به ایمیل تأییدشدهٔ حساب (جایگزین OTP پیامکی)',
  })
  @ApiResponse({ status: 200, description: 'Challenge issued' })
  @ApiResponse({
    status: 401,
    description: 'No account with a verified email matches',
  })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  async requestPasswordResetEmail(@Body() dto: RequestPasswordResetEmailDto) {
    const result = await this.auth.requestPasswordResetEmail(dto.email);
    return { success: true, data: result };
  }

  @Post('password-reset/email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'فراموشی رمز — مسیر ایمیل: تأیید کد، صدور توکن‌ها',
  })
  @ApiResponse({ status: 200, description: 'Login complete' })
  @ApiResponse({ status: 401, description: 'Invalid/expired code' })
  async verifyPasswordResetEmail(
    @Body() dto: VerifyPasswordResetEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.auth.verifyPasswordResetEmail(dto.challengeId, dto.code, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    setRefreshCookie(res, refreshToken);
    return { success: true, data: { accessToken, user } };
  }

  @Get('_test/last-password-reset-email-code/:email')
  @ApiOperation({
    summary:
      'E2E-test only: reads back the mock password-reset-email code. 404s in production.',
  })
  async testLastPasswordResetEmailCode(@Param('email') email: string) {
    const code = await this.auth.getLastPasswordResetEmailCodeForE2e(email);
    if (code === null) throw new NotFoundException();
    return { success: true, data: { code } };
  }

  @Post('step-up/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'درخواست کد تأیید مجدد پیش از عملیات پرریسک — تحویل از طریق کانال 2FA موجود',
  })
  async requestStepUp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestStepUpDto,
  ) {
    const data = await this.stepUp.request(user, dto.scope);
    return { success: true, data };
  }

  @Get('_test/last-code/:username')
  @ApiOperation({
    summary: 'E2E-test only: reads back the mock 2FA code. 404s in production.',
  })
  async testLastCode(@Param('username') username: string) {
    const code = await this.auth.getLastCodeForE2e(username);
    if (code === null) throw new NotFoundException();
    return { success: true, data: { code } };
  }
}
