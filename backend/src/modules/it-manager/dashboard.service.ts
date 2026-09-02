import { Injectable } from '@nestjs/common';
import * as os from 'node:os';
import { readFile } from 'node:fs/promises';
import { statfs } from 'node:fs/promises';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { InternalService } from '../../database/entities/internal-service.entity';
import { BackupRecord } from '../../database/entities/backup-record.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { ExternalServiceConfig } from '../../database/entities/external-service-config.entity';

@Injectable()
export class ItDashboardService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(InternalService)
    private readonly internalServiceRepo: Repository<InternalService>,
    @InjectRepository(BackupRecord)
    private readonly backupRecordRepo: Repository<BackupRecord>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(ExternalServiceConfig)
    private readonly externalServiceConfigRepo: Repository<ExternalServiceConfig>,
  ) {}

  private async diskUsedPct(): Promise<number | null> {
    try {
      const stats = await statfs('/');
      if (!stats.blocks) return null;
      const used = stats.blocks - stats.bfree;
      return Math.round((used / stats.blocks) * 1000) / 10;
    } catch {
      return null;
    }
  }

  /** Sample /proc/net/dev on Linux — relative utilization, not synthetic. */
  private async readNetworkBytes(): Promise<number | null> {
    if (process.platform !== 'linux') return null;
    try {
      const raw = await readFile('/proc/net/dev', 'utf8');
      let total = 0;
      for (const line of raw.split('\n').slice(2)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const iface = parts[0]?.replace(':', '') ?? '';
        if (iface === 'lo') continue;
        total += Number(parts[1]) + Number(parts[9]);
      }
      return total;
    } catch {
      return null;
    }
  }

  private async bandwidthUsedPct(): Promise<number | null> {
    const start = await this.readNetworkBytes();
    if (start === null) return null;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const end = await this.readNetworkBytes();
    if (end === null) return null;
    const bytesPerSec = Math.max(0, (end - start) / 0.2);
    // Normalize against 100 Mbps (~12.5 MB/s) as a display ceiling.
    const cap = 12.5 * 1024 * 1024;
    return Math.min(100, Math.round((bytesPerSec / cap) * 1000) / 10);
  }

  async get() {
    const [
      activeSessions,
      internalServices,
      lastBackup,
      recentEvents,
      securityAlerts,
    ] = await Promise.all([
      this.refreshTokenRepo.count({
        where: { revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      }),
      this.internalServiceRepo.find(),
      this.backupRecordRepo.findOne({
        where: {},
        order: { startedAt: 'DESC' },
      }),
      this.auditLogRepo.find({
        where: {
          category: In(['SYSTEM', 'ACCOUNT', 'ACCESS', 'SECURITY']),
        },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.auditLogRepo.count({
        where: {
          category: 'SECURITY',
          createdAt: MoreThanOrEqual(
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          ),
        },
      }),
    ]);
    const external = await this.externalServiceConfigRepo.find();
    const [diskUsedPct, bandwidthUsedPct] = await Promise.all([
      this.diskUsedPct(),
      this.bandwidthUsedPct(),
    ]);

    const servicesUp =
      internalServices.filter((s) => s.enabled).length +
      external.filter((s) => s.enabled).length;
    const servicesTotal = internalServices.length + external.length;

    const uptime30dPct =
      internalServices.length > 0
        ? Math.round(
            (internalServices.reduce((sum, s) => sum + s.uptimePct, 0) /
              internalServices.length) *
              100,
          ) / 100
        : 0;

    const cpuCount = os.cpus().length;
    const loadAvg1m = os.loadavg()[0];
    const cpuUsedPct = Math.min(
      100,
      Math.round(
        ((loadAvg1m / Math.max(cpuCount, 1)) * 100 + Number.EPSILON) * 10,
      ) / 10,
    );
    const memoryUsedPct =
      Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 1000) / 10;

    const allServicesHealthy =
      servicesTotal > 0 &&
      internalServices.every((service) => service.enabled) &&
      external.every((service) => service.enabled);

    return {
      kpis: {
        servicesUp,
        servicesTotal,
        uptime30dPct,
        activeSessions,
        securityAlerts,
        allServicesHealthy,
        lastBackupStatus: lastBackup?.status ?? null,
        lastBackupAt: lastBackup?.startedAt ?? null,
      },
      serviceHealth: internalServices.slice(0, 6).map((s) => ({
        name: s.nameFa,
        uptimePct: s.uptimePct,
        enabled: s.enabled,
      })),
      resources: {
        cpuUsedPct,
        memoryUsedPct,
        diskUsedPct,
        bandwidthUsedPct,
        loadAvg1m,
        cpuCount,
        uptimeSeconds: os.uptime(),
      },
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        text: e.detail,
        category: e.category,
        createdAt: e.createdAt,
      })),
    };
  }
}
