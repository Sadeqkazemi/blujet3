import { BackupsService } from './backups.service';

describe('BackupsService.schedule', () => {
  it('reports the real policy and explicit null evidence when no dump succeeded', async () => {
    const backupRecordRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new BackupsService(backupRecordRepo as never, {} as never);

    await expect(service.schedule()).resolves.toEqual({
      databaseBackup: 'روزانه ۰۳:۰۰ (cron سرور)',
      fileBackup: 'پیکربندی نشده',
      retentionDays: 7,
      cloudStorage: 'متصل نیست',
      lastSuccessfulBackupAt: null,
      lastSuccessfulBackupFile: null,
    });
    expect(backupRecordRepo.findOne).toHaveBeenCalledWith({
      where: { status: 'SUCCESS' },
      order: { completedAt: 'DESC' },
    });
  });

  it('returns the latest successful dump as operational evidence', async () => {
    const completedAt = new Date('2026-09-06T08:30:00.000Z');
    const backupRecordRepo = {
      findOne: jest.fn().mockResolvedValue({
        completedAt,
        fileName: 'blujet-20260906-083000.sql',
      }),
    };
    const service = new BackupsService(backupRecordRepo as never, {} as never);

    await expect(service.schedule()).resolves.toMatchObject({
      lastSuccessfulBackupAt: completedAt.toISOString(),
      lastSuccessfulBackupFile: 'blujet-20260906-083000.sql',
    });
  });
});
