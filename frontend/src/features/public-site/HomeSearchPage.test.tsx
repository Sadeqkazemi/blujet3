import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HomeSearchPage from './HomeSearchPage';
import * as publicSiteApi from '../../api/publicSite';
import * as siteContentApi from '../../api/site-content';
import * as settingsApi from '../../api/settings';
import * as useAuthModule from '../../hooks/useAuth';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import * as useLocaleModule from '../../hooks/useLocale';

const AIRPORTS = [
  { id: 'a1', code: 'THR', cityFa: 'تهران', airportNameFa: 'فرودگاه بین‌المللی مهرآباد', tz: 'Asia/Tehran', isInternational: false },
  { id: 'a2', code: 'MHD', cityFa: 'مشهد', airportNameFa: 'فرودگاه بین‌المللی شهید هاشمی‌نژاد', tz: 'Asia/Tehran', isInternational: false },
  { id: 'a3', code: 'KIH', cityFa: 'کیش', airportNameFa: 'فرودگاه بین‌المللی کیش', tz: 'Asia/Tehran', isInternational: false },
  { id: 'a4', code: 'IKA', cityFa: 'تهران', airportNameFa: 'فرودگاه بین‌المللی امام خمینی', tz: 'Asia/Tehran', isInternational: false },
  { id: 'a5', code: 'DXB', cityFa: 'دبی', airportNameFa: 'فرودگاه بین‌المللی دبی', tz: 'Asia/Dubai', isInternational: true },
  { id: 'a6', code: 'ADU', cityFa: 'اردبیل', airportNameFa: 'فرودگاه اردبیل', tz: 'Asia/Tehran', isInternational: false },
  { id: 'a7', code: 'QDQ', cityFa: 'شهر آزمایش الف', airportNameFa: 'فرودگاه آزمایشی', tz: 'Asia/Tehran', isInternational: true },
];

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

function mockDesktop() {
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
}

function mockMobile() {
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
}

function mockHomeApis(priceCenterIso = new Date().toISOString().slice(0, 10)) {
  vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
  vi.spyOn(publicSiteApi, 'fetchSearchCabins').mockResolvedValue(['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST']);
  vi.spyOn(publicSiteApi, 'fetchPriceCalendar').mockResolvedValue([
    { date: priceCenterIso, minPriceIrr: '38000000', dateLabelFa: priceCenterIso, isCenter: true },
    { date: '2026-08-02', minPriceIrr: '0', dateLabelFa: '2026-08-02', isCenter: false },
    { date: '2026-08-03', minPriceIrr: '35000000', dateLabelFa: '2026-08-03', isCenter: false },
  ]);
  vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
  vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({
    links: [{ id: 'app_store', name: 'App Store', url: 'https://apps.apple.com/blujet' }],
  });
}

function renderPage() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <HomeSearchPage />
    </MemoryRouter>,
  );
}

async function pickAirport(testId: 'home-origin' | 'home-dest', code: string) {
  await userEvent.click(screen.getByTestId(testId));
  await userEvent.click(screen.getByTestId(`airport-option-${code}`));
}

const CMS_HOME = {
  blocks: [
    {
      key: 'HERO_BANNER' as const,
      enabled: true,
      title: 'عنوان CMS',
      subtitle: 'زیرعنوان CMS',
      buttonText: 'جستجو',
      badgeText: 'برچسب CMS',
      imageFileId: null,
      imageUrl: null,
    },
    {
      key: 'ANNOUNCEMENT_BAR' as const,
      enabled: true,
      title: 'اطلاعیه CMS',
      subtitle: '',
      buttonText: 'جزئیات',
      badgeText: '',
      imageFileId: null,
      imageUrl: null,
    },
    {
      key: 'PROMO_BANNER' as const,
      enabled: true,
      title: 'پromo CMS',
      subtitle: 'توضیح promo',
      buttonText: 'رزرو',
      badgeText: 'ویژه CMS',
      imageFileId: null,
      imageUrl: null,
    },
  ],
  destinations: [
    { airportCode: 'DXB', cityFa: 'دبی', priceIrr: '38000000', imageUrl: null },
  ],
  routes: [
    {
      fromAirportCode: 'THR',
      toAirportCode: 'MHD',
      fromCityFa: 'تهران',
      toCityFa: 'مشهد',
      priceIrr: '16000000',
    },
  ],
};

describe('HomeSearchPage', () => {
  it('separates domestic airports from international search airports', async () => {
    mockLocale('fa');
    mockDesktop();
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');

    await userEvent.click(screen.getByTestId('home-origin'));
    expect(screen.getByTestId('airport-option-THR')).toBeInTheDocument();
    expect(screen.getByTestId('airport-option-IKA')).toBeInTheDocument();
    expect(screen.getByTestId('airport-option-ADU')).toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-DXB')).not.toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-QDQ')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('home-origin'));
    await userEvent.click(screen.getByRole('button', { name: 'پرواز خارجی' }));
    await userEvent.click(screen.getByTestId('home-origin'));
    expect(screen.queryByTestId('airport-option-THR')).not.toBeInTheDocument();
    expect(screen.getByTestId('airport-option-IKA')).toBeInTheDocument();
    expect(screen.getByTestId('airport-option-DXB')).toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-ADU')).not.toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-QDQ')).not.toBeInTheDocument();
  });

  it('shows every cabin currently activated by Commercial flight inventory', async () => {
    mockDesktop();
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(publicSiteApi, 'fetchSearchCabins').mockResolvedValue(['ECONOMY', 'COMFORT', 'FIRST']);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({ links: [] });

    renderPage();

    expect(await screen.findByTestId('home-cabin-COMFORT')).toHaveTextContent('کامفورت');
    expect(screen.getByTestId('home-cabin-FIRST')).toHaveTextContent('فرست کلاس');
    expect(screen.queryByTestId('home-cabin-BUSINESS')).not.toBeInTheDocument();
  });

  it('renders RTL search form with airports loaded', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({
      links: [{ id: 'app_store', name: 'App Store', url: 'https://apps.apple.com/blujet' }],
    });
    renderPage();

    expect(await screen.findByTestId('home-origin')).toBeInTheDocument();
    expect(screen.getByTestId('home-origin')).toHaveTextContent('شهر مبدا');
    expect(screen.getByTestId('home-dest')).toHaveTextContent('شهر مقصد');
    expect(screen.getByTestId('home-search-submit')).toBeInTheDocument();
    expect(document.getElementById('search-card')).toBeInTheDocument();
  });

  it('shows a validation error when submitted without selections', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({
      links: [{ id: 'app_store', name: 'App Store', url: 'https://apps.apple.com/blujet' }],
    });
    renderPage();
    await screen.findByTestId('home-origin');

    await userEvent.click(screen.getByTestId('home-search-submit'));
    expect(screen.getByText('مبدأ، مقصد و تاریخ را انتخاب کنید.')).toBeInTheDocument();
  });

  it('renders CMS-driven marketing sections when home content loads', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({
      links: [{ id: 'app_store', name: 'App Store', url: 'https://apps.apple.com/blujet' }],
    });
    renderPage();
    await screen.findByTestId('home-origin');

    expect(screen.getByText('عنوان CMS')).toBeInTheDocument();
    expect(screen.getByText('اطلاعیه CMS')).toBeInTheDocument();
    expect(screen.getByText('پromo CMS')).toBeInTheDocument();
    expect(screen.getByTestId('popular-dest-DXB')).toBeInTheDocument();
    expect(screen.getByTestId('popular-route-MHD')).toBeInTheDocument();
    expect(screen.getByText('با رسیدن به حد امتیاز، کارت عضویت بگیر')).toBeInTheDocument();
    const appStore = screen.getByTestId('app-link-app_store');
    expect(appStore.tagName).toBe('A');
    expect(appStore).toHaveAttribute('href', 'https://apps.apple.com/blujet');
  });

  it('does not fabricate prices, promotions, or notices when CMS fetch fails', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockRejectedValue(new Error('offline'));
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({ links: [] });
    renderPage();
    await screen.findByTestId('home-origin');

    expect(screen.queryByText('پیشنهادهای ویژه')).not.toBeInTheDocument();
    expect(screen.queryByText('تا ۴۰٪ تخفیف روی پروازهای خارجی')).not.toBeInTheDocument();
    expect(screen.queryByText('مقصدهای محبوب')).not.toBeInTheDocument();
    expect(screen.queryByText(/اطلاعیه مهم/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('popular-dest-DXB')).not.toBeInTheDocument();
    expect(screen.queryByTestId('popular-route-MHD')).not.toBeInTheDocument();
    expect(screen.getByText('با رسیدن به حد امتیاز، کارت عضویت بگیر')).toBeInTheDocument();
    expect(screen.getByText('سفرت را همراه خودت ببر')).toBeInTheDocument();
  });

  it('shows selected city names in origin and destination fields', async () => {
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');

    await pickAirport('home-origin', 'THR');
    await pickAirport('home-dest', 'MHD');

    expect(screen.getByTestId('home-origin')).toHaveTextContent('تهران');
    expect(screen.getByTestId('home-dest')).toHaveTextContent('مشهد');
  });

  it('shows real fares inside the mobile departure-date calendar only', async () => {
    mockLocale('fa');
    mockMobile();
    const priceDate = new Date().toISOString().slice(0, 10);
    mockHomeApis(priceDate);
    renderPage();
    await screen.findByTestId('home-origin');

    expect(screen.queryByTestId('home-price-calendar-wrap')).not.toBeInTheDocument();

    await pickAirport('home-origin', 'THR');
    await pickAirport('home-dest', 'MHD');

    expect(screen.queryByTestId('home-price-calendar-wrap')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('home-date'));
    await waitFor(() => {
      expect(screen.getByTestId(`home-date-price-${priceDate}`)).toBeInTheDocument();
    });
    expect(publicSiteApi.fetchPriceCalendar).toHaveBeenCalled();
    expect(screen.getByTestId('home-date-confirm')).toBeInTheDocument();
  });

  it('keeps the mobile price calendar inside the real visual viewport', async () => {
    const viewport = new EventTarget() as VisualViewport;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 640 },
      width: { configurable: true, value: 390 },
      offsetTop: { configurable: true, value: 20 },
      offsetLeft: { configurable: true, value: 12 },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

    mockLocale('fa');
    mockMobile();
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');

    await pickAirport('home-origin', 'THR');
    await pickAirport('home-dest', 'MHD');
    await userEvent.click(screen.getByTestId('home-date'));

    const popup = screen.getByTestId('home-date-popup');
    expect(popup.parentElement).toBe(document.body);
    expect(popup).toHaveAttribute('role', 'dialog');
    expect(popup).toHaveStyle({
      position: 'fixed',
      top: '71px',
      left: '12px',
      width: '390px',
      height: '589px',
      maxHeight: '589px',
      borderRadius: '22px 22px 0 0',
    });
    expect(screen.getByTestId('home-date-mobile-close')).toBeInTheDocument();
    expect(screen.getByTestId('home-date-day-1')).toHaveStyle({ minHeight: '44px' });
  });

  it('finds cities using Persian/Arabic character variants and Latin aliases', async () => {
    mockLocale('fa');
    mockMobile();
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');

    await userEvent.click(screen.getByTestId('home-origin'));
    const searchInput = screen.getByTestId('home-origin-search');
    await userEvent.type(searchInput, 'كيش');
    expect(screen.getByTestId('airport-option-KIH')).toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'mashhad');
    expect(screen.getByTestId('airport-option-MHD')).toBeInTheDocument();
  });

  it('does not invent airports while the airports API is pending', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockReturnValue(new Promise(() => {}));
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({ links: [] });
    renderPage();
    await screen.findByTestId('home-origin');

    await userEvent.click(screen.getByTestId('home-origin'));
    expect(screen.queryByTestId('airport-option-THR')).not.toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-MHD')).not.toBeInTheDocument();
  });

  it('blocks destination picker until origin is chosen', async () => {
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');

    await userEvent.click(screen.getByTestId('home-dest'));
    expect(screen.queryByTestId('airport-option-MHD')).not.toBeInTheDocument();
    expect(screen.getByText('ابتدا مبدا را انتخاب کنید')).toBeInTheDocument();
  });

  it('removes the selected origin from the destination choices', async () => {
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue(CMS_HOME);
    vi.spyOn(settingsApi, 'fetchPublicAppLinks').mockResolvedValue({
      links: [{ id: 'app_store', name: 'App Store', url: 'https://apps.apple.com/blujet' }],
    });
    renderPage();
    await screen.findByTestId('home-origin');

    await pickAirport('home-origin', 'THR');
    await userEvent.click(screen.getByTestId('home-dest'));
    expect(screen.queryByTestId('airport-option-THR')).not.toBeInTheDocument();
    expect(screen.queryByTestId('airport-option-IKA')).not.toBeInTheDocument();
    expect(screen.getByTestId('airport-option-MHD')).toBeInTheDocument();
  });

  it('renders translated marketing sections and Latin-digit toman prices in English', async () => {
    mockLocale('en');
    mockDesktop();
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue({
      ...CMS_HOME,
      routes: CMS_HOME.routes.map((route) => ({
        ...route,
        fromAirportCode: 'تهران',
        toAirportCode: 'مشهد',
      })),
      blocks: CMS_HOME.blocks.map((b) =>
        b.key === 'HERO_BANNER'
          ? { ...b, title: 'Book your next flight with blujet', badgeText: 'Up to 5% cashback' }
          : b.key === 'PROMO_BANNER'
            ? { ...b, title: 'Up to 40% off international flights', badgeText: 'blujet Summer Sale' }
            : b,
      ),
    });
    renderPage();
    await screen.findByTestId('home-origin');

    expect(screen.getByText('Book your next flight with blujet')).toBeInTheDocument();
    expect(screen.getByText('Up to 40% off international flights')).toBeInTheDocument();
    expect(screen.getByText('Popular Destinations')).toBeInTheDocument();
    expect(screen.getByText('Take your trip with you')).toBeInTheDocument();
    expect(screen.getByTestId('popular-route-MHD')).toHaveTextContent('1,600,000');
    expect(screen.getByTestId('popular-route-MHD')).toHaveTextContent('Tehran');
    expect(screen.getByTestId('popular-route-MHD')).toHaveTextContent('Mashhad');
    expect(screen.getByTestId('popular-route-MHD')).not.toHaveTextContent('تهران');
    await userEvent.click(screen.getByTestId('home-origin'));
    expect(screen.getByTestId('airport-option-THR')).toHaveTextContent('Mehrabad International Airport');
    expect(screen.getByTestId('airport-option-THR')).not.toHaveTextContent('فرودگاه');
  });

  it('renders Arabic marketing sections with Eastern Arabic-Indic digits', async () => {
    mockLocale('ar');
    mockDesktop();
    vi.spyOn(publicSiteApi, 'fetchAirports').mockResolvedValue(AIRPORTS);
    vi.spyOn(siteContentApi, 'fetchPublicHomeContent').mockResolvedValue({
      ...CMS_HOME,
      routes: CMS_HOME.routes.map((route) => ({
        ...route,
        fromAirportCode: 'تهران',
        toAirportCode: 'مشهد',
      })),
      blocks: CMS_HOME.blocks.map((b) =>
        b.key === 'HERO_BANNER' ? { ...b, title: 'احجز رحلتك القادمة مع blujet' } : b,
      ),
    });
    renderPage();
    await screen.findByTestId('home-origin');

    expect(screen.getByText('احجز رحلتك القادمة مع blujet')).toBeInTheDocument();
    expect(screen.getByText('الوجهات الشائعة')).toBeInTheDocument();
    expect(screen.getByTestId('popular-route-MHD')).toHaveTextContent('١٬٦٠٠٬٠٠٠');
    expect(screen.getByTestId('popular-route-MHD')).toHaveTextContent('طهران');
    expect(screen.getByTestId('popular-route-MHD')).not.toHaveTextContent('تهران');
    await userEvent.click(screen.getByTestId('home-origin'));
    expect(screen.getByTestId('airport-option-THR')).toHaveTextContent('مطار مهرآباد الدولي');
    expect(screen.getByTestId('airport-option-THR')).not.toHaveTextContent('فرودگاه');
  });

  it.each([
    ['fa' as const, 'تهران'],
    ['en' as const, 'tehran'],
    ['ar' as const, 'طهران'],
  ])(
    'opens a keyboard-safe mobile airport search sheet in %s without zooming the page',
    async (locale, query) => {
      const viewport = new EventTarget() as VisualViewport;
      let visualHeight = 458;
      let visualWidth = 390;
      let visualOffsetTop = 24;
      let visualOffsetLeft = 0;
      Object.defineProperties(viewport, {
        height: { configurable: true, get: () => visualHeight },
        width: { configurable: true, get: () => visualWidth },
        offsetTop: { configurable: true, get: () => visualOffsetTop },
        offsetLeft: { configurable: true, get: () => visualOffsetLeft },
      });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 160 });
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

      mockLocale(locale);
      mockMobile();
      mockHomeApis();
      renderPage();
      await screen.findByTestId('home-origin');

      await userEvent.click(screen.getByTestId('home-origin'));

      const overlay = screen.getByTestId('home-origin-mobile-overlay');
      const searchInput = screen.getByTestId('home-origin-search');
      const sheet = screen.getByTestId('home-origin-mobile-sheet');
      const topGap = (h: number) => Math.min(64, Math.max(28, Math.round(h * 0.08)));
      expect(overlay.parentElement).toBe(document.body);
      expect(overlay).toHaveStyle({
        position: 'fixed',
        top: '24px',
        left: '0px',
        height: '458px',
        width: '390px',
      });
      expect(sheet).toHaveStyle({
        position: 'fixed',
        top: `${24 + topGap(458)}px`,
        left: '0px',
        height: `${458 - topGap(458)}px`,
        width: '390px',
      });
      expect(searchInput).toHaveStyle({ fontSize: '16px' });
      expect(searchInput).toHaveAttribute('inputmode', 'search');
      expect(screen.getByTestId('home-origin-mobile-tabs')).toBeInTheDocument();
      expect(document.body).toHaveStyle({ overflow: 'hidden', position: 'fixed', top: '-160px', width: '100%' });

      // Keyboard opens further and iOS pans the visual viewport.
      visualHeight = 340;
      visualOffsetTop = 286;
      visualOffsetLeft = 12;
      visualWidth = 366;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      });
      expect(sheet).toHaveStyle({
        top: `${286 + topGap(340)}px`,
        left: '12px',
        height: `${340 - topGap(340)}px`,
        width: '366px',
      });
      expect(overlay).toHaveStyle({
        top: '286px',
        left: '12px',
        height: '340px',
        width: '366px',
      });

      await userEvent.type(searchInput, query);
      expect(screen.getByTestId('airport-option-THR')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('home-origin-mobile-close'));
      expect(document.body).not.toHaveStyle({ position: 'fixed' });
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 160, left: 0, behavior: 'auto' });
    },
  );

  it('keeps the sheet inside a very short visualViewport (no 180px min overflow)', async () => {
    const viewport = new EventTarget() as VisualViewport;
    let visualHeight = 140;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => visualHeight },
      width: { configurable: true, value: 390 },
      offsetTop: { configurable: true, value: 520 },
      offsetLeft: { configurable: true, value: 0 },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

    mockLocale('fa');
    mockMobile();
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');
    await userEvent.click(screen.getByTestId('home-origin'));

    const sheet = screen.getByTestId('home-origin-mobile-sheet');
    expect(sheet).toHaveAttribute('data-compact-sheet', 'true');
    expect(sheet).toHaveStyle({ top: '520px', height: '140px', width: '390px' });
    // Must NOT expand to 180px (would paint under the keyboard).
    expect(sheet).not.toHaveStyle({ height: '180px' });
  });

  it('tracks Android-style keyboard resize (height shrinks, offsetTop stays 0)', async () => {
    const viewport = new EventTarget() as VisualViewport;
    let visualHeight = 780;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => visualHeight },
      width: { configurable: true, value: 412 },
      offsetTop: { configurable: true, value: 0 },
      offsetLeft: { configurable: true, value: 0 },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 915 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

    mockLocale('en');
    mockMobile();
    mockHomeApis();
    renderPage();
    await screen.findByTestId('home-origin');
    await userEvent.click(screen.getByTestId('home-origin'));

    const topGap = (h: number) => Math.min(64, Math.max(28, Math.round(h * 0.08)));
    const sheet = screen.getByTestId('home-origin-mobile-sheet');
    expect(sheet).toHaveStyle({
      top: `${topGap(780)}px`,
      height: `${780 - topGap(780)}px`,
      width: '412px',
    });

    visualHeight = 420;
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(sheet).toHaveStyle({
      top: `${topGap(420)}px`,
      height: `${420 - topGap(420)}px`,
      width: '412px',
    });
  });
});

/** Frozen responsive layout — do not change without explicit product approval. */
describe('HomeSearchPage — responsive layout (frozen)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockHomeApis();
  });

  it('desktop: services grid, destinations + loyalty carousel visible, no hscroll', async () => {
    mockDesktop();
    renderPage();
    await screen.findByTestId('home-origin');

    const services = screen.getByTestId('home-services');
    expect(services).not.toHaveClass('hscroll');
    expect(services).toHaveStyle({ display: 'grid' });

    expect(screen.getByText('مقصدهای محبوب')).toBeInTheDocument();
    expect(screen.getByTestId('popular-dest-DXB')).toBeInTheDocument();
    expect(screen.getByText('با رسیدن به حد امتیاز، کارت عضویت بگیر')).toBeInTheDocument();
  });

  it('mobile: horizontal hscroll for services/destinations, carousel hidden', async () => {
    mockMobile();
    renderPage();
    await screen.findByTestId('home-origin');

    const services = screen.getByTestId('home-services');
    expect(services).toHaveClass('hscroll');
    expect(services).toHaveStyle({ display: 'flex', overflowX: 'auto' });

    const serviceButtons = services.querySelectorAll('button');
    expect(serviceButtons.length).toBe(4);
    expect(serviceButtons[0]).toHaveStyle({
      width: 'calc((100% - 10px) / 2)',
      minWidth: 'calc((100% - 10px) / 2)',
    });

    const dests = screen.getByTestId('home-popular-destinations');
    expect(dests).toHaveClass('hscroll');
    expect(dests).toHaveStyle({ display: 'flex', overflowX: 'auto', minWidth: '0px' });
    expect(screen.getByText('مقصدهای محبوب')).toBeInTheDocument();
    expect(screen.getByTestId('popular-dest-DXB')).toBeInTheDocument();
    expect(screen.queryByText('با رسیدن به حد امتیاز، کارت عضویت بگیر')).not.toBeInTheDocument();
  });
});
