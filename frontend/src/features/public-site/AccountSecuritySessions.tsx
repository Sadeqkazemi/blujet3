import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { formatLocaleDateTime } from '../../lib/locale-format';
import type { ActiveSession } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  {
    hdr: string;
    current: string;
    end: string;
    ipPrefix: string;
    empty: string;
    now: string;
  }
> = {
  fa: {
    hdr: 'دستگاه‌های متصل',
    current: 'دستگاه فعلی',
    end: 'پایان نشست',
    ipPrefix: 'IP',
    empty: 'نشست فعال دیگری یافت نشد.',
    now: 'هم‌اکنون',
  },
  en: {
    hdr: 'Connected Devices',
    current: 'Current device',
    end: 'End session',
    ipPrefix: 'IP',
    empty: 'No other active sessions.',
    now: 'Now',
  },
  ar: {
    hdr: 'الأجهزة المتصلة',
    current: 'الجهاز الحالي',
    end: 'إنهاء الجلسة',
    ipPrefix: 'IP',
    empty: 'لا توجد جلسات نشطة أخرى.',
    now: 'الآن',
  },
};

interface Props {
  sessions: ActiveSession[];
  busyId: string | null;
  onRevoke: (id: string) => void;
}

export default function AccountSecuritySessions({ sessions, busyId, onRevoke }: Props) {
  const { locale } = useLocale();
  const t = STR[locale];

  return (
    <div
      data-testid="account-sessions"
      style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 16px' }}>{t.hdr}</h3>
      {sessions.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9aa4b2', margin: 0 }}>{t.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              data-testid="account-session-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '1px solid #eef1f5',
                borderRadius: 12,
                padding: '11px 13px',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#f6f8fb',
                  color: '#5a6678',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                  fontSize: 16,
                }}
              >
                {s.isCurrent ? '💻' : '📱'}
              </div>
              <div style={{ flex: 1, lineHeight: 1.5, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.deviceLabel}</div>
                <div style={{ fontSize: 10.5, color: '#9aa4b2' }}>
                  {s.ip ? `${t.ipPrefix}: ${s.ip}` : '—'} ·{' '}
                  {s.isCurrent ? t.now : formatLocaleDateTime(s.createdAt, locale)}
                </div>
              </div>
              {s.isCurrent ? (
                <span
                  data-testid="session-current-badge"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#1f8a5b',
                    background: '#e7f6ee',
                    padding: '4px 10px',
                    borderRadius: 14,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.current}
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={t.end}
                  disabled={busyId === s.id}
                  data-testid={`session-revoke-${s.id}`}
                  onClick={() => onRevoke(s.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#e5484d',
                    background: 'none',
                    border: 'none',
                    cursor: busyId === s.id ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.end}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
