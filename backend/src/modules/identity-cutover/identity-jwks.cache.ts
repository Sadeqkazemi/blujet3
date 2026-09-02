import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, KeyObject } from 'node:crypto';

interface IdentityJwk {
  [key: string]: string;
  kty: 'RSA';
  n: string;
  e: string;
  kid: string;
  alg: 'RS256';
  use: 'sig';
}

interface IdentityJwksDocument {
  keys: IdentityJwk[];
}

@Injectable()
export class IdentityJwksCache implements OnModuleInit, OnModuleDestroy {
  private readonly keys = new Map<string, KeyObject>();
  private refreshTimer?: NodeJS.Timeout;
  private refreshing?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return (
      this.config.get('IDENTITY_INTEGRATION_ENABLED', 'false') === 'true' ||
      this.config.get('IDENTITY_JWT_VERIFICATION_MODE', 'legacy') !== 'legacy'
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled()) return;
    await this.refresh();
    const ttl = Number(this.config.get('IDENTITY_JWKS_CACHE_TTL_MS', '300000'));
    this.refreshTimer = setInterval(
      () => void this.refresh(),
      Math.max(60_000, ttl),
    );
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  get(kid: string): KeyObject {
    const key = this.keys.get(kid);
    if (!key) {
      throw new ServiceUnavailableException({
        code: 'IDENTITY_SIGNING_KEY_UNAVAILABLE',
        message: 'کلید اعتبارسنجی هویت در دسترس نیست.',
      });
    }
    return key;
  }

  async getWithRefresh(kid: string): Promise<KeyObject> {
    try {
      return this.get(kid);
    } catch {
      try {
        await this.refresh();
        return this.get(kid);
      } catch {
        throw new ServiceUnavailableException({
          code: 'IDENTITY_SIGNING_KEY_UNAVAILABLE',
          message: 'کلید اعتبارسنجی هویت در دسترس نیست.',
        });
      }
    }
  }

  async refresh(): Promise<void> {
    if (!this.enabled()) return;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.load().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async load(): Promise<void> {
    const baseUrl = this.config
      .getOrThrow<string>('IDENTITY_SERVICE_URL')
      .replace(/\/$/, '');
    const token = this.config.getOrThrow<string>('IDENTITY_INTERNAL_TOKEN');
    const response = await fetch(`${baseUrl}/internal/v1/identity/jwks.json`, {
      headers: { 'x-internal-token': token },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      throw new Error(`Identity JWKS returned HTTP ${response.status}`);
    const document = (await response.json()) as IdentityJwksDocument;
    const next = new Map<string, KeyObject>();
    for (const jwk of document.keys) {
      if (
        jwk.kty !== 'RSA' ||
        jwk.alg !== 'RS256' ||
        jwk.use !== 'sig' ||
        !jwk.kid
      )
        continue;
      next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    }
    if (next.size === 0)
      throw new Error('Identity JWKS did not contain an RS256 key');
    this.keys.clear();
    for (const [kid, key] of next) this.keys.set(kid, key);
  }
}
