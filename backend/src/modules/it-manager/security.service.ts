import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { SecurityPolicy } from '../../database/entities/security-policy.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { StepUpService } from '../auth/step-up.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { UpdateSecurityPolicyDto } from './dto/security.dtos';

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(SecurityPolicy)
    private readonly policyRepo: Repository<SecurityPolicy>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly audit: AuditService,
    private readonly stepUp: StepUpService,
  ) {}

  /** Auto-creates the id=1 singleton with the design's defaults on first read. */
  async getPolicy() {
    const existing = await this.policyRepo.findOneBy({ id: 1 });
    if (existing) return existing;
    return this.policyRepo.save(
      this.policyRepo.create({ id: 1, updatedAt: new Date() }),
    );
  }

  async updatePolicy(actor: AuthenticatedUser, dto: UpdateSecurityPolicyDto) {
    await this.getPolicy();
    await this.policyRepo.update(
      { id: 1 },
      { ...dto, updatedById: actor.id, updatedAt: new Date() },
    );
    const updated = await findOneOrThrow(this.policyRepo, {
      where: { id: 1 },
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'به‌روزرسانی سیاست رمز عبور',
      detail: `سیاست رمز عبور و امنیت توسط ${actor.fullName} به‌روزرسانی شد.`,
      entityType: 'SecurityPolicy',
      entityId: '1',
    });

    return updated;
  }

  async listSessions() {
    const sessions = await this.refreshTokenRepo.find({
      where: { revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
      select: {
        user: { id: true, fullName: true, role: true },
      },
      order: { createdAt: 'DESC' },
    });
    return sessions.map((s) => ({
      id: s.id,
      who: s.user.fullName,
      role: s.user.role,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /** Revokes every active session site-wide. Only kills the refresh chain —
   * an already-issued 15-minute access token stays valid until it expires
   * naturally (stateless JWT; no blocklist), an accepted, documented limit. */
  async logoutAll(
    actor: AuthenticatedUser,
    stepUpChallengeId: string,
    stepUpCode: string,
  ) {
    await this.stepUp.verify(
      actor,
      stepUpChallengeId,
      stepUpCode,
      'SESSION_REVOKE',
    );
    const result = await this.refreshTokenRepo.update(
      { revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    const revokedCount = result.affected ?? 0;

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SECURITY',
      action: 'خروج اجباری همه نشست‌ها',
      detail: `${actor.fullName} همه نشست‌های فعال (${revokedCount} مورد) را خاتمه داد.`,
      entityType: 'RefreshToken',
    });

    return { revokedCount };
  }
}
