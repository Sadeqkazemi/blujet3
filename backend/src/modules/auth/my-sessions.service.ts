import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { ErrorCode } from '../../common/errors';
import { formatSessionDevice, hashRefreshToken } from './auth-token.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class MySessionsService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async listMine(user: AuthenticatedUser, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken
      ? hashRefreshToken(currentRefreshToken)
      : null;
    const rows = await this.refreshTokenRepo.find({
      where: {
        userId: user.id,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      deviceLabel: formatSessionDevice(row.userAgent),
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isCurrent: currentHash !== null && row.tokenHash === currentHash,
    }));
  }

  async revoke(
    user: AuthenticatedUser,
    sessionId: string,
    currentRefreshToken?: string,
  ) {
    const row = await this.refreshTokenRepo.findOneBy({ id: sessionId });
    if (!row || row.userId !== user.id || row.revokedAt) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'نشست یافت نشد.',
      });
    }
    if (
      currentRefreshToken &&
      row.tokenHash === hashRefreshToken(currentRefreshToken)
    ) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'برای خروج از این دستگاه از دکمه خروج حساب استفاده کنید.',
      });
    }
    await this.refreshTokenRepo.update(
      { id: sessionId },
      { revokedAt: new Date() },
    );
    return { revoked: true };
  }
}
