import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaAdminPage from './MediaAdminPage';
import * as siteContentApi from '../../api/site-content';
import * as adminsApi from '../../api/admins';

vi.mock('../../api/site-content');
vi.mock('../../api/files', () => ({
  uploadFile: vi.fn(),
}));

const mockBlocks = [
  {
    key: 'HERO_BANNER' as const,
    enabled: true,
    title: 'پرواز بعدی‌ات را با blujet رزرو کن',
    subtitle: 'بیش از ۲۰۰ مقصد',
    buttonText: 'مشاهده',
    badgeText: 'کش‌بک ۵٪',
    imageFileId: null,
    imageUrl: null,
  },
  {
    key: 'ANNOUNCEMENT_BAR' as const,
    enabled: true,
    title: 'اطلاعیه تست',
    subtitle: 'دستورالعمل کامل آژانس',
    buttonText: 'مشاهده',
    badgeText: '',
    imageFileId: null,
    imageUrl: null,
  },
  {
    key: 'PROMO_BANNER' as const,
    enabled: true,
    title: 'تا ۴۰٪ تخفیف',
    subtitle: 'رزرو تا پایان مرداد',
    buttonText: 'مشاهده پروازها',
    badgeText: 'حراج تابستانه',
    imageFileId: null,
    imageUrl: null,
  },
];

const mockDestinations = [
  {
    id: 'd1',
    airportCode: 'IST',
    priceIrr: '42000000',
    imageFileId: null,
    sortOrder: 0,
  },
];

const mockRoutes = [
  {
    id: 'r1',
    fromAirportCode: 'THR',
    toAirportCode: 'MHD',
    priceIrr: '16000000',
    sortOrder: 0,
  },
];

const mockLibrary = [
  {
    id: 'asset-1',
    label: 'hero.jpg',
    fileName: 'hero.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    fileId: 'file-1',
    url: '/api/files/file-1',
    createdAt: '2026-08-14T00:00:00.000Z',
  },
];

const mockSocial = [
  { id: 'instagram' as const, name: 'اینستاگرام', url: 'instagram.com/blujet', enabled: true },
  { id: 'telegram' as const, name: 'تلگرام', url: 't.me/blujet', enabled: true },
  { id: 'whatsapp' as const, name: 'واتساپ', url: '', enabled: false },
  { id: 'linkedin' as const, name: 'لینکدین', url: '', enabled: false },
  { id: 'x' as const, name: 'ایکس', url: '', enabled: false },
];

const mockApps = [
  { id: 'google_play' as const, name: 'گوگل پلی', url: 'https://play.google.com' },
  { id: 'app_store' as const, name: 'اپ استور', url: 'https://apps.apple.com' },
  { id: 'bazaar_myket' as const, name: 'کافه بازار', url: 'https://cafebazaar.ir' },
];

describe('MediaAdminPage', () => {
  beforeEach(() => {
    vi.mocked(siteContentApi.fetchLibraryAssets).mockResolvedValue([]);
    vi.mocked(siteContentApi.fetchContentBlocks).mockResolvedValue(mockBlocks);
    vi.mocked(siteContentApi.fetchDestinations).mockResolvedValue(mockDestinations);
    vi.mocked(siteContentApi.fetchRoutes).mockResolvedValue(mockRoutes);
    vi.mocked(siteContentApi.updateContentBlock).mockResolvedValue(mockBlocks[0]);
    vi.mocked(siteContentApi.updateDestination).mockResolvedValue(mockDestinations[0]);
    vi.mocked(siteContentApi.createDestination).mockResolvedValue(mockDestinations[0]);
    vi.mocked(siteContentApi.updateRoute).mockResolvedValue(mockRoutes[0]);
    vi.mocked(siteContentApi.createRoute).mockResolvedValue(mockRoutes[0]);
    vi.mocked(siteContentApi.deleteDestination).mockResolvedValue({ id: 'd1' });
    vi.spyOn(adminsApi, 'fetchSettings').mockResolvedValue({
      settings: {
        homeHeroTitle: 'عنوان',
        homeHeroSubtitle: 'زیرعنوان',
        aboutUsText: 'درباره blujet',
        contactAddress: 'تهران',
        termsText: 'قوانین',
        supportPhone: '021-91000000',
        supportEmail: 'support@blujet.ir',
        socialLinks: mockSocial,
        appDownloadLinks: mockApps,
      },
      refundRules: [],
    });
    vi.spyOn(adminsApi, 'updateSettings').mockResolvedValue({
      settings: {
        homeHeroTitle: 'عنوان',
        homeHeroSubtitle: 'زیرعنوان',
        aboutUsText: 'متن جدید',
        contactAddress: 'تهران',
        termsText: 'قوانین',
        supportPhone: '021-91000000',
        supportEmail: 'support@blujet.ir',
        socialLinks: mockSocial,
        appDownloadLinks: mockApps,
      },
      refundRules: [],
    });
  });

  it('renders page title and design CMS sections including links', async () => {
    render(<MediaAdminPage />);
    expect(await screen.findByText('مدیریت سایت')).toBeInTheDocument();
    expect(screen.getByText('بنر اصلی سایت')).toBeInTheDocument();
    expect(screen.getByText('نوار اطلاعیه سایت')).toBeInTheDocument();
    expect(screen.getByText('دستورالعمل کامل آژانس')).toBeInTheDocument();
    expect(screen.getByText('بنر تبلیغاتی میانی')).toBeInTheDocument();
    expect(screen.getByText('مقاصد محبوب')).toBeInTheDocument();
    expect(screen.getByText('مسیرهای پرتردد')).toBeInTheDocument();
    expect(screen.getByText('لینک دانلود اپلیکیشن')).toBeInTheDocument();
    expect(screen.getByText('شبکه‌های اجتماعی')).toBeInTheDocument();
    expect(screen.getByText('تماس پشتیبانی')).toBeInTheDocument();
    expect(screen.getByText('کتابخانهٔ تصاویر')).toBeInTheDocument();
    expect(screen.queryByText('مدیریت بلاگ')).not.toBeInTheDocument();
    expect(screen.getByText('فرصت‌های شغلی')).toBeInTheDocument();
  });

  it('shows seeded destination, route and support contact', async () => {
    render(<MediaAdminPage />);
    expect(await screen.findByText('IST')).toBeInTheDocument();
    expect(screen.getByText(/THR ← MHD/)).toBeInTheDocument();
    expect(screen.getByText('021-91000000')).toBeInTheDocument();
  });

  it('keeps route creation available from site management', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    await screen.findByTestId('create-route-button');

    await user.click(screen.getByTestId('create-route-button'));
    await user.type(screen.getByTestId('route-origin-input'), 'thr');
    await user.type(screen.getByTestId('route-destination-input'), 'mhd');
    await user.type(screen.getByTestId('route-price-input'), '1600000');
    await user.click(screen.getByTestId('save-route-button'));

    await waitFor(() => {
      expect(siteContentApi.createRoute).toHaveBeenCalledWith({
        fromAirportCode: 'THR',
        toAirportCode: 'MHD',
        priceIrr: 16000000,
      });
    });
  });

  it('opens hero banner editor', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    await screen.findByText('بنر اصلی سایت');
    await user.click(screen.getAllByRole('button', { name: 'ویرایش بنر' })[0]);
    expect(screen.getByDisplayValue('پرواز بعدی‌ات را با blujet رزرو کن')).toBeInTheDocument();
  });

  it('assigns an uploaded library image to the hero banner', async () => {
    const user = userEvent.setup();
    vi.mocked(siteContentApi.fetchLibraryAssets).mockResolvedValue(mockLibrary);
    render(<MediaAdminPage />);
    await screen.findByText('بنر اصلی سایت');

    await user.click(screen.getAllByRole('button', { name: 'ویرایش بنر' })[0]);
    await user.click(screen.getByRole('button', { name: 'انتخاب تصویر hero.jpg' }));
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => {
      expect(siteContentApi.updateContentBlock).toHaveBeenCalledWith(
        'HERO_BANNER',
        expect.objectContaining({ imageFileId: 'file-1' }),
      );
    });
  });

  it('assigns an uploaded library image when creating a destination', async () => {
    const user = userEvent.setup();
    vi.mocked(siteContentApi.fetchLibraryAssets).mockResolvedValue(mockLibrary);
    render(<MediaAdminPage />);
    await screen.findByText('مقاصد محبوب');

    await user.click(screen.getByRole('button', { name: /افزودن مقصد/ }));
    await user.type(screen.getByLabelText('کد فرودگاه'), 'dxb');
    await user.type(screen.getByLabelText('قیمت (تومان)'), '2500000');
    await user.click(screen.getByRole('button', { name: 'انتخاب تصویر hero.jpg' }));
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => {
      expect(siteContentApi.createDestination).toHaveBeenCalledWith({
        airportCode: 'DXB',
        priceIrr: 25000000,
        imageFileId: 'file-1',
      });
    });
  });

  it('toggles announcement bar with design deactivate label', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    await screen.findByText('نوار اطلاعیه سایت');
    await user.click(screen.getByRole('button', { name: 'غیرفعال کردن' }));
    await waitFor(() => {
      expect(siteContentApi.updateContentBlock).toHaveBeenCalledWith('ANNOUNCEMENT_BAR', {
        enabled: false,
      });
    });
  });

  it('allows the site admin to edit the public-site announcement bar', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    await screen.findByText('نوار اطلاعیه سایت');

    await user.click(screen.getByTestId('edit-agency-announcement'));
    expect(screen.getByDisplayValue('دستورالعمل کامل آژانس')).toBeInTheDocument();
  });

  it('requires an in-app confirmation before deleting a destination', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    await screen.findByText('IST');

    await user.click(screen.getAllByRole('button', { name: 'حذف' })[0]);
    expect(screen.getByTestId('delete-site-content-dialog')).toHaveTextContent('IST');
    expect(siteContentApi.deleteDestination).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('delete-site-content-dialog-confirm'));
    await waitFor(() => expect(siteContentApi.deleteDestination).toHaveBeenCalledWith('d1'));
  });

  it('lists site pages and saves edited about text', async () => {
    const user = userEvent.setup();
    render(<MediaAdminPage />);
    expect(await screen.findByText('صفحات سایت')).toBeInTheDocument();
    expect(screen.getByText('درباره ما')).toBeInTheDocument();
    await user.click(screen.getByTestId('edit-site-page-about'));
    const textarea = screen.getByDisplayValue('درباره blujet');
    await user.clear(textarea);
    await user.type(textarea, 'متن جدید');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => {
      expect(adminsApi.updateSettings).toHaveBeenCalledWith({ aboutUsText: 'متن جدید' });
    });
  });
});
