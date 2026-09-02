import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBackup, fetchBackupSchedule, fetchBackups } from '../../api/it-manager';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { BackupRecord, BackupSchedule } from '../../types/it-manager';

const STATUS: Record<BackupRecord['status'], { label: string; className: string; iconColor: string }> = {
  SUCCESS: {
    label: 'موفق',
    className: 'bg-[rgba(16,185,129,.14)] text-[#34d399]',
    iconColor: '#34d399',
  },
  FAILED: {
    label: 'ناموفق',
    className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]',
    iconColor: '#f87171',
  },
  RUNNING: {
    label: 'در حال اجرا',
    className: 'bg-[#18223a] text-[#9fb0c7]',
    iconColor: '#3b82f6',
  },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return `${faDigits(mb < 1 ? (bytes / 1024).toFixed(0) : mb.toFixed(1))} ${mb < 1 ? 'KB' : 'MB'}`;
}

function DbIcon({ color }: { color: string }) {
  return (
    <span
      className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[#18223a]"
      style={{ color }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    </span>
  );
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([fetchBackups(), fetchBackupSchedule()]);
      setBackups(b);
      setSchedule(s);
    } catch {
      setError('خطا در دریافت نسخه‌های پشتیبان.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lastSuccessLabel = useMemo(() => {
    const success = backups.find((b) => b.status === 'SUCCESS');
    if (!success) return null;
    return formatJalaliDateTime(success.completedAt ?? success.startedAt);
  }, [backups]);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      await createBackup();
      await load();
    } catch {
      setError('خطا در ایجاد نسخه پشتیبان.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-1 text-[20.5px] font-black text-white">پشتیبان‌گیری</h1>
      <p className="mb-6 text-[12.5px] text-[#6b7b94]">نسخه‌های پشتیبان و زمان‌بندی خودکار</p>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold text-white">نسخه‌های پشتیبان</h2>
            <button
              onClick={() => void onCreate()}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-[11px] py-[7px] text-[11.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12M7 10l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              {creating ? 'در حال ایجاد…' : 'پشتیبان جدید'}
            </button>
          </div>
          {!loaded ? (
            <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">در حال بارگذاری…</p>
          ) : backups.length === 0 ? (
            <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">نسخه پشتیبانی ثبت نشده است.</p>
          ) : (
            <ul className="flex flex-col gap-[9px]">
              {backups.map((b) => {
                const st = STATUS[b.status];
                return (
                  <li
                    key={b.id}
                    className="flex items-center gap-[11px] rounded-[11px] border border-[#1f2a3d] px-[11px] py-[11px] text-xs"
                  >
                    <DbIcon color={st.iconColor} />
                    <div className="min-w-0 flex-1 leading-[1.5]">
                      <div className="truncate font-semibold text-[#e7ecf3]">{b.fileName}</div>
                      <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">
                        {formatJalaliDateTime(b.startedAt)} · {formatSize(b.sizeBytes)}
                      </div>
                    </div>
                    <span className={`rounded-full px-[9px] py-[3px] text-[10.5px] font-bold ${st.className}`}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {schedule && (
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="mb-3.5 text-[14.5px] font-extrabold text-white">زمان‌بندی خودکار</h2>
            <div className="flex flex-col gap-[11px] text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">پشتیبان دیتابیس</span>
                <span className="font-bold text-[#34d399]">{schedule.databaseBackup}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">پشتیبان فایل‌ها و تصاویر</span>
                <span className="font-bold text-[#34d399]">{schedule.fileBackup}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">نگهداری نسخه‌ها</span>
                <span className="font-num font-bold text-white">{faDigits(schedule.retentionDays)} روز</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#cdd6e3]">ذخیره‌سازی ابری</span>
                <span className="rounded-full bg-[rgba(16,185,129,.14)] px-[9px] py-[3px] text-[11px] font-bold text-[#34d399]">
                  {schedule.cloudStorage}
                </span>
              </div>
            </div>
            <div className="mt-[18px] rounded-[11px] border border-[#28344c] bg-[#18223a] p-[11px] text-[11px] leading-[1.8] text-[#9fb0c7]">
              آخرین پشتیبان‌گیری موفق:{' '}
              <strong className="text-white">
                {lastSuccessLabel ?? 'هنوز ثبت نشده'}
              </strong>{' '}
              — همه نسخه‌ها رمزنگاری‌شده ذخیره می‌شوند.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
