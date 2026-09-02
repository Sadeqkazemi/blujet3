import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Thin wrapper around ioredis for the search-result cache (CLAUDE.md: Redis
 * is a cache, never the source of truth for seats/bookings). Every call is
 * try/catch-guarded so a Redis outage degrades to "always miss" instead of
 * taking the API down — search/booking must keep working without it. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL!, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on('error', (err) => {
      this.logger.warn(`Redis error (degrading to cache-miss): ${err.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // cache-miss on next read is an acceptable degradation
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // best-effort — a stale entry just expires on its own via the TTL
    }
  }

  /**
   * Atomic increment with TTL on first write. Returns null when Redis is
   * unavailable so callers can degrade (e.g. skip per-key rate limits).
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      return null;
    }
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
