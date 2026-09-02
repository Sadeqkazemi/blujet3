import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface IdentitySession {
  id: string;
  userId: string;
  role: string;
  fullName: string;
  isSuperAdmin: boolean;
  sandboxOwnerId?: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class IdentitySessionStore implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly memory = new Map<string, IdentitySession>();

  constructor(config: ConfigService) {
    const url = config.get<string>('IDENTITY_REDIS_URL');
    if (url && !url.startsWith('memory://')) {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }
  }

  async save(session: IdentitySession): Promise<void> {
    const ttl = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
    if (this.redis) {
      await this.ready();
      await this.redis
        .multi()
        .set(this.key(session.tokenHash), JSON.stringify(session), 'EX', ttl)
        .sadd(this.userKey(session.userId), session.tokenHash)
        .expire(this.userKey(session.userId), ttl)
        .exec();
      return;
    }
    this.memory.set(session.tokenHash, session);
  }

  async find(tokenHash: string): Promise<IdentitySession | null> {
    if (this.redis) {
      await this.ready();
      const raw = await this.redis.get(this.key(tokenHash));
      return raw ? (JSON.parse(raw) as IdentitySession) : null;
    }
    const session = this.memory.get(tokenHash);
    if (session && session.expiresAt <= Date.now()) {
      this.memory.delete(tokenHash);
      return null;
    }
    return session ?? null;
  }

  async revoke(tokenHash: string): Promise<void> {
    if (this.redis) {
      await this.ready();
      const session = await this.find(tokenHash);
      await this.redis.del(this.key(tokenHash));
      if (session) await this.redis.srem(this.userKey(session.userId), tokenHash);
      return;
    }
    this.memory.delete(tokenHash);
  }

  async list(userId: string): Promise<IdentitySession[]> {
    if (this.redis) {
      await this.ready();
      const hashes = await this.redis.smembers(this.userKey(userId));
      if (hashes.length === 0) return [];
      const values = await this.redis.mget(hashes.map((value) => this.key(value)));
      return values.flatMap((value) =>
        value ? [JSON.parse(value) as IdentitySession] : [],
      );
    }
    return [...this.memory.values()].filter(
      (session) => session.userId === userId && session.expiresAt > Date.now(),
    );
  }

  async revokeById(userId: string, sessionId: string): Promise<boolean> {
    const session = (await this.list(userId)).find(
      (candidate) => candidate.id === sessionId,
    );
    if (!session) return false;
    await this.revoke(session.tokenHash);
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  private key(tokenHash: string): string {
    return `blujet:identity:session:${tokenHash}`;
  }

  private userKey(userId: string): string {
    return `blujet:identity:user-sessions:${userId}`;
  }

  private async ready(): Promise<void> {
    if (!this.redis || this.redis.status === 'ready') return;
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
