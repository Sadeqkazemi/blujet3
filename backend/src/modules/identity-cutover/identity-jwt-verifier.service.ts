import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createVerify } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Role } from '../../database/enums';
import { IdentityJwksCache } from './identity-jwks.cache';

interface IdentityClaims {
  sub: string;
  role: Role;
  fullName: string;
  isSuperAdmin?: boolean;
  sandboxOwnerId?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
}

const ROLES: readonly Role[] = [
  'USER',
  'AGENCY',
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
];

function decodePart(value: string): unknown {
  try {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown;
  } catch {
    throw new UnauthorizedException({
      code: 'IDENTITY_JWT_INVALID',
      message: 'توکن هویت نامعتبر است.',
    });
  }
}

@Injectable()
export class IdentityJwtVerifierService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwks: IdentityJwksCache,
  ) {}

  enabled(): boolean {
    return this.mode() !== 'legacy';
  }

  requiresIdentityToken(token: string): boolean {
    const mode = this.mode();
    if (mode === 'identity') return true;
    if (mode === 'legacy') return false;
    const [encodedHeader] = token.split('.');
    if (!encodedHeader) return false;
    const header = decodePart(encodedHeader) as { alg?: string };
    return header.alg === 'RS256';
  }

  private mode(): 'legacy' | 'dual' | 'identity' {
    if (this.config.get('IDENTITY_INTEGRATION_ENABLED', 'false') === 'true') {
      return 'identity';
    }
    const configured = this.config.get<string>(
      'IDENTITY_JWT_VERIFICATION_MODE',
      'legacy',
    );
    return configured === 'dual' || configured === 'identity'
      ? configured
      : 'legacy';
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const parts = token.split('.');
    if (parts.length !== 3) throw this.invalid();
    const header = decodePart(parts[0]) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) throw this.invalid();
    const payload = decodePart(parts[1]) as Partial<IdentityClaims>;
    const issuer = this.config.getOrThrow<string>('IDENTITY_JWT_ISSUER');
    const audience = this.config.getOrThrow<string>('IDENTITY_JWT_AUDIENCE');
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.fullName !== 'string' ||
      !ROLES.includes(payload.role as Role) ||
      payload.iss !== issuer ||
      !(
        payload.aud === audience ||
        (Array.isArray(payload.aud) && payload.aud.includes(audience))
      ) ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      (typeof payload.nbf === 'number' &&
        payload.nbf > Math.floor(Date.now() / 1000))
    )
      throw this.invalid();
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const valid = verifier.verify(
      await this.jwks.getWithRefresh(header.kid),
      Buffer.from(parts[2], 'base64url'),
    );
    if (!valid) throw this.invalid();
    return {
      id: payload.sub,
      role: payload.role as Role,
      fullName: payload.fullName,
      isSuperAdmin: payload.isSuperAdmin === true,
      sandboxOwnerId: payload.sandboxOwnerId,
    };
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'IDENTITY_JWT_INVALID',
      message: 'توکن هویت نامعتبر یا منقضی است.',
    });
  }
}
