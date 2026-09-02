import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { useAuth } from '../../hooks/useAuth';
import {
  cancelPriceLock,
  deleteMyAccount,
  fetchClubMembership,
  fetchClubPoints,
  fetchMyBookings,
  fetchMyPriceLocks,
  fetchMyProfile,
  fetchMySessions,
  fetchPrivacyExport,
  fetchSavedPassengers,
  createSavedPassenger,
  updateSavedPassenger,
  removeSavedPassenger,
  fetchBankAccounts,
  createBankAccount,
  updateBankAccount,
  removeBankAccount,
  fetchMyReferral,
  fetchMyIdentity,
  uploadIdentityIdCard,
  submitIdentityVerification,
  revokeMySession,
  fetchWallet,
  requestEmailVerify,
  topupWallet,
  updateMyProfile,
  verifyEmail,
} from '../../api/publicSite';
import { ApiRequestError } from '../../api/envelope';
import {
  fetchMySupportTickets,
  replyMySupportTicket,
  submitMySupportTicketFeedback,
  submitMySupportTicket,
} from '../../api/support-tickets';
import { deleteFile, uploadFile } from '../../api/files';
import { changeOwnPassword, setPassword } from '../../api/auth';
import { localeMoney, parseTomanToRial } from '../../lib/fa-format';
import { tomanAmountInWords } from '../../lib/amount-in-words';
import { localeDigits } from '../../lib/locale-format';
import { formatLocaleDate, formatLocaleDateTime, parseLocaleDateToIso } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { BookingDetail, PriceLock, SavedPassenger, SavedBankAccount, CustomerReferralDashboard, CustomerIdentityView, ActiveSession, UserProfile, WalletView } from '../../types/public-site';
import AccountSecuritySessions from './AccountSecuritySessions';
import type { ClubMembershipView } from '../../types/club-membership';
import type { MySupportTicketRow } from '../../types/support-tickets';
import AccountClubTab from './AccountClubTab';
import AccountPassengersTab, { type SavedPassengerForm } from './AccountPassengersTab';
import AccountBankAccountsTab, { type BankAccountForm } from './AccountBankAccountsTab';
import AccountReferralTab from './AccountReferralTab';
import AccountIdentityTab from './AccountIdentityTab';
import AccountRefundsTab from './AccountRefundsTab';
import AccountLoansTab from './AccountLoansTab';
import AccountSidebar from './account/AccountSidebar';
import AccountProfileTab from './account/AccountProfileTab';
import AccountInfoTab from './account/AccountInfoTab';
import AccountPrivacyPanel from './account/AccountPrivacyPanel';
import type { TabKey } from './account/account-types';
import { isAccountTabKey } from './account/account-nav-items';
import { useIsMobile } from '../../hooks/useIsMobile';
import MoneyInput from '../../components/MoneyInput';
import SupportConversationCenter from '../../components/SupportConversationCenter';
import { joinPersonName, splitPersonName } from '../../lib/person-name';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import PanelThemeToggle from '../../components/PanelThemeToggle';

// پنل کاربر — real data from the existing bookings/wallet/club-points/refunds
// endpoints (none of this is mock). Matches design-reference/پنل کاربر.dc.html's
// scope: سفرها، کیف پول، امتیاز باشگاه، مسافران، استردادها.
// EN strings mostly extracted from the design bundle's own isEN ternaries
// (rich coverage for this page); AR is a mix of the design's own isAR
// branches where they exist and fresh hand-translation elsewhere — this
// page's own «قفل قیمت» (price lock) tab has no design counterpart at all,
// so its strings are hand-translated to match the real feature.

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

type StatusEntry = { label: Tr; bg: string; color: string };

const STATUS_LABEL: Record<string, StatusEntry> = {
  DRAFT: { label: { fa: 'پیش‌نویس', en: 'Draft', ar: 'مسودة' }, bg: '#f1f4f8', color: '#5a6678' },
  HELD: { label: { fa: 'در انتظار پرداخت', en: 'Awaiting Payment', ar: 'بانتظار الدفع' }, bg: '#fff7e6', color: '#9a7d22' },
  PAID: { label: { fa: 'پرداخت‌شده', en: 'Paid', ar: 'مدفوع' }, bg: '#eef4fb', color: '#1668c4' },
  TICKETED: { label: { fa: 'صادر شده', en: 'Ticketed', ar: 'تم إصدار التذكرة' }, bg: '#e8f5ee', color: '#1f8a5b' },
  CANCELLED: { label: { fa: 'لغو شده', en: 'Cancelled', ar: 'ملغى' }, bg: '#f1f4f8', color: '#8a96a6' },
  EXPIRED: { label: { fa: 'منقضی شده', en: 'Expired', ar: 'منتهي الصلاحية' }, bg: '#fbf0ef', color: '#d64545' },
  REFUNDED: { label: { fa: 'مسترد شده', en: 'Refunded', ar: 'تم الاسترداد' }, bg: '#f1f4f8', color: '#8a96a6' },
};

/** HELD bookings keep a 15-minute pay window (CLAUDE.md / holdExpiresAt). */
function holdSecondsLeft(holdExpiresAt: string | null): number {
  if (!holdExpiresAt) return 0;
  return Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
}

function isHoldPayable(booking: BookingDetail): boolean {
  return booking.status === 'HELD' && holdSecondsLeft(booking.holdExpiresAt) > 0;
}

/** E-ticket image/boarding pass is only for issued tickets — never unpaid holds. */
function canViewETicket(booking: BookingDetail): boolean {
  return booking.status === 'TICKETED';
}

function displayTripStatus(booking: BookingDetail): string {
  if (booking.status === 'HELD' && holdSecondsLeft(booking.holdExpiresAt) <= 0) {
    return 'EXPIRED';
  }
  return booking.status;
}

function formatHoldClock(secs: number, locale: StoredLocale): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const raw = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return localeDigits(raw, locale);
}

const CABIN_LABEL: Record<string, Tr> = {
  ECONOMY: { fa: 'اکونومی', en: 'Economy', ar: 'اقتصادية' },
  COMFORT: { fa: 'کامفورت', en: 'Comfort', ar: 'كومفورت' },
  BUSINESS: { fa: 'بیزینس', en: 'Business', ar: 'درجة الأعمال' },
  FIRST: { fa: 'فرست', en: 'First', ar: 'الدرجة الأولى' },
};

const LOCK_STATUS_LABEL: Record<string, StatusEntry> = {
  ACTIVE: { label: { fa: 'فعال', en: 'Active', ar: 'نشط' }, bg: '#e8f5ee', color: '#1f8a5b' },
  USED: { label: { fa: 'استفاده‌شده', en: 'Used', ar: 'مُستخدَم' }, bg: '#eef4fb', color: '#1668c4' },
  CANCELLED: { label: { fa: 'لغو شده', en: 'Cancelled', ar: 'ملغى' }, bg: '#f1f4f8', color: '#8a96a6' },
};

const STR: Record<StoredLocale, {
  defaultUserName: string;
  memberPrefix: string;
  loading: string;
  toman: string;
  // profile
  completionLabel: string;
  accountInfoHeading: string;
  fullNameLabel: string;
  nationalIdLabel: string;
  passportLabel: string;
  saveButton: string;
  savingButton: string;
  saveSuccess: string;
  saveErrorFallback: string;
  emailHeading: string;
  emailNotSet: string;
  emailVerifiedTag: string;
  sendVerifyCodeBtn: string;
  verifyCodeErrorFallback: string;
  codeLabel: string;
  verifyBtn: string;
  verifyCodeIncomplete: string;
  verifyCodeWrongFallback: string;
  emailVerifiedSuccess: string;
  emailVerifyRequestNotice: string;
  privacyHeading: string;
  privacyDesc: string;
  exportBtn: string;
  exportBusyBtn: string;
  exportErrorFallback: string;
  deleteHeading: string;
  deleteWarning: string;
  deleteConfirmBtn: string;
  deleteBusyBtn: string;
  deleteCancelBtn: string;
  deleteErrorFallback: string;
  bannerText: (pct: string) => string;
  bannerCompleteBtn: string;
  bannerLaterBtn: string;
  // trips
  tripsEmptyText: string;
  searchFlightLink: string;
  pnrLabel: string;
  priceLockedBadge: string;
  viewTicketLink: string;
  continuePaymentLink: string;
  holdRemainingLabel: (clock: string) => string;
  // wallet
  walletBalanceHeading: string;
  topupAmountLabel: string;
  topupPlaceholder: string;
  topupSubmit: string;
  topupAmountInvalid: string;
  topupErrorFallback: string;
  // points
  currentPointsLabel: string;
  pointsTierPrefix: string;
  viewClubLink: string;
  notMemberText: string;
  joinFreeBtn: string;
  // price-locks
  locksEmptyText: string;
  lockedRatePrefix: string;
  feePrefix: string;
  validUntilPrefix: string;
  validUntilSuffix: string;
  cancelBtn: string;
  cancelBusyBtn: string;
  cancelErrorFallback: string;
  // passengers
  passengersEmptyText: string;
  // refunds
  refundsEmptyText: string;
  refundableAmountPrefix: string;
  penaltyPrefix: string;
  penaltySuffix: string;
  // tickets
  ticketsEmptyText: string;
  ticketsNewLink: string;
  ticketsTrackingLabel: string;
  ticketsHistoryHeading: string;
  ticketsLoadError: string;
  ticketsHeading: string;
  ticketsSubtitle: string;
  ticketsCreateButton: string;
  ticketsCreateHeading: string;
  ticketsSubjectLabel: string;
  ticketsBodyLabel: string;
  ticketsPhoneLabel: string;
  ticketsSubmitButton: string;
  ticketsCancelButton: string;
  ticketsSubjectPlaceholder: string;
  ticketsBodyPlaceholder: string;
  ticketsPhonePlaceholder: string;
  ticketsCreateSuccess: string;
  // security
  securityHeading: string;
  securitySub: string;
  currentPasswordLabel: string;
  currentPasswordHint: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  savePasswordBtn: string;
  savingPasswordBtn: string;
  passwordSaved: string;
  passwordErrorFallback: string;
  passwordMismatch: string;
  passwordTooShort: string;
}> = {
  fa: {
    defaultUserName: 'کاربر',
    memberPrefix: '★ عضو ',
    loading: 'در حال بارگذاری…',
    toman: 'تومان',
    completionLabel: 'تکمیل پروفایل',
    accountInfoHeading: 'اطلاعات حساب',
    fullNameLabel: 'نام و نام خانوادگی',
    nationalIdLabel: 'کد ملی',
    passportLabel: 'شماره گذرنامه',
    saveButton: 'ذخیره اطلاعات',
    savingButton: 'در حال ذخیره…',
    saveSuccess: 'اطلاعات پروفایل ذخیره شد ✓',
    saveErrorFallback: 'خطا در ذخیره اطلاعات.',
    emailHeading: 'ایمیل',
    emailNotSet: 'ایمیلی ثبت نشده است.',
    emailVerifiedTag: '· تأیید شده',
    sendVerifyCodeBtn: 'ارسال کد تأیید',
    verifyCodeErrorFallback: 'خطا در ارسال کد تأیید.',
    codeLabel: 'کد تأیید',
    verifyBtn: 'تأیید',
    verifyCodeIncomplete: 'کد ۶ رقمی را کامل وارد کنید.',
    verifyCodeWrongFallback: 'کد وارد شده نادرست است.',
    emailVerifiedSuccess: 'ایمیل شما تأیید شد ✓',
    emailVerifyRequestNotice: 'کد تأیید به ایمیل شما ارسال شد.',
    privacyHeading: 'حریم خصوصی و داده‌های من',
    privacyDesc: 'می‌توانید خروجی کامل اطلاعات شخصی خود (سفرها، مسافران، کیف پول، استرداد‌ها) را دریافت کنید یا حساب کاربری خود را برای همیشه حذف کنید.',
    exportBtn: 'دانلود اطلاعات من',
    exportBusyBtn: 'در حال آماده‌سازی…',
    exportErrorFallback: 'خطا در دریافت اطلاعات.',
    deleteHeading: 'حذف حساب کاربری',
    deleteWarning: 'این عملیات غیرقابل بازگشت است. حساب شما غیرفعال می‌شود، اطلاعات هویتی مسافران شما حذف/ناشناس می‌شود و تمام نشست‌های فعال شما بسته خواهد شد.',
    deleteConfirmBtn: 'بله، حساب من حذف شود',
    deleteBusyBtn: 'در حال حذف…',
    deleteCancelBtn: 'انصراف',
    deleteErrorFallback: 'خطا در حذف حساب کاربری.',
    bannerText: (pct) => `پروفایل شما ${pct}٪ تکمیل شده است. برای تکمیل، اطلاعات هویتی خود را وارد کنید.`,
    bannerCompleteBtn: 'تکمیل پروفایل',
    bannerLaterBtn: 'بعداً',
    tripsEmptyText: 'هنوز سفری ثبت نکرده‌اید.',
    searchFlightLink: 'جستجوی پرواز',
    pnrLabel: 'کد رزرو',
    priceLockedBadge: '🔒 قیمت قفل‌شده',
    viewTicketLink: 'مشاهده بلیط',
    continuePaymentLink: 'ادامه پرداخت',
    holdRemainingLabel: (clock) => `مهلت پرداخت ${clock}`,
    walletBalanceHeading: 'موجودی کیف پول',
    topupAmountLabel: 'مبلغ شارژ (تومان)',
    topupPlaceholder: 'مثلاً ۵۰۰۰۰۰',
    topupSubmit: 'شارژ کیف پول',
    topupAmountInvalid: 'مبلغ معتبر وارد کنید.',
    topupErrorFallback: 'خطا در شارژ کیف پول.',
    currentPointsLabel: 'امتیاز فعلی شما',
    pointsTierPrefix: '★ سطح ',
    viewClubLink: 'مشاهده شرایط و سطوح باشگاه ←',
    notMemberText: 'هنوز عضو باشگاه مشتریان نیستید.',
    joinFreeBtn: 'عضویت رایگان',
    locksEmptyText: 'هنوز قفل قیمتی ثبت نکرده‌اید. در نتایج جستجوی پرواز، روی «🔒 قفل قیمت» بزنید (ویژه اعضای طلایی و بالاتر باشگاه مشتریان).',
    lockedRatePrefix: 'نرخ قفل‌شده: ',
    feePrefix: ' · کارمزد: ',
    validUntilPrefix: 'تا ',
    validUntilSuffix: ' معتبر است',
    cancelBtn: 'لغو',
    cancelBusyBtn: 'در حال لغو…',
    cancelErrorFallback: 'خطا در لغو قفل قیمت.',
    passengersEmptyText: 'مسافری ثبت نشده است.',
    refundsEmptyText: 'درخواست استردادی ثبت نشده است.',
    refundableAmountPrefix: 'مبلغ قابل استرداد: ',
    penaltyPrefix: 'جریمه ',
    penaltySuffix: '٪',
    ticketsEmptyText: 'هنوز تیکتی ثبت نکرده‌اید.',
    ticketsNewLink: 'ارسال پیام جدید به پشتیبانی',
    ticketsTrackingLabel: 'کد پیگیری',
    ticketsHistoryHeading: 'رویدادها',
    ticketsLoadError: 'خطا در دریافت تیکت‌ها.',
    ticketsHeading: 'پیام به پشتیبانی',
    ticketsSubtitle: 'پیگیری گفتگوهای شما با تیم پشتیبانی',
    ticketsCreateButton: 'تیکت جدید',
    ticketsCreateHeading: 'ایجاد درخواست جدید',
    ticketsSubjectLabel: 'موضوع',
    ticketsBodyLabel: 'متن پیام',
    ticketsPhoneLabel: 'شماره تماس',
    ticketsSubmitButton: 'ارسال درخواست',
    ticketsCancelButton: 'انصراف',
    ticketsSubjectPlaceholder: 'موضوع درخواست را وارد کنید',
    ticketsBodyPlaceholder: 'پیام خود را بنویسید…',
    ticketsPhonePlaceholder: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷',
    ticketsCreateSuccess: 'درخواست شما ثبت شد ✓',
    securityHeading: 'تغییر رمز عبور',
    securitySub: 'برای امنیت بیشتر، رمز عبور خود را دوره‌ای تغییر دهید. اگر فقط با OTP وارد می‌شوید، فیلد رمز فعلی را خالی بگذارید.',
    currentPasswordLabel: 'رمز عبور فعلی',
    currentPasswordHint: '(اختیاری — فقط ورود با OTP)',
    newPasswordLabel: 'رمز عبور جدید',
    confirmPasswordLabel: 'تکرار رمز عبور جدید',
    savePasswordBtn: 'ثبت رمز عبور جدید',
    savingPasswordBtn: 'در حال ذخیره…',
    passwordSaved: 'رمز عبور با موفقیت تغییر کرد ✓',
    passwordErrorFallback: 'خطا در تغییر رمز عبور.',
    passwordMismatch: 'تکرار رمز عبور جدید مطابقت ندارد.',
    passwordTooShort: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
  },
  en: {
    defaultUserName: 'User',
    memberPrefix: '★ Member ',
    loading: 'Loading…',
    toman: 'Toman',
    completionLabel: 'Profile Completion',
    accountInfoHeading: 'Account Information',
    fullNameLabel: 'Full Name',
    nationalIdLabel: 'National ID',
    passportLabel: 'Passport Number',
    saveButton: 'Save Info',
    savingButton: 'Saving…',
    saveSuccess: 'Profile info saved ✓',
    saveErrorFallback: 'Error saving info.',
    emailHeading: 'Email',
    emailNotSet: 'No email on file.',
    emailVerifiedTag: '· Verified',
    sendVerifyCodeBtn: 'Send Verification Code',
    verifyCodeErrorFallback: 'Error sending the verification code.',
    codeLabel: 'Verification Code',
    verifyBtn: 'Verify',
    verifyCodeIncomplete: 'Enter the full 6-digit code.',
    verifyCodeWrongFallback: 'The code entered is incorrect.',
    emailVerifiedSuccess: 'Your email has been verified ✓',
    emailVerifyRequestNotice: 'A verification code was sent to your email.',
    privacyHeading: 'Privacy & My Data',
    privacyDesc: 'You can download a full export of your personal data (trips, passengers, wallet, refunds) or permanently delete your account.',
    exportBtn: 'Download My Data',
    exportBusyBtn: 'Preparing…',
    exportErrorFallback: 'Error fetching your data.',
    deleteHeading: 'Delete Account',
    deleteWarning: 'This action is irreversible. Your account will be deactivated, your passengers’ identity data will be deleted/anonymized, and all your active sessions will be closed.',
    deleteConfirmBtn: 'Yes, delete my account',
    deleteBusyBtn: 'Deleting…',
    deleteCancelBtn: 'Cancel',
    deleteErrorFallback: 'Error deleting your account.',
    bannerText: (pct) => `Your profile is ${pct}% complete. Enter your identity info to finish it.`,
    bannerCompleteBtn: 'Complete Profile',
    bannerLaterBtn: 'Later',
    tripsEmptyText: "You haven't booked any trips yet.",
    searchFlightLink: 'Search Flights',
    pnrLabel: 'PNR',
    priceLockedBadge: '🔒 Price Locked',
    viewTicketLink: 'View Ticket',
    continuePaymentLink: 'Continue payment',
    holdRemainingLabel: (clock) => `Pay within ${clock}`,
    walletBalanceHeading: 'Wallet Balance',
    topupAmountLabel: 'Top-Up Amount (Toman)',
    topupPlaceholder: 'e.g. 500000',
    topupSubmit: 'Top Up Wallet',
    topupAmountInvalid: 'Enter a valid amount.',
    topupErrorFallback: 'Error topping up the wallet.',
    currentPointsLabel: 'Your Current Points',
    pointsTierPrefix: '★ Tier ',
    viewClubLink: 'View club tiers & terms ←',
    notMemberText: "You're not a loyalty club member yet.",
    joinFreeBtn: 'Join for Free',
    locksEmptyText: 'You haven’t locked any prices yet. On the flight results page, click “🔒 Price Lock” (available to Gold-tier club members and above).',
    lockedRatePrefix: 'Locked rate: ',
    feePrefix: ' · Fee: ',
    validUntilPrefix: 'Valid until ',
    validUntilSuffix: '',
    cancelBtn: 'Cancel',
    cancelBusyBtn: 'Cancelling…',
    cancelErrorFallback: 'Error cancelling the price lock.',
    passengersEmptyText: 'No passengers on file.',
    refundsEmptyText: 'No refund requests on file.',
    refundableAmountPrefix: 'Refundable amount: ',
    penaltyPrefix: '',
    penaltySuffix: '% penalty',
    ticketsEmptyText: 'You have not submitted any support tickets yet.',
    ticketsNewLink: 'Send a new message to support',
    ticketsTrackingLabel: 'Tracking code',
    ticketsHistoryHeading: 'Timeline',
    ticketsLoadError: 'Error loading tickets.',
    ticketsHeading: 'Support messages',
    ticketsSubtitle: 'Track your conversations with our support team',
    ticketsCreateButton: 'New ticket',
    ticketsCreateHeading: 'Create a new request',
    ticketsSubjectLabel: 'Subject',
    ticketsBodyLabel: 'Message',
    ticketsPhoneLabel: 'Phone number',
    ticketsSubmitButton: 'Send request',
    ticketsCancelButton: 'Cancel',
    ticketsSubjectPlaceholder: 'Enter the request subject',
    ticketsBodyPlaceholder: 'Write your message…',
    ticketsPhonePlaceholder: 'e.g. +989121234567',
    ticketsCreateSuccess: 'Your request was submitted ✓',
    securityHeading: 'Change Password',
    securitySub: 'Change your password periodically for extra security. If you only sign in with OTP, leave the current password field empty.',
    currentPasswordLabel: 'Current password',
    currentPasswordHint: '(optional — OTP-only login)',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm new password',
    savePasswordBtn: 'Save new password',
    savingPasswordBtn: 'Saving…',
    passwordSaved: 'Password changed successfully ✓',
    passwordErrorFallback: 'Error changing password.',
    passwordMismatch: 'New password confirmation does not match.',
    passwordTooShort: 'New password must be at least 6 characters.',
  },
  ar: {
    defaultUserName: 'مستخدم',
    memberPrefix: '★ عضو ',
    loading: 'جارٍ التحميل…',
    toman: 'تومان',
    completionLabel: 'تكامل الملف الشخصي',
    accountInfoHeading: 'معلومات الحساب',
    fullNameLabel: 'الاسم الكامل',
    nationalIdLabel: 'الرقم الوطني',
    passportLabel: 'رقم جواز السفر',
    saveButton: 'حفظ المعلومات',
    savingButton: 'جارٍ الحفظ…',
    saveSuccess: 'تم حفظ معلومات الملف الشخصي ✓',
    saveErrorFallback: 'خطأ في حفظ المعلومات.',
    emailHeading: 'البريد الإلكتروني',
    emailNotSet: 'لا يوجد بريد إلكتروني مسجّل.',
    emailVerifiedTag: '· تم التحقق',
    sendVerifyCodeBtn: 'إرسال رمز التحقق',
    verifyCodeErrorFallback: 'خطأ في إرسال رمز التحقق.',
    codeLabel: 'رمز التحقق',
    verifyBtn: 'تحقق',
    verifyCodeIncomplete: 'أدخل الرمز المكوّن من ٦ أرقام كاملاً.',
    verifyCodeWrongFallback: 'الرمز المُدخل غير صحيح.',
    emailVerifiedSuccess: 'تم التحقق من بريدك الإلكتروني ✓',
    emailVerifyRequestNotice: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني.',
    privacyHeading: 'الخصوصية وبياناتي',
    privacyDesc: 'يمكنك تنزيل نسخة كاملة من بياناتك الشخصية (الرحلات، المسافرون، المحفظة، الاستردادات) أو حذف حسابك نهائيًا.',
    exportBtn: 'تنزيل بياناتي',
    exportBusyBtn: 'جارٍ التحضير…',
    exportErrorFallback: 'خطأ في جلب بياناتك.',
    deleteHeading: 'حذف الحساب',
    deleteWarning: 'هذا الإجراء لا رجعة فيه. سيتم إلغاء تفعيل حسابك، وحذف/إخفاء هوية بيانات المسافرين، وإغلاق جميع جلساتك النشطة.',
    deleteConfirmBtn: 'نعم، احذف حسابي',
    deleteBusyBtn: 'جارٍ الحذف…',
    deleteCancelBtn: 'إلغاء',
    deleteErrorFallback: 'خطأ في حذف حسابك.',
    bannerText: (pct) => `ملفك الشخصي مكتمل بنسبة ${pct}٪. أدخل معلومات هويتك لإكماله.`,
    bannerCompleteBtn: 'إكمال الملف الشخصي',
    bannerLaterBtn: 'لاحقًا',
    tripsEmptyText: 'لم تحجز أي رحلة بعد.',
    searchFlightLink: 'البحث عن رحلة',
    pnrLabel: 'رمز الحجز',
    priceLockedBadge: '🔒 السعر مقفل',
    viewTicketLink: 'عرض التذكرة',
    continuePaymentLink: 'متابعة الدفع',
    holdRemainingLabel: (clock) => `مهلة الدفع ${clock}`,
    walletBalanceHeading: 'رصيد المحفظة',
    topupAmountLabel: 'مبلغ الشحن (تومان)',
    topupPlaceholder: 'مثلاً ٥٠٠٠٠٠',
    topupSubmit: 'شحن المحفظة',
    topupAmountInvalid: 'أدخل مبلغًا صحيحًا.',
    topupErrorFallback: 'خطأ في شحن المحفظة.',
    currentPointsLabel: 'نقاطك الحالية',
    pointsTierPrefix: '★ المستوى ',
    viewClubLink: 'عرض شروط ومستويات النادي ←',
    notMemberText: 'لست عضوًا في نادي العملاء بعد.',
    joinFreeBtn: 'انضمام مجاني',
    locksEmptyText: 'لم تُقفل أي سعر بعد. في صفحة نتائج البحث عن الرحلات، اضغط “🔒 قفل السعر” (متاح لأعضاء المستوى الذهبي فما فوق).',
    lockedRatePrefix: 'السعر المقفل: ',
    feePrefix: ' · الرسوم: ',
    validUntilPrefix: 'صالح حتى ',
    validUntilSuffix: '',
    cancelBtn: 'إلغاء',
    cancelBusyBtn: 'جارٍ الإلغاء…',
    cancelErrorFallback: 'خطأ في إلغاء قفل السعر.',
    passengersEmptyText: 'لا يوجد مسافرون مسجّلون.',
    refundsEmptyText: 'لا توجد طلبات استرداد مسجّلة.',
    refundableAmountPrefix: 'المبلغ القابل للاسترداد: ',
    penaltyPrefix: '',
    penaltySuffix: '٪ جزاء',
    ticketsEmptyText: 'لم تُقدّم أي تذكرة دعم بعد.',
    ticketsNewLink: 'إرسال رسالة جديدة للدعم',
    ticketsTrackingLabel: 'رمز التتبع',
    ticketsHistoryHeading: 'الأحداث',
    ticketsLoadError: 'خطأ في تحميل التذاكر.',
    ticketsHeading: 'رسالة إلى الدعم',
    ticketsSubtitle: 'متابعة محادثاتك مع فريق الدعم',
    ticketsCreateButton: 'تذكرة جديدة',
    ticketsCreateHeading: 'إنشاء طلب جديد',
    ticketsSubjectLabel: 'الموضوع',
    ticketsBodyLabel: 'نص الرسالة',
    ticketsPhoneLabel: 'رقم الهاتف',
    ticketsSubmitButton: 'إرسال الطلب',
    ticketsCancelButton: 'إلغاء',
    ticketsSubjectPlaceholder: 'أدخل موضوع الطلب',
    ticketsBodyPlaceholder: 'اكتب رسالتك…',
    ticketsPhonePlaceholder: 'مثال: ٠٩١٢١٢٣٤٥٦٧',
    ticketsCreateSuccess: 'تم تسجيل طلبك ✓',
    securityHeading: 'تغيير كلمة المرور',
    securitySub: 'غيّر كلمة مرورك بشكل دوري لمزيد من الأمان. إذا كنت تدخل فقط برمز OTP، اترك حقل كلمة المرور الحالية فارغاً.',
    currentPasswordLabel: 'كلمة المرور الحالية',
    currentPasswordHint: '(اختياري — دخول OTP فقط)',
    newPasswordLabel: 'كلمة المرور الجديدة',
    confirmPasswordLabel: 'تأكيد كلمة المرور الجديدة',
    savePasswordBtn: 'حفظ كلمة المرور الجديدة',
    savingPasswordBtn: 'جارٍ الحفظ…',
    passwordSaved: 'تم تغيير كلمة المرور بنجاح ✓',
    passwordErrorFallback: 'خطأ في تغيير كلمة المرور.',
    passwordMismatch: 'تأكيد كلمة المرور الجديدة غير متطابق.',
    passwordTooShort: 'يجب أن تكون كلمة المرور الجديدة ٦ أحرف على الأقل.',
  },
};

export default function AccountPage() {
  const { status, user, signOut } = useAuth();
  const { locale } = useLocale();
  const t = STR[locale];
  const { theme, toggleTheme } = usePanelTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState<TabKey>(() => (isAccountTabKey(urlTab) ? urlTab : 'trips'));
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null);
  const [, setHoldTick] = useState(0);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [club, setClub] = useState<{ isMember: boolean; level: string | null; balance: number } | null>(null);
  const [clubMembership, setClubMembership] = useState<ClubMembershipView | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceLocks, setPriceLocks] = useState<PriceLock[] | null>(null);
  const [savedPassengers, setSavedPassengers] = useState<SavedPassenger[] | null>(null);
  const [passengerBusyId, setPassengerBusyId] = useState<string | null>(null);
  const [passengerFormBusy, setPassengerFormBusy] = useState(false);
  const [passengerFormError, setPassengerFormError] = useState<string | null>(null);
  const [passengerFormKey, setPassengerFormKey] = useState(0);
  const [passengersAddPending, setPassengersAddPending] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<SavedBankAccount[] | null>(null);
  const [bankBusyId, setBankBusyId] = useState<string | null>(null);
  const [bankFormBusy, setBankFormBusy] = useState(false);
  const [bankFormError, setBankFormError] = useState<string | null>(null);
  const [referral, setReferral] = useState<CustomerReferralDashboard | null>(null);
  const [referralCopyNotice, setReferralCopyNotice] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CustomerIdentityView | null>(null);
  const [identityUploadBusy, setIdentityUploadBusy] = useState(false);
  const [identitySubmitBusy, setIdentitySubmitBusy] = useState(false);
  const [identityUploadError, setIdentityUploadError] = useState<string | null>(null);
  const [identitySubmitError, setIdentitySubmitError] = useState<string | null>(null);
  const [lockActionBusy, setLockActionBusy] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    nationalId: '',
    birthDate: '',
    passportNo: '',
    address: '',
    email: '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MySupportTicketRow[] | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketComposerOpen, setTicketComposerOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketBody, setTicketBody] = useState('');
  const [ticketPhone, setTicketPhone] = useState('');
  const [ticketAttachment, setTicketAttachment] = useState<File | null>(null);
  const [ticketSubmitBusy, setTicketSubmitBusy] = useState(false);
  const [ticketReplyBusy, setTicketReplyBusy] = useState(false);
  const [ticketSubmitError, setTicketSubmitError] = useState<string | null>(null);
  const [ticketNotice, setTicketNotice] = useState<string | null>(null);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const tripsPager = usePagination(bookings ?? []);

  const selectTab = (next: TabKey) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (isAccountTabKey(urlTab) && urlTab !== tab) {
      setTab(urlTab);
    }
  }, [urlTab, tab]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/signin', { replace: true, state: { from: '/account' } });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchMyBookings().then(setBookings).catch(() => setBookings([]));
    fetchWallet().then(setWallet).catch(() => setWallet({ balanceIrr: '0' }));
    fetchClubPoints().then(setClub).catch(() => setClub(null));
    fetchClubMembership().then(setClubMembership).catch(() => setClubMembership(null));
    fetchMyPriceLocks().then(setPriceLocks).catch(() => setPriceLocks([]));
    fetchSavedPassengers().then(setSavedPassengers).catch(() => setSavedPassengers([]));
    fetchMySessions().then(setSessions).catch(() => setSessions([]));
    fetchBankAccounts().then(setBankAccounts).catch(() => setBankAccounts([]));
    fetchMyReferral().then(setReferral).catch(() => setReferral(null));
    fetchMyIdentity().then(setIdentity).catch(() => setIdentity(null));
    fetchMyProfile()
      .then((p) => {
        const name = splitPersonName(p.fullName);
        setProfile(p);
        setProfileForm({
          firstName: name.firstName,
          lastName: name.lastName,
          nationalId: p.nationalId ?? '',
          birthDate: p.birthDate ? formatLocaleDate(p.birthDate, locale) : '',
          passportNo: p.passportNo ?? '',
          address: p.address ?? '',
          email: p.email ?? '',
        });
      })
      .catch(() => setProfile(null));
    fetchMySupportTickets()
      .then(setTickets)
      .catch(() => {
        setTickets([]);
        setTicketsError(STR.fa.ticketsLoadError);
      });
  }, [status, locale]);

  useEffect(() => {
    const hasOpenHold = bookings?.some((b) => isHoldPayable(b));
    if (!hasOpenHold) return;
    const id = window.setInterval(() => setHoldTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [bookings]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileNotice(null);
    setProfileSaving(true);
    try {
      const birthDate = profileForm.birthDate.trim()
        ? parseLocaleDateToIso(profileForm.birthDate, locale)?.slice(0, 10)
        : undefined;
      if (profileForm.birthDate.trim() && !birthDate) {
        setProfileError(locale === 'en' ? 'Invalid date of birth.' : 'تاریخ تولد نامعتبر است.');
        return;
      }
      const updated = await updateMyProfile({
        fullName: joinPersonName(profileForm.firstName, profileForm.lastName) || undefined,
        nationalId: profileForm.nationalId || undefined,
        birthDate,
        passportNo: profileForm.passportNo || undefined,
        address: profileForm.address.trim() || undefined,
        email: profileForm.email.trim() || undefined,
      });
      setProfile(updated);
      setProfileForm((current) => ({
        ...current,
        ...splitPersonName(updated.fullName),
        email: updated.email ?? '',
      }));
      setProfileNotice(t.saveSuccess);
    } catch (err) {
      setProfileError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
    } finally {
      setProfileSaving(false);
    }
  }

  async function onRequestEmailVerify() {
    setProfileError(null);
    try {
      const { challengeId } = await requestEmailVerify();
      setEmailChallengeId(challengeId);
      setProfileNotice(t.emailVerifyRequestNotice);
    } catch (err) {
      setProfileError(err instanceof ApiRequestError ? err.message : t.verifyCodeErrorFallback);
    }
  }

  async function onVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailChallengeId || emailCode.trim().length !== 6) {
      setProfileError(t.verifyCodeIncomplete);
      return;
    }
    setProfileError(null);
    try {
      await verifyEmail(emailChallengeId, emailCode.trim());
      setEmailChallengeId(null);
      setEmailCode('');
      const updated = await fetchMyProfile();
      setProfile(updated);
      setProfileNotice(t.emailVerifiedSuccess);
    } catch (err) {
      setProfileError(err instanceof ApiRequestError ? err.message : t.verifyCodeWrongFallback);
    }
  }

  async function onExportData() {
    setExportError(null);
    setExportBusy(true);
    try {
      const data = await fetchPrivacyExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'blujet-my-data.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiRequestError ? err.message : t.exportErrorFallback);
    } finally {
      setExportBusy(false);
    }
  }

  async function onConfirmDelete() {
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await deleteMyAccount();
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : t.deleteErrorFallback);
      setDeleteBusy(false);
    }
  }

  async function onTopup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountRial = parseTomanToRial(topupAmount);
    if (!amountRial || amountRial <= 0) {
      setError(t.topupAmountInvalid);
      return;
    }
    setTopupBusy(true);
    try {
      await topupWallet(amountRial);
      setWallet(await fetchWallet());
      setTopupAmount('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.topupErrorFallback);
    } finally {
      setTopupBusy(false);
    }
  }

  async function onSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    setTicketSubmitError(null);
    setTicketNotice(null);
    if (ticketSubject.trim().length < 2 || ticketBody.trim().length < 2 || ticketPhone.trim().length < 8) {
      setTicketSubmitError(locale === 'en' ? 'Enter a subject, message, and valid phone number.' : locale === 'ar' ? 'أدخل الموضوع والرسالة ورقم هاتف صحيح.' : 'موضوع، متن پیام و شماره تماس معتبر را وارد کنید.');
      return;
    }
    setTicketSubmitBusy(true);
    let uploadedAttachmentId: string | null = null;
    try {
      if (ticketAttachment) {
        const uploaded = await uploadFile(ticketAttachment);
        uploadedAttachmentId = uploaded.id;
      }
      await submitMySupportTicket({
        requesterName: profile?.fullName || user?.fullName || t.defaultUserName,
        requesterPhone: ticketPhone.trim(),
        subject: ticketSubject.trim(),
        body: ticketBody.trim(),
        attachmentIds: uploadedAttachmentId ? [uploadedAttachmentId] : undefined,
      });
      const refreshed = await fetchMySupportTickets();
      setTickets(refreshed);
      setTicketSubject('');
      setTicketBody('');
      setTicketPhone('');
      setTicketAttachment(null);
      setTicketComposerOpen(false);
      setTicketNotice(t.ticketsCreateSuccess);
    } catch (err) {
      if (uploadedAttachmentId) {
        void deleteFile(uploadedAttachmentId).catch(() => undefined);
      }
      setTicketSubmitError(err instanceof ApiRequestError ? err.message : t.ticketsLoadError);
    } finally {
      setTicketSubmitBusy(false);
    }
  }

  async function onReplyTicket(id: string, body: string, attachmentIds: string[]) {
    setTicketReplyBusy(true);
    setTicketNotice(null);
    try {
      const updated = await replyMySupportTicket(id, {
        body,
        attachmentIds: attachmentIds.length ? attachmentIds : undefined,
      });
      setTickets((current) =>
        current?.map((ticket) => (ticket.id === id ? updated : ticket)) ?? [updated],
      );
      setTicketNotice(locale === 'fa' ? 'پیام شما ارسال شد ✓' : locale === 'ar' ? 'تم إرسال رسالتك ✓' : 'Your message was sent ✓');
    } finally {
      setTicketReplyBusy(false);
    }
  }

  async function onTicketFeedback(id: string, satisfied: boolean) {
    setTicketReplyBusy(true);
    try {
      const updated = await submitMySupportTicketFeedback(id, satisfied);
      setTickets((current) => current?.map((ticket) => ticket.id === id ? updated : ticket) ?? [updated]);
      setTicketNotice(satisfied
        ? locale === 'fa' ? 'رضایت شما ثبت و تیکت بسته شد؛ شماره پیگیری همچنان قابل جستجو است.' : locale === 'ar' ? 'تم تسجيل رضاك وإغلاق التذكرة، ويبقى رقم التتبع قابلاً للبحث.' : 'Your feedback was recorded and the ticket was closed; its tracking number remains searchable.'
        : locale === 'fa' ? 'نارضایتی شما ثبت شد و تیکت برای پیگیری مجدد باز شد.' : locale === 'ar' ? 'تم تسجيل عدم رضاك وأعيد فتح التذكرة للمتابعة.' : 'Your feedback was recorded and the ticket was reopened for follow-up.');
    } finally {
      setTicketReplyBusy(false);
    }
  }

  async function onRemovePassenger(id: string) {
    setPassengerBusyId(id);
    try {
      await removeSavedPassenger(id);
      setSavedPassengers((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
    } finally {
      setPassengerBusyId(null);
    }
  }

  async function onRevokeSession(id: string) {
    setSessionError(null);
    setSessionBusyId(id);
    try {
      await revokeMySession(id);
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    } catch (err) {
      setSessionError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
    } finally {
      setSessionBusyId(null);
    }
  }

  async function onRemoveBankAccount(id: string) {
    setBankBusyId(id);
    try {
      await removeBankAccount(id);
      setBankAccounts((prev) => {
        if (!prev) return prev;
        const next = prev.filter((a) => a.id !== id);
        if (next.length > 0 && !next.some((a) => a.isDefault)) {
          return next.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
    } finally {
      setBankBusyId(null);
    }
  }

  async function onSetDefaultBankAccount(id: string) {
    setBankBusyId(id);
    try {
      const updated = await updateBankAccount(id, { isDefault: true });
      setBankAccounts((prev) =>
        prev
          ? prev.map((a) =>
              a.id === updated.id ? updated : { ...a, isDefault: false },
            )
          : prev,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
    } finally {
      setBankBusyId(null);
    }
  }

  async function onCreateBankAccount(form: BankAccountForm) {
    setBankFormError(null);
    setBankFormBusy(true);
    try {
      const created = await createBankAccount(form);
      setBankAccounts((prev) => (prev ? [created, ...prev] : [created]));
    } catch (err) {
      setBankFormError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
      throw err;
    } finally {
      setBankFormBusy(false);
    }
  }

  function onCopyReferralCode() {
    if (!referral) return;
    void navigator.clipboard.writeText(referral.referralCode).then(() => {
      setReferralCopyNotice(
        locale === 'fa'
          ? 'کد معرف کپی شد ✓'
          : locale === 'en'
            ? 'Referral code copied ✓'
            : 'تم نسخ رمز الإحالة ✓',
      );
      window.setTimeout(() => setReferralCopyNotice(null), 2500);
    });
  }

  function onShareReferralLink() {
    if (!referral) return;
    const url = `${window.location.origin}${referral.sharePath}`;
    if (navigator.share) {
      void navigator.share({ title: 'blujet', url }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(url);
      setReferralCopyNotice(
        locale === 'fa'
          ? 'لینک دعوت کپی شد ✓'
          : locale === 'en'
            ? 'Invite link copied ✓'
            : 'تم نسخ رابط الدعوة ✓',
      );
      window.setTimeout(() => setReferralCopyNotice(null), 2500);
    }
  }

  async function onUploadIdentityIdCard(file: File) {
    setIdentityUploadError(null);
    setIdentityUploadBusy(true);
    try {
      await uploadIdentityIdCard(file);
      setIdentity(await fetchMyIdentity());
    } catch (err) {
      setIdentityUploadError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
      throw err;
    } finally {
      setIdentityUploadBusy(false);
    }
  }

  async function onSubmitIdentity() {
    setIdentitySubmitError(null);
    setIdentitySubmitBusy(true);
    try {
      setIdentity(await submitIdentityVerification());
    } catch (err) {
      setIdentitySubmitError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
      throw err;
    } finally {
      setIdentitySubmitBusy(false);
    }
  }

  async function onSavePassenger(form: SavedPassengerForm, editingId: string | null) {
    setPassengerFormError(null);
    setPassengerFormBusy(true);
    try {
      if (!form.gender) {
        setPassengerFormError(locale === 'en' ? 'Gender is required.' : 'انتخاب جنسیت الزامی است.');
        throw new Error('gender');
      }
      const birthDate = parseLocaleDateToIso(
        `${form.birthYear}/${form.birthMonth}/${form.birthDay}`,
        locale,
      )?.slice(0, 10);
      if (!birthDate) {
        setPassengerFormError(
          locale === 'en' ? 'Invalid date of birth.' : 'تاریخ تولد نامعتبر است.',
        );
        throw new Error('birthDate');
      }
      const dto = {
        fullName: joinPersonName(form.firstName, form.lastName),
        latinName: joinPersonName(form.firstNameLatin, form.lastNameLatin),
        gender: form.gender,
        birthDate,
        nationalId: form.nationalId.trim() || undefined,
        passportNo: form.passportNo.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        isChild: form.isChild,
      };
      if (editingId) {
        const updated = await updateSavedPassenger(editingId, dto);
        setSavedPassengers((prev) =>
          prev ? prev.map((p) => (p.id === editingId ? updated : p)) : prev,
        );
      } else {
        const created = await createSavedPassenger(dto);
        setSavedPassengers((prev) => (prev ? [created, ...prev] : [created]));
      }
      setPassengerFormKey((k) => k + 1);
    } catch (err) {
      if (err instanceof Error && (err.message === 'gender' || err.message === 'birthDate')) {
        throw err;
      }
      setPassengerFormError(err instanceof ApiRequestError ? err.message : t.saveErrorFallback);
      throw err;
    } finally {
      setPassengerFormBusy(false);
    }
  }

  async function onCancelLock(id: string) {
    setLockError(null);
    setLockActionBusy(id);
    try {
      const updated = await cancelPriceLock(id);
      setPriceLocks((prev) => (prev ? prev.map((l) => (l.id === id ? updated : l)) : prev));
    } catch (err) {
      setLockError(err instanceof ApiRequestError ? err.message : t.cancelErrorFallback);
    } finally {
      setLockActionBusy(null);
    }
  }

  async function onSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwNotice(null);
    if (pwNew.length < 6) {
      setPwError(t.passwordTooShort);
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError(t.passwordMismatch);
      return;
    }
    setPwSaving(true);
    try {
      if (pwCur.trim()) {
        await changeOwnPassword(pwCur, pwNew);
      } else {
        await setPassword(pwNew);
      }
      setPwNotice(t.passwordSaved);
      setPwCur('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err instanceof ApiRequestError ? err.message : t.passwordErrorFallback);
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <PublicPageShell>
      <div
        data-testid="customer-panel-shell"
        data-theme={theme}
        className={`portal-panel-theme portal-panel-theme--${theme} account-panel-theme`}
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: '20px 22px 44px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '262px 1fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: locale === 'en' ? 'flex-end' : 'flex-start' }}>
          <PanelThemeToggle
            theme={theme}
            onToggle={toggleTheme}
            lightLabel={locale === 'en' ? 'Light mode' : locale === 'ar' ? 'الوضع الفاتح' : 'حالت روشن'}
            darkLabel={locale === 'en' ? 'Dark mode' : locale === 'ar' ? 'الوضع الداكن' : 'حالت تیره'}
          />
        </div>
        <AccountSidebar
          tab={tab}
          onTabChange={selectTab}
          user={user}
          club={club}
          onSignOut={async () => {
            try {
              await signOut();
            } finally {
              navigate('/', { replace: true });
            }
          }}
          isMobile={isMobile}
        />

        <main style={{ minWidth: 0 }}>
        {error && <p style={{ marginBottom: 16, borderRadius: 10, background: '#fef2f2', padding: 10, fontSize: 12, color: '#e5484d' }}>{error}</p>}

        {profile && profile.completionPct < 100 && !bannerDismissed && tab !== 'profile' && (
          <div
            data-testid="profile-incomplete-banner"
            style={{
              marginBottom: 16,
              borderRadius: 12,
              background: '#fff8ec',
              border: '1px solid #f2e0b2',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12.5, color: '#8a6a1f' }}>
              {t.bannerText(localeDigits(Math.round(profile.completionPct), locale))}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => selectTab('account-info')}
                style={{ border: 'none', borderRadius: 9, background: '#e7c66b', color: '#3b2f0e', padding: '7px 14px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t.bannerCompleteBtn}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                style={{ border: 'none', background: 'transparent', color: '#8a6a1f', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t.bannerLaterBtn}
              </button>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <AccountProfileTab
            user={user}
            profile={profile}
            bookings={bookings}
            clubBalance={club?.balance ?? 0}
            walletBalanceIrr={wallet?.balanceIrr ?? null}
            passengerCount={savedPassengers?.length ?? 0}
            isMobile={isMobile}
            onNavigateTab={selectTab}
          />
        )}

        {tab === 'account-info' && (
          <AccountInfoTab
            profile={profile}
            profileForm={profileForm}
            onProfileFormChange={setProfileForm}
            onSaveProfile={onSaveProfile}
            profileSaving={profileSaving}
            profileError={profileError}
            profileNotice={profileNotice}
            isMobile={isMobile}
            emailChallengeId={emailChallengeId}
            emailCode={emailCode}
            onEmailCodeChange={setEmailCode}
            onRequestEmailVerify={onRequestEmailVerify}
            onVerifyEmail={onVerifyEmail}
          />
        )}

        {tab === 'trips' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bookings === null && <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>}
            {bookings?.length === 0 && (
              <div style={{ background: '#fff', border: '1px dashed #e5e9f0', borderRadius: 16, padding: 40, textAlign: 'center', color: '#8a96a6', fontSize: 13 }}>
                {t.tripsEmptyText}{' '}
                <Link to="/" style={{ color: '#1668c4', fontWeight: 700 }}>
                  {t.searchFlightLink}
                </Link>
              </div>
            )}
            {tripsPager.pageItems.map((b) => {
              const statusKey = displayTripStatus(b);
              const st = STATUS_LABEL[statusKey] ?? { label: { fa: statusKey, en: statusKey, ar: statusKey }, bg: '#f1f4f8', color: '#5a6678' };
              const payable = isHoldPayable(b);
              const holdSecs = payable ? holdSecondsLeft(b.holdExpiresAt) : 0;
              return (
                <div key={b.id} data-testid="account-trip" data-status={statusKey} style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0d2640' }}>
                      {b.originCode} <span style={{ color: '#b9c2cf' }}>{locale === 'en' ? '→' : '←'}</span> {b.destCode}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#8a96a6', marginTop: 4 }}>
                      {b.flightNo} · {formatLocaleDateTime(b.departureAt, locale)} · {t.pnrLabel} <span dir="ltr">{b.pnr}</span>
                    </div>
                    {payable && (
                      <div
                        data-testid="trip-hold-remaining"
                        style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#9a7d22' }}
                      >
                        {t.holdRemainingLabel(formatHoldClock(holdSecs, locale))}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      width: isMobile ? '100%' : undefined,
                    }}
                  >
                    {b.isPriceLocked && (
                      <span data-testid="trip-price-locked-badge" style={{ fontSize: 10.5, fontWeight: 800, background: '#fff7e6', color: '#9a7d22', padding: '5px 12px', borderRadius: 14 }}>
                        {t.priceLockedBadge}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 800, background: st.bg, color: st.color, padding: '5px 12px', borderRadius: 14 }}>{st.label[locale]}</span>
                    {canViewETicket(b) && (
                      <Link
                        to={`/ticket/${b.pnr}`}
                        data-testid="trip-view-ticket"
                        style={{ fontSize: 11.5, color: '#1668c4', fontWeight: 700, textDecoration: 'none' }}
                      >
                        {t.viewTicketLink}
                      </Link>
                    )}
                    {payable && (
                      <Link
                        to={`/payment/${b.id}`}
                        data-testid="trip-continue-payment"
                        style={{ fontSize: 11.5, color: '#fff', fontWeight: 800, textDecoration: 'none', background: '#1668c4', padding: '7px 12px', borderRadius: 10 }}
                      >
                        {t.continuePaymentLink}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
            <Pagination
              page={tripsPager.page}
              totalPages={tripsPager.totalPages}
              onChange={tripsPager.setPage}
              variant="light"
              previousLabel={locale === 'en' ? 'Previous page' : locale === 'ar' ? 'الصفحة السابقة' : 'صفحه قبل'}
              nextLabel={locale === 'en' ? 'Next page' : locale === 'ar' ? 'الصفحة التالية' : 'صفحه بعد'}
            />
          </div>
        )}

        {tab === 'wallet' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'linear-gradient(120deg,#1668c4,#0d3b66)', borderRadius: 18, padding: '22px 24px', color: '#fff', minHeight: 132, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{t.walletBalanceHeading}</div>
                <div data-testid="wallet-balance" style={{ fontSize: 26, fontWeight: 900 }}>
                  {wallet ? localeMoney(wallet.balanceIrr, locale) : '—'} <span style={{ fontSize: 12, fontWeight: 400 }}>{t.toman}</span>
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById('wallet-topup-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  style={{ alignSelf: 'flex-start', border: 'none', borderRadius: 10, background: '#fff', color: '#0d3b66', padding: '8px 14px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  + {locale === 'fa' ? 'افزایش موجودی' : locale === 'ar' ? 'زيادة الرصيد' : 'Add funds'}
                </button>
              </div>
              <div style={{ background: 'linear-gradient(120deg,#d5ae32,#b58d1a)', borderRadius: 18, padding: '22px 24px', color: '#fff', minHeight: 132, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{t.currentPointsLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{localeDigits(club?.balance ?? 0, locale)} <span style={{ fontSize: 12, fontWeight: 400 }}>{locale === 'fa' ? 'امتیاز' : locale === 'ar' ? 'نقطة' : 'points'}</span></div>
                <Link to="/account?tab=club" style={{ alignSelf: 'flex-start', color: '#fff', fontSize: 11.5, fontWeight: 800, textDecoration: 'underline' }}>{t.viewClubLink}</Link>
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 16, padding: '20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: '#0d2640' }}>{locale === 'fa' ? 'گردش کیف پول' : locale === 'ar' ? 'سجل المحفظة' : 'Wallet history'}</h3>
              {(wallet?.entries ?? []).length === 0 ? (
                <div style={{ color: '#8a96a6', fontSize: 13, textAlign: 'center', padding: 8 }}>{locale === 'fa' ? 'تراکنشی برای نمایش ثبت نشده است.' : locale === 'ar' ? 'لا توجد معاملات لعرضها.' : 'No wallet transactions to display.'}</div>
              ) : (
                <div data-testid="wallet-history" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(wallet?.entries ?? []).map((entry) => {
                    const positive = !entry.signedAmountIrr.startsWith('-');
                    const absoluteIrr = entry.signedAmountIrr.replace(/^-/, '');
                    const labels = {
                      TOPUP: locale === 'fa' ? 'شارژ کیف پول' : locale === 'ar' ? 'شحن المحفظة' : 'Wallet top-up',
                      PURCHASE: locale === 'fa' ? 'خرید بلیط' : locale === 'ar' ? 'شراء تذكرة' : 'Ticket purchase',
                      REFUND: locale === 'fa' ? 'بازگشت وجه' : locale === 'ar' ? 'استرداد' : 'Refund',
                      ADJUST: locale === 'fa' ? 'اصلاح مالی' : locale === 'ar' ? 'تسوية مالية' : 'Adjustment',
                    };
                    return (
                      <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto auto', alignItems: 'center', gap: 12, border: '1px solid #edf1f6', borderRadius: 12, padding: '11px 13px' }}>
                        <div>
                          <div style={{ color: '#0d2640', fontSize: 12.5, fontWeight: 800 }}>{labels[entry.type]}</div>
                          {entry.pnr && <div dir="ltr" style={{ marginTop: 3, color: '#7b8798', fontSize: 10.5 }}>PNR {entry.pnr}</div>}
                        </div>
                        {!isMobile && <div style={{ color: '#8a96a6', fontSize: 10.5 }}>{formatLocaleDateTime(entry.createdAt, locale)}</div>}
                        <div dir="ltr" style={{ color: positive ? '#18875f' : '#c43d45', fontSize: 12.5, fontWeight: 900 }}>
                          {positive ? '+' : '−'} {localeMoney(absoluteIrr, locale)} {t.toman}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <form id="wallet-topup-form" onSubmit={onTopup} style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 16, padding: '18px 20px', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>{t.topupAmountLabel}</label>
                <MoneyInput
                  theme="light"
                  locale={locale}
                  testId="wallet-topup-amount"
                  valueToman={topupAmount}
                  onChangeToman={setTopupAmount}
                  placeholder={t.topupPlaceholder}
                />
                {tomanAmountInWords(topupAmount, locale) && (
                  <div
                    data-testid="wallet-topup-amount-words"
                    style={{ marginTop: 7, fontSize: 11.5, color: '#8a96a6', fontWeight: 600, lineHeight: 1.6 }}
                  >
                    {tomanAmountInWords(topupAmount, locale)}
                  </div>
                )}
              </div>
              <div
                data-testid="wallet-topup-submit-cell"
                style={{ display: 'flex', alignItems: 'flex-end', minHeight: 76 }}
              >
                <button
                  type="submit"
                  data-testid="wallet-topup-submit"
                  disabled={topupBusy}
                  style={{ border: 'none', borderRadius: 10, background: '#1668c4', color: '#fff', padding: '11px 22px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {t.topupSubmit}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'loans' && <AccountLoansTab />}

        {tab === 'club' && (
          clubMembership === null ? (
            <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>
          ) : (
            <AccountClubTab
              membership={clubMembership}
              onMembershipChange={(m) => {
                setClubMembership(m);
                setClub({ isMember: m.isMember, level: m.level, balance: m.balance });
              }}
            />
          )
        )}

        {tab === 'price-locks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lockError && <p role="alert" style={{ fontSize: 12, color: '#e5484d' }}>{lockError}</p>}
            {priceLocks === null && <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>}
            {priceLocks?.length === 0 && (
              <div style={{ background: '#fff', border: '1px dashed #e5e9f0', borderRadius: 16, padding: 40, textAlign: 'center', color: '#8a96a6', fontSize: 13 }}>
                {t.locksEmptyText}
              </div>
            )}
            {priceLocks?.map((l) => {
              const st = LOCK_STATUS_LABEL[l.status] ?? { label: { fa: l.status, en: l.status, ar: l.status }, bg: '#f1f4f8', color: '#5a6678' };
              return (
                <div key={l.id} data-testid="account-price-lock" style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0d2640' }}>
                      {l.flight.originCode} <span style={{ color: '#b9c2cf' }}>{locale === 'en' ? '→' : '←'}</span> {l.flight.destCode}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#8a96a6', marginTop: 4 }}>
                      {l.flight.flightNo} · {formatLocaleDateTime(l.flight.departureAt, locale)} · {CABIN_LABEL[l.cabin]?.[locale] ?? l.cabin}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#3f546b', marginTop: 4 }}>
                      {t.lockedRatePrefix}{localeMoney(l.lockedPriceIrr, locale)} {t.toman}{t.feePrefix}{localeMoney(l.feeIrr, locale)} {t.toman}
                    </div>
                    {l.status === 'ACTIVE' && (
                      <div style={{ fontSize: 11, color: '#9a7d22', marginTop: 4 }}>
                        {t.validUntilPrefix}{formatLocaleDateTime(l.expiresAt, locale)}{t.validUntilSuffix}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, background: st.bg, color: st.color, padding: '5px 12px', borderRadius: 14 }}>{st.label[locale]}</span>
                    {l.status === 'ACTIVE' && (
                      <button
                        type="button"
                        data-testid={`cancel-price-lock-${l.id}`}
                        disabled={lockActionBusy === l.id}
                        onClick={() => void onCancelLock(l.id)}
                        style={{ border: '1px solid #e5484d', borderRadius: 10, background: 'transparent', color: '#e5484d', padding: '7px 14px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {lockActionBusy === l.id ? t.cancelBusyBtn : t.cancelBtn}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'passengers' && savedPassengers && (
          <AccountPassengersTab
            key={passengerFormKey}
            passengers={savedPassengers}
            busyId={passengerBusyId}
            formBusy={passengerFormBusy}
            formError={passengerFormError}
            openAddOnMount={passengersAddPending}
            onAddModalOpened={() => setPassengersAddPending(false)}
            onRemove={onRemovePassenger}
            onSave={onSavePassenger}
          />
        )}
        {tab === 'passengers' && savedPassengers === null && (
          <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>
        )}

        {tab === 'banks' && bankAccounts && (
          <AccountBankAccountsTab
            accounts={bankAccounts}
            busyId={bankBusyId}
            formBusy={bankFormBusy}
            formError={bankFormError}
            onRemove={onRemoveBankAccount}
            onSetDefault={onSetDefaultBankAccount}
            onCreate={onCreateBankAccount}
          />
        )}
        {tab === 'banks' && bankAccounts === null && (
          <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>
        )}

        {tab === 'referral' && referral && (
          <AccountReferralTab
            data={referral}
            copyNotice={referralCopyNotice}
            onCopy={onCopyReferralCode}
            onShare={onShareReferralLink}
          />
        )}
        {tab === 'referral' && referral === null && (
          <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>
        )}

        {tab === 'identity' && identity && (
          <AccountIdentityTab
            data={identity}
            uploadBusy={identityUploadBusy}
            submitBusy={identitySubmitBusy}
            uploadError={identityUploadError}
            submitError={identitySubmitError}
            onUpload={onUploadIdentityIdCard}
            onSubmit={onSubmitIdentity}
            onGoProfile={() => selectTab('profile')}
          />
        )}
        {tab === 'identity' && identity === null && (
          <p style={{ fontSize: 13, color: '#6b7787' }}>{t.loading}</p>
        )}

        {tab === 'refunds' && <AccountRefundsTab />}

        {tab === 'tickets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SupportConversationCenter
              theme="light"
              locale={locale}
              tickets={tickets}
              selectedId={expandedTicketId}
              onSelect={setExpandedTicketId}
              onReply={onReplyTicket}
              onFeedback={onTicketFeedback}
              onNew={() => { setTicketSubmitError(null); setTicketNotice(null); setTicketComposerOpen(true); }}
              newLabel={t.ticketsCreateHeading}
              busy={ticketReplyBusy}
            />
            {ticketsError && <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: 0 }}>{ticketsError}</p>}
            {ticketNotice && <p role="status" style={{ fontSize: 12, color: '#059669', fontWeight: 700, margin: 0 }}>{ticketNotice}</p>}
            {ticketComposerOpen && (
              <div role="dialog" aria-modal="true" aria-label={t.ticketsCreateHeading} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8, 21, 39, 0.58)', display: 'grid', placeItems: 'center', padding: 16 }}>
                <form onSubmit={(e) => void onSubmitTicket(e)} style={{ width: 'min(100%, 560px)', maxHeight: 'min(760px, calc(100vh - 32px))', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22, boxSizing: 'border-box', boxShadow: '0 24px 70px rgba(0,0,0,.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                    <h3 style={{ margin: 0, color: '#0d2640', fontSize: 16, fontWeight: 900 }}>{t.ticketsCreateHeading}</h3>
                    <button type="button" aria-label={t.ticketsCancelButton} onClick={() => setTicketComposerOpen(false)} style={{ border: 'none', background: '#f1f4f8', color: '#5a6678', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 18 }}>×</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#5a6678', fontSize: 11.5, fontWeight: 700 }}>
                      {t.ticketsSubjectLabel}
                      <input value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder={t.ticketsSubjectPlaceholder} required style={{ height: 44, border: '1px solid #dfe7f0', borderRadius: 11, padding: '0 12px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#5a6678', fontSize: 11.5, fontWeight: 700 }}>
                      {t.ticketsBodyLabel}
                      <textarea value={ticketBody} onChange={(e) => setTicketBody(e.target.value)} placeholder={t.ticketsBodyPlaceholder} required rows={5} style={{ resize: 'vertical', minHeight: 120, border: '1px solid #dfe7f0', borderRadius: 11, padding: 12, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#5a6678', fontSize: 11.5, fontWeight: 700 }}>
                      {t.ticketsPhoneLabel}
                      <input dir="ltr" value={ticketPhone} onChange={(e) => setTicketPhone(e.target.value)} placeholder={t.ticketsPhonePlaceholder} required inputMode="tel" style={{ height: 44, border: '1px solid #dfe7f0', borderRadius: 11, padding: '0 12px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#5a6678', fontSize: 11.5, fontWeight: 700 }}>
                      {locale === 'en' ? 'Attachment (optional)' : locale === 'ar' ? 'المرفق (اختياري)' : 'فایل پیوست (اختیاری)'}
                      <span style={{ minHeight: 70, border: '1.5px dashed #bfd0e2', borderRadius: 12, background: '#f8fbff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', cursor: 'pointer' }}>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', color: '#1668c4', fontSize: 12 }}>{ticketAttachment ? ticketAttachment.name : locale === 'fa' ? 'انتخاب فایل' : 'Choose file'}</strong>
                          <small style={{ display: 'block', marginTop: 4, color: '#8a96a6', fontSize: 10.5 }}>{locale === 'fa' ? 'PDF، PNG یا JPG — حداکثر ۵ مگابایت' : 'PDF, PNG or JPG — max 5 MB'}</small>
                        </span>
                        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: '#eaf2fc', display: 'grid', placeItems: 'center', color: '#1668c4', fontSize: 18 }}>＋</span>
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          data-testid="ticket-attachment-input"
                          style={{ display: 'none' }}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (!file) return;
                            if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                              setTicketSubmitError(locale === 'fa' ? 'فقط PDF، PNG یا JPG تا حجم ۵ مگابایت مجاز است.' : 'Only PDF, PNG or JPG files up to 5 MB are allowed.');
                              event.target.value = '';
                              return;
                            }
                            setTicketSubmitError(null);
                            setTicketAttachment(file);
                          }}
                        />
                      </span>
                    </label>
                    {ticketSubmitError && <p role="alert" style={{ color: '#e5484d', fontSize: 12, margin: 0 }}>{ticketSubmitError}</p>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                      <button type="button" onClick={() => setTicketComposerOpen(false)} style={{ border: 'none', borderRadius: 10, background: '#f1f4f8', color: '#5a6678', padding: '10px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{t.ticketsCancelButton}</button>
                      <button type="submit" disabled={ticketSubmitBusy} style={{ border: 'none', borderRadius: 10, background: '#1668c4', color: '#fff', padding: '10px 18px', fontSize: 12, fontWeight: 800, cursor: ticketSubmitBusy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{ticketSubmitBusy ? t.loading : t.ticketsSubmitButton}</button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === 'security' && (
          <div data-testid="account-security-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 'none' }}>
            <div data-testid="account-password-card" style={{ background: '#fff', border: '1px solid #e4ebf3', borderRadius: 18, padding: isMobile ? 16 : 22, boxShadow: '0 8px 24px rgba(13,38,64,.045)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
              <span aria-hidden="true" style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, display: 'grid', placeItems: 'center', background: '#eaf2fc', color: '#1668c4', fontSize: 20 }}>🔐</span>
              <div>
                <h3 style={{ fontSize: 16, color: '#0d2640', fontWeight: 900, margin: '0 0 5px' }}>{t.securityHeading}</h3>
                <p style={{ fontSize: 11.5, color: '#7d8998', margin: 0, lineHeight: 1.8 }}>{t.securitySub}</p>
              </div>
            </div>
            <form onSubmit={(e) => void onSavePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13, maxWidth: 680 }}>
              <div>
                <label htmlFor="acct-pw-cur" style={{ display: 'block', fontSize: 11.5, color: '#6b7787', marginBottom: 6 }}>
                  {t.currentPasswordLabel} <span style={{ fontSize: 10 }}>{t.currentPasswordHint}</span>
                </label>
                <input
                  id="acct-pw-cur"
                  type="password"
                  value={pwCur}
                  onChange={(e) => setPwCur(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, border: '1.5px solid #e3e8ef', borderRadius: 12, padding: '0 14px', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid #e4eaf1', borderRadius: 11, background: '#f8fafc', padding: '10px 12px', color: '#718096', fontSize: 10.5, lineHeight: 1.7 }}>
                <span>✓ {locale === 'fa' ? 'حداقل ۶ کاراکتر' : locale === 'ar' ? '٦ أحرف على الأقل' : 'At least 6 characters'}</span>
                <span>·</span>
                <span>{locale === 'fa' ? 'ترکیب حروف و عدد پیشنهاد می‌شود' : locale === 'ar' ? 'يُنصح بمزج الأحرف والأرقام' : 'Letters and numbers are recommended'}</span>
              </div>
              <div>
                <label htmlFor="acct-pw-new" style={{ display: 'block', fontSize: 11.5, color: '#6b7787', marginBottom: 6 }}>{t.newPasswordLabel}</label>
                <input
                  id="acct-pw-new"
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, border: '1.5px solid #e3e8ef', borderRadius: 12, padding: '0 14px', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label htmlFor="acct-pw-confirm" style={{ display: 'block', fontSize: 11.5, color: '#6b7787', marginBottom: 6 }}>{t.confirmPasswordLabel}</label>
                <input
                  id="acct-pw-confirm"
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, border: '1.5px solid #e3e8ef', borderRadius: 12, padding: '0 14px', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>
              {pwError && <p role="alert" style={{ fontSize: 12, color: '#e5484d' }}>{pwError}</p>}
              {pwNotice && <p style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>{pwNotice}</p>}
              <button
                type="submit"
                data-testid="account-save-password"
                disabled={pwSaving}
                style={{ marginTop: 4, minWidth: isMobile ? '100%' : 220, alignSelf: locale === 'en' ? 'flex-start' : 'flex-end', height: 46, borderRadius: 11, background: '#1668c4', color: '#fff', fontSize: 12.5, fontWeight: 900, border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px rgba(22,104,196,.18)' }}
              >
                {pwSaving ? t.savingPasswordBtn : t.savePasswordBtn}
              </button>
            </form>
            </div>
            {sessionError && (
              <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: 0 }}>{sessionError}</p>
            )}
            {sessions && (
              <AccountSecuritySessions
                sessions={sessions}
                busyId={sessionBusyId}
                onRevoke={onRevokeSession}
              />
            )}
            <AccountPrivacyPanel
              exportBusy={exportBusy}
              exportError={exportError}
              onExportData={onExportData}
              deleteConfirmOpen={deleteConfirmOpen}
              deleteBusy={deleteBusy}
              deleteError={deleteError}
              onDeleteOpen={() => setDeleteConfirmOpen(true)}
              onDeleteCancel={() => setDeleteConfirmOpen(false)}
              onDeleteConfirm={onConfirmDelete}
            />
          </div>
        )}
        </main>
      </div>
    </PublicPageShell>
  );
}
