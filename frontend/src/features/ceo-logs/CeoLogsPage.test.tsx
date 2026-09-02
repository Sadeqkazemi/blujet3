import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CeoLogsPage from './CeoLogsPage';
import * as adminsApi from '../../api/admins';
import type { SystemEventRow } from '../../types/admins';

const ROWS: SystemEventRow[] = [
  {
    id: 'e1',
    at: '2026-07-17T10:42:00.000Z',
    user: 'محمد رحیمی',
    actorRole: 'CEO',
    action: 'تأیید نرخ پیشنهادی پرواز',
    detail: 'قیمت پرواز EP-821 ثبت شد.',
    level: 'OK',
  },
  {
    id: 'e2',
    at: '2026-07-17T09:05:00.000Z',
    user: 'محمد رحیمی',
    actorRole: 'SENIOR_MANAGER',
    action: 'مسدودسازی ورود مدیر',
    detail: 'ورود مدیر IT مسدود شد.',
    level: 'WARN',
  },
];

describe('CeoLogsPage', () => {
  it('renders the real audit rows with level chips', async () => {
    vi.spyOn(adminsApi, 'fetchSystemEvents').mockResolvedValue(ROWS);
    render(<CeoLogsPage />);

    expect(await screen.findByText('لاگ و رویدادها')).toBeInTheDocument();
    expect(screen.getByText('لاگ‌ها و رویدادهای سامانه')).toBeInTheDocument();
    expect(screen.getByText('تأیید نرخ پیشنهادی پرواز')).toBeInTheDocument();
    expect(screen.getByText('موفق')).toBeInTheDocument();
    expect(screen.getByText('هشدار')).toBeInTheDocument();
  });
});
