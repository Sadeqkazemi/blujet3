import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from './AccountPage';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUser } from '../../test/mockAuthUser';
import * as useLocaleModule from '../../hooks/useLocale';
import * as publicSiteApi from '../../api/publicSite';
import * as supportTicketsApi from '../../api/support-tickets';
import * as filesApi from '../../api/files';
import * as authApi from '../../api/auth';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import type { BookingDetail, PriceLock, RefundRequestView, SavedFlight, SavedPassenger, SavedBankAccount, CustomerReferralDashboard, CustomerIdentityView, ActiveSession, UserProfile } from '../../types/public-site';
import type { ClubMembershipView } from '../../types/club-membership';
import type { MySupportTicketRow } from '../../types/support-tickets';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
const BOOKING: BookingDetail = {
  id: 'b1',
  pnr: 'BJ4X2K',
  status: 'TICKETED',
  cabin: 'ECONOMY',
  priceIrr: '16000000',
  holdExpiresAt: null,
  flightInstanceId: 'fi-1',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T05:00:00.000Z',
  arrivalAt: '2026-08-01T06:30:00.000Z',
  isPriceLocked: false,
  passengers: [{ fullName: 'نگار رضایی', seatCode: '12A' }],
};

const REFUND: RefundRequestView = {
  id: 'r1',
  trackingCode: 'RF-A1B2C3D4',
  bookingId: 'b1',
  pnr: 'BJ4X2K',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-01T05:00:00.000Z',
  status: 'REVIEW',
  penaltyPct: 30,
  penaltyAmountIrr: '4800000',
  refundableIrr: '11200000',
  totalPaidIrr: '16000000',
  history: [
    { step: 'submitted', labelFa: 'ثبت درخواست', at: '2026-07-01T00:00:00.000Z' },
    { step: 'review', labelFa: 'بررسی ادمین', at: '2026-07-01T01:00:00.000Z' },
  ],
  createdAt: '2026-07-01T00:00:00.000Z',
  paidAt: null,
};

const LOCK: PriceLock = {
  id: 'pl-1',
  flightInstanceId: 'fi-2',
  cabin: 'BUSINESS',
  lockedPriceIrr: '680000000',
  feeIrr: '2040000',
  status: 'ACTIVE',
  expiresAt: '2026-08-04T05:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  bookingId: null,
  flight: { flightNo: 'BJ-200', originCode: 'THR', destCode: 'IFN', departureAt: '2026-08-01T09:00:00.000Z' },
};

const PROFILE: UserProfile = {
  fullName: 'نگار رضایی',
  nationalId: null,
  birthDate: null,
  passportNo: null,
  address: null,
  email: null,
  emailVerifiedAt: null,
  completionPct: 20,
};

const CLUB_MEMBERSHIP: ClubMembershipView = {
  isMember: true,
  level: 'GOLD',
  balance: 12450,
  cardStatus: 'ISSUED',
  cardNo: 'GOLD-8842',
  tierRules: { goldMinPoints: 5000, platinumMinPoints: 15000, cardRequestMinPoints: 5000 },
  cardRequest: {
    id: 'cr-1',
    status: 'APPROVED',
    cardNo: 'GOLD-8842',
    createdAt: '2026-07-01T00:00:00.000Z',
    history: [
      { step: 'submitted', labelFa: 'ثبت درخواست', at: '۱۴۰۴/۰۳/۱۲' },
      { step: 'approved', labelFa: 'تأیید', at: '۱۴۰۴/۰۳/۱۳' },
    ],
  },
  canRequestCard: false,
  pointsNeededForCard: 0,
};

function mockAuth(status: 'authenticated' | 'unauthenticated', signOut = vi.fn()) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status,
    user: status === 'authenticated' ? mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }) : null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut,
  });
}

const ACTIVE_SESSION: ActiveSession = {
  id: 'sess-1',
  deviceLabel: 'Chrome · Windows',
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z',
  isCurrent: true,
};

const OTHER_SESSION: ActiveSession = {
  id: 'sess-2',
  deviceLabel: 'اپلیکیشن blujet · اندروید',
  ip: '10.0.0.2',
  userAgent: 'blujet-android/1.0',
  createdAt: '2026-06-28T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z',
  isCurrent: false,
};

const SAVED_PASSENGER: SavedPassenger = {
  id: 'sp-1',
  fullName: 'محمد رضایی',
  latinName: 'MOHAMMAD REZAEI',
  gender: 'male',
  birthDate: '1990-05-15',
  nationalId: null,
  passportNo: 'A22113344',
  mobile: null,
  isChild: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  attachments: [],
};

const BANK_ACCOUNT: SavedBankAccount = {
  id: 'ba-1',
  bankName: 'بانک ملت',
  bankShort: 'ملت',
  brandColor: '#d6336c',
  cardMasked: '6104 3371 •••• 4521',
  sheba: 'IR820540102680020817909002',
  shebaMasked: '820540•••9002',
  isDefault: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const IDENTITY_NOT_STARTED: CustomerIdentityView = {
  status: 'NOT_STARTED',
  isComplete: false,
  canSubmit: false,
  submittedAt: null,
  rejectReason: null,
  steps: [
    { key: 'profile', done: false },
    { key: 'id_card', done: false },
  ],
  idCardFile: null,
};

const IDENTITY_READY: CustomerIdentityView = {
  status: 'NOT_STARTED',
  isComplete: false,
  canSubmit: true,
  submittedAt: null,
  rejectReason: null,
  steps: [
    { key: 'profile', done: true },
    { key: 'id_card', done: true },
  ],
  idCardFile: { id: 'f1', fileName: 'کارت-ملی.png', sizeBytes: 1234 },
};

const REFERRAL_DASH: CustomerReferralDashboard = {
  referralCode: 'NEGAR-4152',
  sharePath: '/signin?ref=NEGAR-4152',
  stats: { invitedCount: 3, pointsEarned: 1000, successfulBookings: 2 },
  invites: [
    {
      id: 'cr-1',
      fullName: 'رضا مرادی',
      joinedAt: '2026-07-01T00:00:00.000Z',
      status: 'REWARDED',
      pointsAwarded: 500,
    },
    {
      id: 'cr-2',
      fullName: 'آرش هاشمی',
      joinedAt: '2026-07-02T00:00:00.000Z',
      status: 'SIGNED_UP',
      pointsAwarded: 0,
    },
  ],
};

const SAVED: SavedFlight = {
  id: 'sf-1',
  flightInstanceId: 'fi-3',
  cabin: 'ECONOMY',
  flightNo: 'BJ-300',
  originCode: 'THR',
  destCode: 'MHD',
  originCityFa: 'تهران',
  destCityFa: 'مشهد',
  departureAt: '2026-08-02T05:00:00.000Z',
  arrivalAt: '2026-08-02T06:30:00.000Z',
  priceIrr: '195000000',
  bookable: true,
  createdAt: '2026-07-01T00:00:00.000Z',
};

const TICKET: MySupportTicketRow = {
  id: 'tk-1',
  trackingCode: 'TKAABBCCDD',
  subject: 'مشکل در پرداخت',
  body: 'وجه کسر شد ولی بلیط صادر نشد.',
  status: 'IN_PROGRESS',
  history: [{ step: 'submitted', labelFa: 'ثبت تیکت توسط کاربر', at: '2026-07-01T00:00:00.000Z' }],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function renderPage(initialEntry = '/account') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AccountPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
  vi.spyOn(publicSiteApi, 'fetchMyBookings').mockResolvedValue([BOOKING]);
  vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '2500000' });
  vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
  vi.spyOn(publicSiteApi, 'fetchClubMembership').mockResolvedValue(CLUB_MEMBERSHIP);
  vi.spyOn(publicSiteApi, 'fetchMyRefunds').mockResolvedValue([REFUND]);
  vi.spyOn(publicSiteApi, 'fetchEligibleRefundBookings').mockResolvedValue([]);
  vi.spyOn(publicSiteApi, 'fetchCustomerRefundRules').mockResolvedValue([]);
  vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue(PROFILE);
  vi.spyOn(publicSiteApi, 'fetchMyPriceLocks').mockResolvedValue([]);
  vi.spyOn(publicSiteApi, 'fetchSavedFlights').mockResolvedValue([SAVED]);
  vi.spyOn(publicSiteApi, 'fetchSavedPassengers').mockResolvedValue([SAVED_PASSENGER]);
  vi.spyOn(publicSiteApi, 'fetchBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
  vi.spyOn(publicSiteApi, 'fetchMyReferral').mockResolvedValue(REFERRAL_DASH);
  vi.spyOn(publicSiteApi, 'fetchMyIdentity').mockResolvedValue(IDENTITY_NOT_STARTED);
  vi.spyOn(publicSiteApi, 'fetchMySessions').mockResolvedValue([ACTIVE_SESSION, OTHER_SESSION]);
  vi.spyOn(supportTicketsApi, 'fetchMySupportTickets').mockResolvedValue([]);
});

describe('AccountPage', () => {
  it('offers the shared theme control and keeps the wallet icon in customer navigation', async () => {
    mockAuth('authenticated');
    mockLocale('fa');
    renderPage();

    await userEvent.click(await screen.findByTestId('panel-theme-toggle'));
    expect(screen.getByTestId('customer-panel-shell')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'کیف پول' })).toBeInTheDocument();
  });

  it('shows the trips tab by default with real booking data', async () => {
    mockAuth('authenticated');
    renderPage();
    expect(await screen.findByTestId('account-trip')).toBeInTheDocument();
    expect(screen.getByText('BJ-100', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('trip-view-ticket')).toHaveAttribute('href', '/ticket/BJ4X2K');
  });

  it('hides view-ticket for unpaid holds and offers continue-payment within 15 minutes', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyBookings').mockResolvedValue([
      {
        ...BOOKING,
        id: 'b-held',
        pnr: 'BJHOLD1',
        status: 'HELD',
        holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    ]);
    renderPage('/account?tab=trips');
    expect(await screen.findByTestId('account-trip')).toHaveAttribute('data-status', 'HELD');
    expect(screen.queryByTestId('trip-view-ticket')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-continue-payment')).toHaveAttribute('href', '/payment/b-held');
    expect(screen.getByTestId('trip-hold-remaining')).toBeInTheDocument();
  });

  it('shows expired status without ticket or payment links when hold TTL elapsed', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyBookings').mockResolvedValue([
      {
        ...BOOKING,
        id: 'b-exp',
        pnr: 'BJEXP01',
        status: 'EXPIRED',
        holdExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    renderPage('/account?tab=trips');
    const row = await screen.findByTestId('account-trip');
    expect(row).toHaveAttribute('data-status', 'EXPIRED');
    expect(row).toHaveTextContent('منقضی شده');
    expect(screen.queryByTestId('trip-view-ticket')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-continue-payment')).not.toBeInTheDocument();
  });

  it('switches to the wallet tab and shows the real balance', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=wallet');
    expect(await screen.findByTestId('wallet-balance')).toHaveTextContent('۲۵۰٬۰۰۰');
  });

  it('renders the immutable wallet purchase history with PNR and debit amount', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({
      balanceIrr: '84000000',
      entries: [
        {
          id: 'we-1',
          type: 'PURCHASE',
          signedAmountIrr: '-16000000',
          bookingId: 'b1',
          pnr: 'BJ4X2K',
          createdAt: '2026-08-30T06:00:00.000Z',
        },
      ],
    });
    renderPage('/account?tab=wallet');

    expect(await screen.findByTestId('wallet-history')).toHaveTextContent('خرید بلیط');
    expect(screen.getByTestId('wallet-history')).toHaveTextContent('BJ4X2K');
    expect(screen.getByTestId('wallet-history')).toHaveTextContent('۱٬۶۰۰٬۰۰۰');
  });

  it('switches to the club tab and shows tier banner + issued card', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=club');
    expect(await screen.findByTestId('club-card-tracker')).toBeInTheDocument();
    expect(screen.getByText('عضو طلایی')).toBeInTheDocument();
    expect(screen.getByText('GOLD-8842')).toBeInTheDocument();
  });

  it('switches to the passengers tab and lists saved passengers with meta line', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=passengers');
    const row = await screen.findByTestId('account-passenger');
    expect(row).toHaveTextContent('محمد رضایی');
    expect(row).toHaveTextContent('MOHAMMAD REZAEI · A22113344');
    expect(screen.getByTestId('passenger-remove-sp-1')).toHaveTextContent('حذف');
  });

  it('shows ten trips per page and keeps further records on the next page', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyBookings').mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        ...BOOKING,
        id: `booking-${index + 1}`,
        pnr: `BJ${String(index + 1).padStart(5, '0')}`,
      })),
    );
    renderPage('/account?tab=trips');

    expect(await screen.findAllByTestId('account-trip')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'صفحه بعد' }));
    expect(await screen.findAllByTestId('account-trip')).toHaveLength(1);
  });

  it('adds a saved passenger from the modal', async () => {
    mockAuth('authenticated');
    const create = vi.spyOn(publicSiteApi, 'createSavedPassenger').mockResolvedValue({
      ...SAVED_PASSENGER,
      id: 'sp-2',
      fullName: 'سارا احمدی',
      latinName: 'SARA AHMADI',
      passportNo: 'B99887766',
    });
    renderPage('/account?tab=passengers');
    await userEvent.click(await screen.findByTestId('passengers-add-open'));
    await userEvent.type(screen.getByLabelText('نام'), 'سارا');
    await userEvent.type(screen.getByLabelText('نام خانوادگی'), 'احمدی');
    await userEvent.type(screen.getByLabelText('نام لاتین'), 'Sara');
    await userEvent.type(screen.getByLabelText('نام خانوادگی لاتین'), 'Ahmadi');
    await userEvent.selectOptions(screen.getByTestId('passengers-form-gender'), 'female');
    await userEvent.selectOptions(screen.getByTestId('passengers-form-birth-day'), '20');
    await userEvent.selectOptions(screen.getByTestId('passengers-form-birth-month'), '5');
    await userEvent.selectOptions(screen.getByTestId('passengers-form-birth-year'), '1373');
    await userEvent.type(screen.getByLabelText('شماره گذرنامه'), 'B99887766');
    await userEvent.click(screen.getByTestId('passengers-form-save'));
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({
      fullName: 'سارا احمدی',
      latinName: 'Sara Ahmadi',
      gender: 'female',
      birthDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      nationalId: undefined,
      passportNo: 'B99887766',
      mobile: undefined,
      isChild: false,
    });
  });

  it('removes a saved passenger', async () => {
    mockAuth('authenticated');
    const remove = vi.spyOn(publicSiteApi, 'removeSavedPassenger').mockResolvedValue({ removed: true });
    renderPage('/account?tab=passengers');
    await screen.findByTestId('account-passenger');
    await userEvent.click(screen.getByLabelText('حذف'));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('sp-1'));
  });

  it('switches to the refunds tab and shows the real refund', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=refunds');
    expect(await screen.findByTestId('refund-tracking')).toHaveTextContent('در حال بررسی');
  });

  it('switches to the tickets tab and lists support tickets', async () => {
    mockAuth('authenticated');
    vi.spyOn(supportTicketsApi, 'fetchMySupportTickets').mockResolvedValue([TICKET]);
    renderPage('/account?tab=tickets');
    expect(await screen.findByTestId('support-conversation-center')).toHaveAttribute('data-theme', 'light');
    expect(await screen.findByTestId('account-ticket')).toHaveTextContent('مشکل در پرداخت');
    expect(screen.getByText('TKAABBCCDD', { exact: false })).toBeInTheDocument();
  });

  it('uploads and submits a file attachment with a new support ticket', async () => {
    mockAuth('authenticated');
    const upload = vi.spyOn(filesApi, 'uploadFile').mockResolvedValue({
      id: 'file-1',
      fileName: 'payment.png',
      sizeBytes: 128,
    });
    const submit = vi.spyOn(supportTicketsApi, 'submitMySupportTicket').mockResolvedValue({
      id: 'ticket-new',
      trackingCode: 'TK11223344',
    });
    renderPage('/account?tab=tickets');

    await userEvent.click(await screen.findByRole('button', { name: /درخواست جدید/ }));
    await userEvent.type(screen.getByPlaceholderText('موضوع درخواست را وارد کنید'), 'خطای پرداخت');
    await userEvent.type(screen.getByPlaceholderText('پیام خود را بنویسید…'), 'تصویر خطا پیوست شده است.');
    await userEvent.type(screen.getByPlaceholderText(/۰۹۱۲/), '09121234567');
    const file = new File(['image'], 'payment.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('ticket-attachment-input'), file);
    expect(await screen.findByText('payment.png')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ارسال درخواست' }));

    expect(upload).toHaveBeenCalledWith(file);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ['file-1'] }));
  });

  it('switches to the security tab and lists active sessions with revoke', async () => {
    mockAuth('authenticated');
    const revoke = vi.spyOn(publicSiteApi, 'revokeMySession').mockResolvedValue({ revoked: true });
    renderPage('/account?tab=security');
    expect(await screen.findByTestId('account-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('session-current-badge')).toBeInTheDocument();
    expect(screen.getByText('Chrome · Windows')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('session-revoke-sess-2'));
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('sess-2'));
    expect(screen.queryByText('اپلیکیشن blujet · اندروید')).not.toBeInTheDocument();
  });

  it('switches to the security tab and sets password via OTP flow API', async () => {
    mockAuth('authenticated');
    const setPw = vi.spyOn(authApi, 'setPassword').mockResolvedValue({ changed: true });
    renderPage('/account?tab=security');
    await userEvent.type(document.getElementById('acct-pw-new')!, 'secret12');
    await userEvent.type(document.getElementById('acct-pw-confirm')!, 'secret12');
    await userEvent.click(screen.getByTestId('account-save-password'));
    await screen.findByText('رمز عبور با موفقیت تغییر کرد ✓');
    expect(setPw).toHaveBeenCalledWith('secret12');
    expect(screen.getByTestId('account-security-tab')).toHaveStyle({ maxWidth: 'none' });
    expect(screen.getByTestId('account-password-card')).toHaveTextContent('حداقل ۶ کاراکتر');
  });

  it('switches to the banks tab and lists saved accounts with default badge', async () => {
    mockAuth('authenticated');
    const create = vi.spyOn(publicSiteApi, 'createBankAccount').mockResolvedValue({
      ...BANK_ACCOUNT,
      id: 'ba-2',
      bankName: 'بانک سامان',
      bankShort: 'سامان',
      brandColor: '#1c7ed6',
      cardMasked: '6219 8619 •••• 7730',
      isDefault: false,
    });
    renderPage('/account?tab=banks');
    expect(await screen.findByTestId('account-banks')).toBeInTheDocument();
    expect(screen.getByText('بانک ملت')).toBeInTheDocument();
    expect(screen.getByTestId('bank-default-badge')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('bank-input-card'), '6219861977777730');
    await userEvent.type(screen.getByTestId('bank-input-sheba'), 'IR060120000000332211452192');
    await userEvent.click(screen.getByTestId('bank-submit'));
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({
      cardNo: '6219861977777730',
      sheba: 'IR060120000000332211452192',
    });
  });

  it('switches to the referral tab and shows code, KPIs, and invite list', async () => {
    mockAuth('authenticated');
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    renderPage('/account?tab=referral');
    expect(await screen.findByTestId('account-referral')).toBeInTheDocument();
    expect(screen.getByTestId('referral-code')).toHaveTextContent('NEGAR-4152');
    expect(screen.getByTestId('kpi-invited')).toHaveTextContent('۳');
    expect(screen.getByText('رضا مرادی')).toBeInTheDocument();
    expect(screen.getByText('رزرو انجام شد')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('referral-copy'));
    expect(await screen.findByText('کد معرف کپی شد ✓')).toBeInTheDocument();
  });

  it('switches to the identity tab and shows incomplete steps with profile link', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=identity');
    expect(await screen.findByTestId('account-identity')).toBeInTheDocument();
    expect(screen.getByText('احراز هویت شما هنوز کامل نشده است')).toBeInTheDocument();
    expect(screen.getByTestId('identity-go-profile')).toBeInTheDocument();
    expect(screen.getAllByTestId('identity-step')).toHaveLength(2);
    expect(screen.queryByTestId('identity-submit')).not.toBeInTheDocument();
  });

  it('submits identity verification when profile and id card are complete', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyIdentity').mockResolvedValue(IDENTITY_READY);
    const submit = vi
      .spyOn(publicSiteApi, 'submitIdentityVerification')
      .mockResolvedValue({ ...IDENTITY_READY, status: 'SUBMITTED', canSubmit: false });
    renderPage('/account?tab=identity');
    expect(await screen.findByTestId('identity-submit')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('identity-submit'));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
  });

  it('shows saved passengers on the passengers tab and opens add modal', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=passengers');
    expect(await screen.findByTestId('account-passenger')).toBeInTheDocument();
    expect(screen.getByText('MOHAMMAD REZAEI · A22113344')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('passengers-add-open'));
    expect(await screen.findByTestId('passengers-form-modal')).toBeInTheDocument();
    expect(screen.getByTestId('passengers-form')).toHaveStyle({
      maxHeight: 'calc(100vh - 32px)',
      display: 'flex',
      flexDirection: 'column',
    });
    expect(screen.getByTestId('passengers-form-fields')).toHaveStyle({
      overflowY: 'auto',
    });
  });

  it('shows an incomplete-profile banner and saves identity fields from the account-info tab', async () => {
    mockAuth('authenticated');
    const update = vi.spyOn(publicSiteApi, 'updateMyProfile').mockResolvedValue({
      ...PROFILE,
      nationalId: '0012345679',
      completionPct: 40,
    });
    renderPage();

    expect(await screen.findByTestId('profile-incomplete-banner')).toHaveTextContent('۲۰٪');

    await userEvent.click(screen.getByTestId('account-tab-account-info'));
    const profileFields = await screen.findByTestId('profile-fields-grid');
    expect(within(profileFields).getByText('نام')).toBeInTheDocument();
    expect(within(profileFields).getByText('نگار')).toBeInTheDocument();
    expect(within(profileFields).getByText('نام خانوادگی')).toBeInTheDocument();
    expect(within(profileFields).getByText('رضایی')).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId('profile-edit-toggle'));
    expect(screen.getByLabelText('نام')).toHaveValue('نگار');
    expect(screen.getByLabelText('نام خانوادگی')).toHaveValue('رضایی');
    const nationalIdInput = await screen.findByLabelText('کد ملی');
    await userEvent.type(nationalIdInput, '0012345679');
    await userEvent.type(screen.getByLabelText('تاریخ تولد'), '۱۳۷۰/۰۵/۱۲');
    await userEvent.type(screen.getByLabelText('آدرس محل سکونت'), 'تهران، خیابان آزادی، پلاک ۱۲');
    await userEvent.type(screen.getByLabelText('ایمیل'), 'Negar.New@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'ذخیره اطلاعات' }));

    await screen.findByText('اطلاعات پروفایل ذخیره شد ✓');
    expect(update).toHaveBeenCalledWith({
      fullName: 'نگار رضایی',
      nationalId: '0012345679',
      birthDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      passportNo: undefined,
      address: 'تهران، خیابان آزادی، پلاک ۱۲',
      email: 'Negar.New@Example.com',
    });
  });

  it('downloads a real data export as JSON from the security tab', async () => {
    mockAuth('authenticated');
    const exportSpy = vi.spyOn(publicSiteApi, 'fetchPrivacyExport').mockResolvedValue({ user: PROFILE });
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    renderPage('/account?tab=security');
    await userEvent.click(screen.getByTestId('privacy-export-button'));

    await vi.waitFor(() => expect(exportSpy).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.unstubAllGlobals();
  });

  it('deletes the account only after explicit confirmation from the security tab, then signs out', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth('authenticated', signOut);
    const deleteSpy = vi.spyOn(publicSiteApi, 'deleteMyAccount').mockResolvedValue({ deleted: true });

    renderPage('/account?tab=security');
    await userEvent.click(screen.getByTestId('privacy-delete-open'));

    expect(screen.getByTestId('privacy-delete-confirm')).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('privacy-delete-cancel'));
    expect(screen.queryByTestId('privacy-delete-confirm')).not.toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('privacy-delete-open'));
    await userEvent.click(screen.getByTestId('privacy-delete-confirm'));

    await vi.waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalled();
  });

  it('shows the price-locked badge on a trip whose booking used a lock', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyBookings').mockResolvedValue([{ ...BOOKING, isPriceLocked: true }]);
    renderPage();
    expect(await screen.findByTestId('trip-price-locked-badge')).toBeInTheDocument();
  });

  it('redirects the removed saved tab to trips', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=saved');
    expect(await screen.findByTestId('account-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('account-saved-flights')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tab-saved')).not.toBeInTheDocument();
  });

  it('switches to the price-locks tab and lists a real lock with its route, price, fee, and cancel action', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyPriceLocks').mockResolvedValue([LOCK]);
    renderPage('/account?tab=price-locks');

    const row = await screen.findByTestId('account-price-lock');
    expect(row).toHaveTextContent('THR');
    expect(row).toHaveTextContent('IFN');
    expect(row).toHaveTextContent('۶۸٬۰۰۰٬۰۰۰');
    expect(row).toHaveTextContent('۲۰۴٬۰۰۰');
    expect(screen.getByTestId('cancel-price-lock-pl-1')).toBeInTheDocument();
  });

  it('cancelling an active price lock updates its status in place', async () => {
    mockAuth('authenticated');
    vi.spyOn(publicSiteApi, 'fetchMyPriceLocks').mockResolvedValue([LOCK]);
    const cancel = vi.spyOn(publicSiteApi, 'cancelPriceLock').mockResolvedValue({ ...LOCK, status: 'CANCELLED' });
    renderPage('/account?tab=price-locks');
    await screen.findByTestId('account-price-lock');

    await userEvent.click(screen.getByTestId('cancel-price-lock-pl-1'));

    expect(cancel).toHaveBeenCalledWith('pl-1');
    await vi.waitFor(() => expect(screen.getByTestId('account-price-lock')).toHaveTextContent('لغو شده'));
    expect(screen.queryByTestId('cancel-price-lock-pl-1')).not.toBeInTheDocument();
  });

  it('tops up the wallet using Persian-digit input, converting toman to rial correctly (regression: raw Number()*10 silently produced NaN)', async () => {
    mockAuth('authenticated');
    const topup = vi.spyOn(publicSiteApi, 'topupWallet').mockResolvedValue({ balanceIrr: '5000000' });
    renderPage('/account?tab=wallet');

    await userEvent.type(screen.getByTestId('wallet-topup-amount'), '۵۰۰٬۰۰۰');
    expect(screen.getByTestId('wallet-topup-amount')).toHaveValue('۵۰۰٬۰۰۰');
    expect(screen.getByTestId('wallet-topup-amount-words')).toHaveTextContent('پانصد هزار تومان');
    expect(screen.getByTestId('wallet-topup-submit-cell')).toHaveStyle({
      alignItems: 'flex-end',
      minHeight: '76px',
    });
    await userEvent.click(screen.getByTestId('wallet-topup-submit'));

    await vi.waitFor(() => expect(topup).toHaveBeenCalledWith(5_000_000));
  });

  it('renders translated tab labels and the club tier in English', async () => {
    mockLocale('en');
    mockAuth('authenticated');
    renderPage('/account?tab=profile');
    expect(screen.getByTestId('account-tab-profile')).toHaveTextContent('My Profile');
    expect(screen.getByTestId('account-tab-account-info')).toHaveTextContent('Account Information');
    expect(screen.getByTestId('account-tab-wallet')).toHaveTextContent('Wallet');
    expect(screen.getByTestId('account-tab-club')).toHaveTextContent('Points & Loyalty Club');
    renderPage('/account?tab=club');
    expect(await screen.findByText('Gold Member')).toBeInTheDocument();
  });

  it('renders translated tab labels and the club tier in Arabic', async () => {
    mockLocale('ar');
    mockAuth('authenticated');
    renderPage('/account?tab=profile');
    expect(screen.getByTestId('account-tab-profile')).toHaveTextContent('ملفي الشخصي');
    expect(screen.getByTestId('account-tab-account-info')).toHaveTextContent('معلومات الحساب');
    expect(screen.getByTestId('account-tab-wallet')).toHaveTextContent('المحفظة');
    expect(screen.getByTestId('account-tab-club')).toHaveTextContent('النقاط ونادي الولاء');
    renderPage('/account?tab=club');
    expect(await screen.findByText('عضو ذهبية')).toBeInTheDocument();
  });

  it('shows every existing account destination in the desktop sidebar', async () => {
    mockAuth('authenticated');
    renderPage('/account?tab=profile');
    expect(screen.getByTestId('account-sidebar')).toHaveStyle({
      maxHeight: 'calc(100vh - 106px)',
      overflow: 'hidden',
    });
    for (const tabKey of [
      'profile',
      'account-info',
      'trips',
      'refunds',
      'wallet',
      'loans',
      'club',
      'price-locks',
      'passengers',
      'tickets',
      'identity',
      'security',
      'banks',
      'referral',
    ]) {
      expect(screen.getByTestId(`account-tab-${tabKey}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('account-tab-saved')).not.toBeInTheDocument();
  });

  it('shows the requested compact navigation in the mobile sidebar and opens its tabs', async () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    mockAuth('authenticated');
    renderPage('/account?tab=profile');

    expect(screen.getByTestId('account-sidebar')).toHaveStyle({ overflow: 'hidden' });

    for (const tabKey of ['profile', 'account-info', 'trips', 'refunds', 'wallet', 'club']) {
      expect(screen.getByTestId(`account-tab-${tabKey}`)).toBeInTheDocument();
    }
    for (const tabKey of ['saved', 'price-locks', 'passengers', 'tickets', 'identity', 'security', 'banks', 'referral']) {
      expect(screen.queryByTestId(`account-tab-${tabKey}`)).not.toBeInTheDocument();
    }

    await userEvent.click(screen.getByTestId('account-tab-refunds'));
    expect(await screen.findByTestId('account-refunds')).toBeInTheDocument();
  });

  it('renders profile stats in a 2-column grid on mobile', async () => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    mockAuth('authenticated');
    renderPage();
    await userEvent.click(screen.getByTestId('account-tab-profile'));
    const grid = await screen.findByTestId('profile-stats-grid');
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(2, 1fr)' });
    expect(screen.getByTestId('account-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('profile-incomplete-notice')).toBeInTheDocument();
  });
});
