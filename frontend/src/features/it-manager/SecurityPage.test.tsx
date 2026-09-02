import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SecurityPage from './SecurityPage';
import * as itApi from '../../api/it-manager';
import * as authApi from '../../api/auth';
import type { ActiveSession, SecurityPolicy } from '../../types/it-manager';

const POLICY: SecurityPolicy = {
  id: 1,
  minLength: 10,
  expiryDays: 90,
  maxAttempts: 5,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
  blockReuse: true,
  staffTwoFactorMandatory: true,
  updatedAt: '2026-07-17T00:00:00.000Z',
};

const SESSIONS: ActiveSession[] = [
  { id: 's1', who: 'محمد رحیمی', role: 'SENIOR_MANAGER', userAgent: null, ip: '10.0.0.1', createdAt: '', expiresAt: '' },
];

describe('SecurityPage', () => {
  it('renders policy toggles, params and active sessions; confirms before logging everyone out', async () => {
    vi.spyOn(itApi, 'fetchSecurityPolicy').mockResolvedValue(POLICY);
    vi.spyOn(itApi, 'fetchActiveSessions').mockResolvedValue(SESSIONS);
    vi.spyOn(authApi, 'requestStepUp').mockResolvedValue({ challengeId: 'ch1' });
    const logoutAllSpy = vi.spyOn(itApi, 'logoutAllSessions').mockResolvedValue({ revokedCount: 1 });

    render(<SecurityPage />);
    expect(await screen.findByText('احراز هویت دومرحله‌ای')).toBeInTheDocument();
    expect(screen.getByText('۱۰ کاراکتر')).toBeInTheDocument();
    expect(screen.getByText('محمد رحیمی', { exact: false })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'خروج همه' }));
    const dialog = screen.getByRole('dialog', { name: 'خروج اجباری همه نشست‌ها' });
    expect(dialog).toBeInTheDocument();
    expect(logoutAllSpy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'خروج همه' }));

    const stepUpDialog = await screen.findByRole('dialog', { name: 'تأیید مجدد هویت' });
    await user.type(within(stepUpDialog).getByRole('textbox'), '482913');
    await user.click(within(stepUpDialog).getByRole('button', { name: 'تأیید' }));

    await waitFor(() =>
      expect(logoutAllSpy).toHaveBeenCalledWith({ stepUpChallengeId: 'ch1', stepUpCode: '482913' }),
    );
  });

  it('toggling a policy switch calls the update endpoint with the flipped value', async () => {
    vi.spyOn(itApi, 'fetchSecurityPolicy').mockResolvedValue(POLICY);
    vi.spyOn(itApi, 'fetchActiveSessions').mockResolvedValue([]);
    const updateSpy = vi.spyOn(itApi, 'updateSecurityPolicy').mockResolvedValue({ ...POLICY, requireSymbol: false });

    render(<SecurityPage />);
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: 'الزام کاراکتر ویژه' });
    await user.click(toggle);

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ requireSymbol: false }));
  });
});
