import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { SmsLog, SmsStatus } from '../database/entities/sms-log.entity';

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}

@Injectable()
export class SmsReportService {
  constructor(
    @InjectRepository(SmsLog)
    private readonly repo: Repository<SmsLog>,
  ) {}

  async report() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [todaySuccessCount, todayFailedCount, recent] = await Promise.all([
      this.repo.count({
        where: {
          status: SmsStatus.SUCCESS,
          createdAt: MoreThanOrEqual(dayStart),
        },
      }),
      this.repo.count({
        where: {
          status: SmsStatus.FAILED,
          createdAt: MoreThanOrEqual(dayStart),
        },
      }),
      this.repo.find({ order: { createdAt: 'DESC' }, take: 50 }),
    ]);
    return {
      todaySuccessCount,
      todayFailedCount,
      recent: recent.map((row) => ({
        id: row.id,
        phoneMasked: maskPhone(row.phone),
        messageType: row.messageType,
        status: row.status,
        failureReason: row.failureReason,
        createdAt: row.createdAt,
      })),
    };
  }
}
