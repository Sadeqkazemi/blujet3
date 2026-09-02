import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface IdentitySessionView {
  id: string;
  deviceLabel: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface IssueRequest {
  userId: string;
  role: AuthenticatedUser['role'];
  fullName: string;
  isSuperAdmin?: boolean;
  sandboxOwnerId?: string;
  userAgent?: string;
  ip?: string;
  accessTtlSeconds?: number;
  refreshTtlSeconds?: number;
}

@Injectable()
export class IdentityTokenClient {
  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return this.config.get('IDENTITY_INTEGRATION_ENABLED', 'false') === 'true';
  }

  async issue(
    user: AuthenticatedUser,
    context: { userAgent?: string; ip?: string },
    absoluteExpiresAt?: Date,
  ): Promise<TokenPair> {
    const body: IssueRequest = {
      userId: user.id,
      role: user.role,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      sandboxOwnerId: user.sandboxOwnerId,
      userAgent: context.userAgent,
      ip: context.ip,
    };
    if (absoluteExpiresAt) {
      body.accessTtlSeconds = Math.max(
        1,
        Math.min(
          900,
          Math.floor((absoluteExpiresAt.getTime() - Date.now()) / 1000),
        ),
      );
      body.refreshTtlSeconds = body.accessTtlSeconds;
    }
    return this.post<TokenPair>('/internal/v1/identity/tokens', body);
  }

  refresh(
    refreshToken: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    return this.post<TokenPair>('/internal/v1/identity/sessions/refresh', {
      refreshToken,
      ...context,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.post<null>('/internal/v1/identity/sessions/logout', {
      refreshToken,
    });
  }

  listSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<IdentitySessionView[]> {
    return this.post<IdentitySessionView[]>(
      '/internal/v1/identity/sessions/list',
      {
        userId,
        currentRefreshToken,
      },
    );
  }

  revokeSession(
    userId: string,
    sessionId: string,
    currentRefreshToken?: string,
  ): Promise<{ revoked: true }> {
    return this.post<{ revoked: true }>(
      '/internal/v1/identity/sessions/revoke',
      {
        userId,
        sessionId,
        currentRefreshToken,
      },
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = this.config
      .getOrThrow<string>('IDENTITY_SERVICE_URL')
      .replace(/\/$/, '');
    const token = this.config.getOrThrow<string>('IDENTITY_INTERNAL_TOKEN');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'IDENTITY_UNAVAILABLE',
        message: 'سرویس هویت در دسترس نیست.',
      });
    }
    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'نشست شما معتبر نیست.',
        });
      }
      if (response.status === 403) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'عملیات نشست مجاز نیست.',
        });
      }
      if (response.status === 404) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'نشست یافت نشد.',
        });
      }
      throw new ServiceUnavailableException({
        code: 'IDENTITY_TOKEN_OPERATION_FAILED',
        message: 'عملیات نشست هویت انجام نشد.',
      });
    }
    if (response.status === 204) {
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException({
        code: 'IDENTITY_INVALID_RESPONSE',
        message: 'پاسخ سرویس هویت نامعتبر است.',
      });
    }
  }
}
