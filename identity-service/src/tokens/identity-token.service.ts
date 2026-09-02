import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createSign, randomBytes, randomUUID } from 'node:crypto';
import { IdentityKeyService } from '../keys/identity-key.service';
import { IdentitySessionStore } from '../sessions/identity-session.store';
import { IssueIdentityTokenDto, RefreshIdentityTokenDto } from './identity-token.dto';

export interface IdentityTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_SECONDS = 604800;

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class IdentityTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly keys: IdentityKeyService,
    private readonly sessions: IdentitySessionStore,
  ) {}

  async issue(dto: IssueIdentityTokenDto): Promise<IdentityTokenPair> {
    const accessTtl = dto.accessTtlSeconds ?? ACCESS_TTL_SECONDS;
    const refreshTtl = dto.refreshTtlSeconds ?? REFRESH_TTL_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    const accessToken = this.sign({
      sub: dto.userId,
      role: dto.role,
      fullName: dto.fullName,
      isSuperAdmin: dto.isSuperAdmin === true,
      sandboxOwnerId: dto.sandboxOwnerId,
      iat: now,
      exp: now + accessTtl,
      jti: randomUUID(),
    });
    const refreshToken = randomBytes(48).toString('hex');
    await this.sessions.save({
      id: randomUUID(),
      userId: dto.userId,
      role: dto.role,
      fullName: dto.fullName,
      isSuperAdmin: dto.isSuperAdmin === true,
      sandboxOwnerId: dto.sandboxOwnerId,
      tokenHash: hash(refreshToken),
      createdAt: Date.now(),
      expiresAt: Date.now() + refreshTtl * 1000,
      userAgent: dto.userAgent,
      ip: dto.ip,
    });
    return { accessToken, refreshToken, expiresIn: accessTtl, tokenType: 'Bearer' };
  }

  async refresh(dto: RefreshIdentityTokenDto): Promise<IdentityTokenPair> {
    const oldHash = hash(dto.refreshToken);
    const session = await this.sessions.find(oldHash);
    if (!session || session.expiresAt <= Date.now()) {
      throw new UnauthorizedException({
        code: 'IDENTITY_REFRESH_INVALID',
        message: 'نشست شما منقضی شده است.',
      });
    }
    await this.sessions.revoke(oldHash);
    return this.issue({
      userId: session.userId,
      role: session.role,
      fullName: session.fullName,
      isSuperAdmin: session.isSuperAdmin,
      sandboxOwnerId: session.sandboxOwnerId,
      userAgent: dto.userAgent ?? session.userAgent,
      ip: dto.ip ?? session.ip,
      refreshTtlSeconds: Math.ceil((session.expiresAt - Date.now()) / 1000),
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessions.revoke(hash(refreshToken));
  }

  async listSessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? hash(currentRefreshToken) : undefined;
    const sessions = await this.sessions.list(userId);
    return sessions
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((session) => ({
        id: session.id,
        deviceLabel: session.userAgent?.slice(0, 120) || 'دستگاه ناشناس',
        ip: session.ip ?? null,
        userAgent: session.userAgent ?? null,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        isCurrent: session.tokenHash === currentHash,
      }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentRefreshToken?: string,
  ): Promise<{ revoked: true }> {
    const sessions = await this.sessions.list(userId);
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'نشست یافت نشد.' });
    }
    if (currentRefreshToken && session.tokenHash === hash(currentRefreshToken)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'برای خروج از این دستگاه از دکمه خروج حساب استفاده کنید.',
      });
    }
    await this.sessions.revokeById(userId, sessionId);
    return { revoked: true };
  }

  private sign(payload: Record<string, unknown>): string {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: this.config.getOrThrow<string>('IDENTITY_JWT_KID'),
    };
    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(
      JSON.stringify({
        ...payload,
        iss: this.config.getOrThrow<string>('IDENTITY_JWT_ISSUER'),
        aud: this.config.getOrThrow<string>('IDENTITY_JWT_AUDIENCE'),
      }),
    );
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(this.keys.getPrivateKey()).toString('base64url')}`;
  }
}
