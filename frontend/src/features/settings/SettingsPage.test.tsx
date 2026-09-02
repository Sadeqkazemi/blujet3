import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';
import * as adminsApi from '../../api/admins';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { Role } from '../../types/auth';
import type { SettingsResult } from '../../types/admins';
import type { SocialLinkEntry } from '../../types/social-links';
import type { AppDownloadLinkEntry } from '../../types/app-links';
import { APP_LINK_IDS } from '../../types/app-links';

const DEFAULT_SOCIAL_LINKS: SocialLinkEntry[] = [
  { id: 'instagram', name: 'اینستاگرام', url: '', enabled: false },
  { id: 'telegram', name: 'تلگرام', url: '', enabled: false },
  { id: 'whatsapp', name: 'واتساپ', url: '', enabled: false },
  { id: 'linkedin', name: 'لینکدین', url: '', enabled: false },
  { id: 'x', name: 'ایکس (توییتر)', url: '', enabled: false },
];

const DEFAULT_APP_LINKS: AppDownloadLinkEntry[] = APP_LINK_IDS.map((id) => ({
  id,
  name: id === 'app_store' ? 'App Store' : id === 'google_play' ? 'Google Play' : 'بازار / مایکت',
  url: '',
}));

const DATA: SettingsResult = {
  settings: {
    companyName: 'هواپیمایی blujet',
    supportEmail: 'support@blujet.example',
    supportPhone: '021-48000',
    gatewayMellat: true,
    gatewaySaman: true,
    gatewayZarin: false,
    maintenance: false,
    registration: true,
    charterSale: true,
    apiPublic: false,
    sandbox: true,
    brandColor: '#1668c4',
    homeHeroTitle: 'پرواز به هر کجا که دوست دارید',
    homeHeroSubtitle: 'بهترین قیمت بلیط هواپیما را با blujet پیدا کنید',
    aboutUsText: 'blujet یک پلتفرم آنلاین رزرو بلیط هواپیما است.',
    contactAddress: 'تهران، ایران',
    termsText: 'قوانین و مقررات استفاده از خدمات blujet.',
    socialLinks: DEFAULT_SOCIAL_LINKS,
    appDownloadLinks: DEFAULT_APP_LINKS,
  },
  refundRules: [
    { id: 'r1', minHoursBeforeDeparture: 72, penaltyPct: 30, labelFa: 'بیش از ۷۲ ساعت مانده به پرواز' },
  ],
};

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('SettingsPage', () => {
  it('IT_MANAGER sees operational toggles (not company/gateways) and saving persists a toggle', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(adminsApi, 'fetchSettings').mockResolvedValue(DATA);
    const updateSpy = vi.spyOn(adminsApi, 'updateSettings').mockResolvedValue(DATA);

    render(<SettingsPage />);
    expect(await screen.findByText('تنظیمات کلی سامانه')).toBeInTheDocument();
    expect(screen.queryByText('اطلاعات شرکت')).not.toBeInTheDocument();
    expect(screen.queryByText('درگاه پرداخت')).not.toBeInTheDocument();
    expect(screen.getByText('قوانین استرداد')).toBeInTheDocument();
    expect(screen.getByText('تماس پشتیبانی')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'حالت تعمیر و نگهداری' }));
    await user.click(screen.getByRole('button', { name: 'ذخیره تنظیمات' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          maintenance: true,
          socialLinks: expect.any(Array),
          supportPhone: expect.any(String),
        }),
      ),
    );
    expect(updateSpy.mock.calls[0]?.[0]).not.toHaveProperty('companyName');
    expect(updateSpy.mock.calls[0]?.[0]).not.toHaveProperty('gatewayMellat');
  });

  it('IT_MANAGER can save an enabled social link', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(adminsApi, 'fetchSettings').mockResolvedValue(DATA);
    const updateSpy = vi.spyOn(adminsApi, 'updateSettings').mockResolvedValue(DATA);

    render(<SettingsPage />);
    expect(await screen.findByText('شبکه‌های اجتماعی')).toBeInTheDocument();

    const user = userEvent.setup();
    const urlInput = screen.getByLabelText('آدرس اینستاگرام');
    await user.type(urlInput, 'instagram.com/blujet');
    await user.click(screen.getByRole('switch', { name: 'اینستاگرام' }));
    await user.click(screen.getByRole('button', { name: 'ذخیره تنظیمات' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: expect.arrayContaining([
            expect.objectContaining({
              id: 'instagram',
              url: 'instagram.com/blujet',
              enabled: true,
            }),
          ]),
        }),
      ),
    );
  });

  it('SITE_ADMIN sees support contact and app link fields', async () => {
    mockRole('SITE_ADMIN');
    vi.spyOn(adminsApi, 'fetchSettings').mockResolvedValue(DATA);

    render(<SettingsPage />);
    expect(await screen.findByText('تماس پشتیبانی')).toBeInTheDocument();
    expect(screen.getByText('لینک دانلود اپلیکیشن')).toBeInTheDocument();
    expect(screen.getByLabelText('شماره تلفن پشتیبانی')).toHaveValue('021-48000');
    expect(screen.queryByText('اطلاعات شرکت')).not.toBeInTheDocument();
  });
});
