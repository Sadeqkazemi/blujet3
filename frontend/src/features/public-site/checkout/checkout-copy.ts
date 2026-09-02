import type { StoredLocale } from '../../../hooks/useLocale';
import { localeDigits } from '../../../lib/locale-format';
import type { PassengerMix } from './checkout-types';

export const CHECKOUT_COPY: Record<
  StoredLocale,
  {
    title: string;
    loading: string;
    notFound: string;
    expired: string;
    searchAgain: string;
    steps: { pax: string; extras: string; review: string };
    enterPax: string;
    travelExtras: string;
    pickServices: string;
    confirmDetails: string;
    flightSummary: string;
    paymentDetails: string;
    description: string;
    amountToman: string;
    ticketPrice: (mix: PassengerMix) => string;
    taxesFees: string;
    total: string;
    securePayment: string;
    agreeTerms: string;
    termsLink: string;
    nextPax: string;
    nextExtras: string;
    nextReview: string;
    nextPay: string;
    backStep: string;
    completePaxError: string;
    nidSeatLimitError: string;
    adultLabel: (n: number) => string;
    childLabel: (n: number) => string;
    infantLabel: (n: number) => string;
    nationalId: string;
    passport: string;
    scanDocument: string;
    firstNameLatin: string;
    lastNameLatin: string;
    gender: string;
    female: string;
    male: string;
    dateOfBirth: string;
    day: string;
    month: string;
    year: string;
    passportNo: string;
    fromSaved: string;
    selectSaved: string;
    savedEmpty: string;
    savedSignInHint: string;
    addPax: string;
    remove: string;
    passenger: string;
    document: string;
    seat: string;
    seatMapCaption: (aircraft: string) => string;
    bizLockedHint: string;
    business: string;
    available: string;
    reserved: string;
    selectedSeat: string;
    totalSold: string;
    ofLabel: string;
    selectedExtras: string;
    nameChangeWarning: string;
    editPaxFromReview: string;
    editPaxPopupTitle: string;
    savePaxEdits: string;
    cancelBtn: string;
    noneSelected: string;
    noExtrasAvailable: string;
    toman: string;
    extras: Record<'baggage' | 'meal' | 'insurance' | 'cip', { title: string; desc: string }>;
    months: string[];
  }
> = {
  fa: {
    title: 'تکمیل خرید',
    loading: 'در حال بارگذاری…',
    notFound: 'اطلاعات رزرو یافت نشد.',
    expired: 'مهلت نگهداری این رزرو به پایان رسیده است.',
    searchAgain: 'جستجوی مجدد',
    steps: { pax: 'اطلاعات مسافر', extras: 'خدمات جانبی', review: 'بازبینی' },
    enterPax: 'وارد کردن اطلاعات مسافر',
    travelExtras: 'خدمات جانبی سفر',
    pickServices:
      'خدماتی که می‌خواهید انتخاب کنید — هزینه به مجموع شما اضافه می‌شود',
    confirmDetails: 'تأیید اطلاعات',
    flightSummary: 'خلاصه پرواز',
    paymentDetails: 'جزئیات پرداخت',
    description: 'شرح',
    amountToman: 'مبلغ (تومان)',
    ticketPrice: (mix) =>
      `قیمت بلیط (${[
        mix.adults > 0 ? `بزرگسال × ${localeDigits(mix.adults, 'fa')}` : null,
        mix.children > 0 ? `کودک × ${localeDigits(mix.children, 'fa')}` : null,
        mix.infants > 0 ? `نوزاد × ${localeDigits(mix.infants, 'fa')}` : null,
      ]
        .filter(Boolean)
        .join('، ')})`,
    taxesFees: 'مالیات و عوارض',
    total: 'جمع کل',
    securePayment: 'پرداخت امن و رمزگذاری‌شده',
    agreeTerms: 'با ادامه،',
    termsLink: 'قوانین و مقررات',
    nextPax: 'تأیید و ادامه',
    nextExtras: 'ادامه',
    nextReview: 'ادامه به پرداخت',
    nextPay: 'ادامه به پرداخت',
    backStep: 'بازگشت به مرحله قبل',
    completePaxError: 'لطفاً اطلاعات همه مسافران را کامل کنید.',
    nidSeatLimitError: 'با یک کد ملی حداکثر ۲ صندلی قابل خرید است.',
    adultLabel: (n) => `${n}. بزرگسال`,
    childLabel: (n) => `${n}. کودک`,
    infantLabel: (n) => `${n}. نوزاد`,
    nationalId: 'کد ملی',
    passport: 'گذرنامه',
    scanDocument: 'اسکن مدرک',
    firstNameLatin: 'نام (لاتین)',
    lastNameLatin: 'نام خانوادگی (لاتین)',
    gender: 'جنسیت',
    female: 'زن',
    male: 'مرد',
    dateOfBirth: 'تاریخ تولد',
    day: 'روز',
    month: 'ماه',
    year: 'سال',
    passportNo: 'شماره گذرنامه',
    fromSaved: 'از مسافران ذخیره‌شده',
    selectSaved: 'انتخاب از مسافران ذخیره‌شده:',
    savedEmpty: 'هنوز مسافری در حساب شما ذخیره نشده است.',
    savedSignInHint: 'برای استفاده از مسافران ذخیره‌شده وارد حساب شوید',
    addPax: 'افزودن مسافر جدید',
    remove: 'حذف',
    passenger: 'مسافر',
    document: 'مدرک',
    seat: 'صندلی',
    seatMapCaption: (aircraft) =>
      `انتخاب صندلی (اختیاری) — ${aircraft} · فرست‌کلاس ردیف ۳ تا ۶ (۲-۲) · بیزینس ردیف ۷ تا ۱۱ (۲-۳) · اکونومی ردیف ۱۲ تا ۳۲ (۲-۳)`,
    bizLockedHint: 'انتخاب صندلی بیزنس نیازمند حداقل ۱۵٬۰۰۰ امتیاز باشگاه است',
    business: 'بیزنس',
    available: 'موجود',
    reserved: 'رزرو شده',
    selectedSeat: 'صندلی انتخابی',
    totalSold: 'مجموع صندلی‌های فروخته‌شده',
    ofLabel: 'از',
    selectedExtras: 'خدمات جانبی انتخابی',
    nameChangeWarning:
      'پس از پرداخت، امکان تغییر نام مسافران وجود ندارد. لطفاً املای نام را با دقت بررسی کنید.',
    editPaxFromReview: 'ویرایش مسافران',
    editPaxPopupTitle: 'ویرایش اطلاعات مسافران',
    savePaxEdits: 'ذخیره تغییرات',
    cancelBtn: 'انصراف',
    noneSelected: 'انتخاب نشده',
    noExtrasAvailable: 'در حال حاضر هزینه یا خدمت جانبی فعالی ثبت نشده است.',
    toman: 'تومان',
    extras: {
      baggage: { title: 'بار اضافه (۱۰ کیلوگرم)', desc: 'علاوه بر مجاز ۲۰ کیلوگرمی' },
      meal: { title: 'غذای گرم داخل پرواز', desc: 'منوی ایرانی / بین‌المللی' },
      insurance: { title: 'بیمه مسافرتی', desc: 'پوشش کامل تأخیر و خسارت' },
      cip: { title: 'خدمات CIP فرودگاهی', desc: 'پذیرش و گیت اختصاصی' },
    },
    months: [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ],
  },
  en: {
    title: 'Complete purchase',
    loading: 'Loading…',
    notFound: 'Booking information not found.',
    expired: 'The hold on this booking has expired.',
    searchAgain: 'Search again',
    steps: { pax: 'Passenger info', extras: 'Travel extras', review: 'Review' },
    enterPax: 'Enter passenger details',
    travelExtras: 'Travel Extras',
    pickServices: "Pick the services you'd like — the cost is added to your total",
    confirmDetails: 'Confirm details',
    flightSummary: 'Flight summary',
    paymentDetails: 'Payment details',
    description: 'Description',
    amountToman: 'Amount (Toman)',
    ticketPrice: (mix) =>
      `Ticket price (${[
        mix.adults > 0 ? `adult × ${mix.adults}` : null,
        mix.children > 0 ? `child × ${mix.children}` : null,
        mix.infants > 0 ? `infant × ${mix.infants}` : null,
      ]
        .filter(Boolean)
        .join(', ')})`,
    taxesFees: 'Taxes & fees',
    total: 'Total',
    securePayment: 'Secure encrypted payment',
    agreeTerms: 'By continuing, you accept the',
    termsLink: 'terms & conditions',
    nextPax: 'Confirm & continue',
    nextExtras: 'Continue',
    nextReview: 'Continue to payment',
    nextPay: 'Continue to payment',
    backStep: 'Back to previous step',
    completePaxError: 'Please complete all passenger information.',
    nidSeatLimitError: 'A national ID may occupy at most 2 seats.',
    adultLabel: (n) => `${n}. Adult`,
    childLabel: (n) => `${n}. Child`,
    infantLabel: (n) => `${n}. Infant`,
    nationalId: 'National ID',
    passport: 'Passport',
    scanDocument: 'Scan document',
    firstNameLatin: 'First name (Latin)',
    lastNameLatin: 'Last name (Latin)',
    gender: 'Gender',
    female: 'Female',
    male: 'Male',
    dateOfBirth: 'Date of birth',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    passportNo: 'Passport number',
    fromSaved: 'From saved passengers',
    selectSaved: 'Select from saved passengers:',
    savedEmpty: 'You have no saved passengers yet.',
    savedSignInHint: 'Sign in to use saved passengers',
    addPax: 'Add new passenger',
    remove: 'Remove',
    passenger: 'Passenger',
    document: 'Document',
    seat: 'Seat',
    seatMapCaption: (aircraft) =>
      `Seat selection (optional) — ${aircraft} · First Class rows 3–6 (2-2) · Business rows 7–11 (2-3) · Economy rows 12–32 (2-3)`,
    bizLockedHint: 'Selecting a Business seat requires at least 15,000 loyalty points',
    business: 'Business',
    available: 'Available',
    reserved: 'Reserved',
    selectedSeat: 'Selected seat',
    totalSold: 'Total seats sold',
    ofLabel: 'of',
    selectedExtras: 'Selected extras',
    nameChangeWarning:
      'Passenger names cannot be changed after payment. Please verify spelling carefully.',
    editPaxFromReview: 'Edit passengers',
    editPaxPopupTitle: 'Edit passenger details',
    savePaxEdits: 'Save changes',
    cancelBtn: 'Cancel',
    noneSelected: 'Not selected',
    noExtrasAvailable: 'No optional travel services are available right now.',
    toman: 'Toman',
    extras: {
      baggage: { title: 'Extra baggage (10 kg)', desc: 'On top of the 20 kg allowance' },
      meal: { title: 'Hot in-flight meal', desc: 'Iranian / international menu' },
      insurance: { title: 'Travel insurance', desc: 'Full delay & damage coverage' },
      cip: { title: 'Airport CIP services', desc: 'Dedicated check-in & gate' },
    },
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
  },
  ar: {
    title: 'إتمام الشراء',
    loading: 'جارٍ التحميل…',
    notFound: 'لم تُعثر على معلومات الحجز.',
    expired: 'انتهت مهلة الاحتفاظ بهذا الحجز.',
    searchAgain: 'بحث مجدداً',
    steps: { pax: 'بيانات المسافر', extras: 'خدمات إضافية', review: 'مراجعة' },
    enterPax: 'إدخال بيانات المسافر',
    travelExtras: 'الخدمات الإضافية للسفر',
    pickServices: 'اختر الخدمات التي ترغب بها — تُضاف التكلفة إلى إجمالي الفاتورة',
    confirmDetails: 'تأكيد البيانات',
    flightSummary: 'ملخص الرحلة',
    paymentDetails: 'تفاصيل الدفع',
    description: 'الوصف',
    amountToman: 'المبلغ (تومان)',
    ticketPrice: (mix) =>
      `سعر التذكرة (${[
        mix.adults > 0 ? `بالغ × ${localeDigits(mix.adults, 'ar')}` : null,
        mix.children > 0 ? `طفل × ${localeDigits(mix.children, 'ar')}` : null,
        mix.infants > 0 ? `رضيع × ${localeDigits(mix.infants, 'ar')}` : null,
      ]
        .filter(Boolean)
        .join('، ')})`,
    taxesFees: 'الضرائب والرسوم',
    total: 'الإجمالي',
    securePayment: 'دفع آمن ومشفر',
    agreeTerms: 'بالمتابعة، فإنك تقبل',
    termsLink: 'الشروط والأحكام',
    nextPax: 'تأكيد ومتابعة',
    nextExtras: 'متابعة',
    nextReview: 'المتابعة إلى الدفع',
    nextPay: 'المتابعة إلى الدفع',
    backStep: 'العودة للخطوة السابقة',
    completePaxError: 'يرجى إكمال بيانات جميع المسافرين.',
    nidSeatLimitError: 'لا يجوز لرقم وطني واحد حجز أكثر من مقعدين.',
    adultLabel: (n) => `${n}. بالغ`,
    childLabel: (n) => `${n}. طفل`,
    infantLabel: (n) => `${n}. رضيع`,
    nationalId: 'بطاقة الهوية',
    passport: 'جواز السفر',
    scanDocument: 'مسح المستند',
    firstNameLatin: 'الاسم (لاتيني)',
    lastNameLatin: 'اسم العائلة (لاتيني)',
    gender: 'الجنس',
    female: 'أنثى',
    male: 'ذكر',
    dateOfBirth: 'تاريخ الميلاد',
    day: 'يوم',
    month: 'شهر',
    year: 'سنة',
    passportNo: 'رقم جواز السفر',
    fromSaved: 'من المسافرين المحفوظين',
    selectSaved: 'اختر من المسافرين المحفوظين:',
    savedEmpty: 'لا يوجد مسافرون محفوظون في حسابك بعد.',
    savedSignInHint: 'سجّل الدخول لاستخدام المسافرين المحفوظين',
    addPax: 'إضافة مسافر جديد',
    remove: 'حذف',
    passenger: 'مسافر',
    document: 'الوثيقة',
    seat: 'المقعد',
    seatMapCaption: (aircraft) =>
      `اختيار المقعد (اختياري) — ${aircraft} · الدرجة الأولى صفوف 3–6 (2-2) · درجة الأعمال صفوف 7–11 (2-3) · الاقتصادية صفوف 12–32 (2-3)`,
    bizLockedHint: 'يتطلب اختيار مقعد درجة الأعمال 15,000 نقطة ولاء على الأقل',
    business: 'درجة الأعمال',
    available: 'متاح',
    reserved: 'محجوز',
    selectedSeat: 'المقعد المختار',
    totalSold: 'إجمالي المقاعد المباعة',
    ofLabel: 'من',
    selectedExtras: 'الخدمات الإضافية المختارة',
    nameChangeWarning: 'لا يمكن تغيير أسماء المسافرين بعد الدفع. يرجى التحقق من الإملاء.',
    editPaxFromReview: 'تعديل المسافرين',
    editPaxPopupTitle: 'تعديل بيانات المسافرين',
    savePaxEdits: 'حفظ التغييرات',
    cancelBtn: 'إلغاء',
    noneSelected: 'لم يتم الاختيار',
    noExtrasAvailable: 'لا توجد خدمات سفر إضافية متاحة حالياً.',
    toman: 'تومان',
    extras: {
      baggage: { title: 'أمتعة إضافية (10 كجم)', desc: 'إضافة إلى الحد المسموح 20 كجم' },
      meal: { title: 'وجبة ساخنة على متن الرحلة', desc: 'قائمة إيرانية / عالمية' },
      insurance: { title: 'تأمين السفر', desc: 'تغطية كاملة للتأخير والأضرار' },
      cip: { title: 'خدمات CIP في المطار', desc: 'تسجيل وصول وبوابة مخصصة' },
    },
    months: [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ],
  },
};

const AGE_ERROR_COPY: Record<
  StoredLocale,
  Record<
    'INFANT_AGE_INVALID' | 'CHILD_AGE_INVALID' | 'TOO_MANY_LAP_INFANTS' | 'ADULT_AGE_REQUIRED',
    string
  >
> = {
  fa: {
    INFANT_AGE_INVALID:
      'این مسافر در تاریخ پرواز زیر ۲ سال نیست و امکان تهیه بلیط نوزاد برای او وجود ندارد.',
    CHILD_AGE_INVALID:
      'بلیط کودک یا نوزاد صندلی‌دار فقط برای مسافر کمتر از ۱۲ سال در تاریخ پرواز قابل استفاده است.',
    TOO_MANY_LAP_INFANTS: 'هر مسافر بزرگسال فقط می‌تواند یک نوزاد بدون صندلی همراه داشته باشد.',
    ADULT_AGE_REQUIRED: 'مسافر ۱۲ ساله یا بزرگ‌تر باید با نرخ بزرگسال ثبت شود.',
  },
  en: {
    INFANT_AGE_INVALID:
      'This passenger is not under 2 on the flight date and cannot use an infant ticket.',
    CHILD_AGE_INVALID:
      'A child ticket (including a seated infant) is only valid before age 12 on the flight date.',
    TOO_MANY_LAP_INFANTS: 'Each adult may accompany only one lap infant.',
    ADULT_AGE_REQUIRED: 'Passengers aged 12 or older must use an adult ticket.',
  },
  ar: {
    INFANT_AGE_INVALID:
      'هذا المسافر ليس دون سن ٢ في تاريخ الرحلة ولا يمكنه استخدام تذكرة رضيع.',
    CHILD_AGE_INVALID:
      'تذكرة الطفل (بما في ذلك الرضيع بمقعد) صالحة فقط قبل سن ١٢ في تاريخ الرحلة.',
    TOO_MANY_LAP_INFANTS: 'يمكن لكل بالغ مرافقة رضيع واحد فقط بدون مقعد.',
    ADULT_AGE_REQUIRED: 'يجب على المسافرين بعمر ١٢ سنة أو أكثر استخدام تذكرة بالغ.',
  },
};

export function passengerAgeErrorMessage(
  code: string,
  locale: StoredLocale,
): string | null {
  const key = code as keyof (typeof AGE_ERROR_COPY)['fa'];
  return AGE_ERROR_COPY[locale][key] ?? AGE_ERROR_COPY.fa[key] ?? null;
}
