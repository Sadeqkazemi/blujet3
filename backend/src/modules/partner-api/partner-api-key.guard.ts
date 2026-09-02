import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors';
import { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import {
  AgencyApiKeyStatus,
  AgencyApiScope,
  Role,
  type AgencyApiScope as AgencyApiScopeType,
} from '../../database/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { hashAgencyApiKey } from '../../common/agency-api-key';
import { RedisService } from '../../redis/redis.service';

export const PARTNER_API_SCOPES = 'partner-api-scopes';

export interface PartnerApiContext {
  keyId: string;
  scope: AgencyApiScopeType;
  actor: AuthenticatedUser;
}

export interface PartnerApiRequest extends Request {
  partnerApi?: PartnerApiContext;
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : request.ip;
  const ip = raw?.trim() ?? '';
  if (!ip) return null;
  // Express may return IPv4-mapped IPv6 (::ffff:1.2.3.4).
  return ip.replace(/^::ffff:/i, '');
}

@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(AgencyApiKey)
    private readonly apiKeyRepo: Repository<AgencyApiKey>,
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PartnerApiRequest>();
    const rawHeader = request.headers['x-api-key'];
    const rawKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!rawKey?.trim() || rawKey.length > 512) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'کلید API ارسال نشده یا نامعتبر است.',
      });
    }

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash: hashAgencyApiKey(rawKey.trim()) },
      relations: { agency: { user: true } },
    });
    const now = new Date();
    if (
      !apiKey ||
      apiKey.status !== AgencyApiKeyStatus.ACTIVE ||
      (apiKey.expiresAt !== null && apiKey.expiresAt <= now)
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'کلید API ارسال نشده یا نامعتبر است.',
      });
    }

    if (
      apiKey.agency.suspendedAt !== null ||
      !apiKey.agency.user.isActive ||
      apiKey.agency.user.deletedAt !== null
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ACCESS_REVOKED,
        message: 'دسترسی این آژانس غیرفعال شده است.',
      });
    }

    const whitelist = apiKey.ipWhitelist ?? [];
    if (whitelist.length > 0) {
      const ip = clientIp(request);
      if (!ip || !whitelist.includes(ip)) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'آدرس IP شما در فهرست مجاز این کلید نیست.',
        });
      }
    }

    if (apiKey.rateLimitPerMinute != null && apiKey.rateLimitPerMinute > 0) {
      const count = await this.redis.incrWithTtl(
        `partner-api-rl:${apiKey.id}`,
        60,
      );
      if (count !== null && count > apiKey.rateLimitPerMinute) {
        throw new ForbiddenException({
          code: ErrorCode.RATE_LIMITED,
          message: 'سقف نرخ درخواست این کلید API پر شده است.',
        });
      }
    }

    const allowedScopes =
      this.reflector.getAllAndOverride<AgencyApiScopeType[]>(
        PARTNER_API_SCOPES,
        [context.getHandler(), context.getClass()],
      ) ?? Object.values(AgencyApiScope);
    if (!allowedScopes.includes(apiKey.scope)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'سطح دسترسی این کلید برای عملیات درخواستی کافی نیست.',
      });
    }

    request.partnerApi = {
      keyId: apiKey.id,
      scope: apiKey.scope,
      actor: {
        id: apiKey.agencyId,
        role: Role.AGENCY,
        fullName: apiKey.agency.user.fullName,
      },
    };
    await Promise.all([
      this.apiKeyRepo.increment({ id: apiKey.id }, 'callCount', 1),
      this.apiKeyRepo.update({ id: apiKey.id }, { lastUsedAt: now }),
    ]);
    return true;
  }
}
