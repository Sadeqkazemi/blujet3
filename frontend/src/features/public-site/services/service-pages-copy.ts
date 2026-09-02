import type { StoredLocale } from '../../../hooks/useLocale';

export type ServicePageId =
  | 'seat-selection'
  | 'extra-baggage'
  | 'refund-info'
  | 'pet-travel'
  | 'wheelchair';

export type Tr = { fa: string; en: string; ar: string };

export type ServiceStep = { no: number; title: Tr; desc: Tr };
export type ServiceFaq = { q: Tr; a: Tr };
export type ServiceCard = { title: Tr; desc: Tr; price: Tr };

export type ServicePageConfig = {
  id: ServicePageId;
  path: string;
  breadcrumbLabel: Tr;
  badge: Tr;
  heroTitle: Tr;
  heroDesc: Tr;
  ctaPrimary: Tr;
  ctaSecondary: Tr;
  stepsTitle: Tr;
  steps: ServiceStep[];
  faqTitle: Tr;
  faqs: ServiceFaq[];
  notice?: Tr;
  cardsTitle?: Tr;
  cards?: ServiceCard[];
  sideNote?: Tr;
};

function tr(fa: string, en: string, ar: string): Tr {
  return { fa, en, ar };
}

const SHARED = {
  bcHome: tr('خانه', 'Home', 'الرئيسية'),
  bcServices: tr('خدمات', 'Services', 'الخدمات'),
  loginTitle: tr(
    'ابتدا وارد حساب کاربری شوید',
    'Please log in first',
    'يرجى تسجيل الدخول أولاً',
  ),
  loginDesc: tr(
    'برای استفاده از این خدمت لازم است ابتدا وارد حساب کاربری‌تان شوید.',
    'Log in to your account to use this service.',
    'لاستخدام هذه الخدمة يجب تسجيل الدخول إلى حسابك أولاً.',
  ),
  noFlightTitle: tr(
    'شما پرواز فعالی ندارید',
    'You have no active flight',
    'ليس لديك رحلة نشطة',
  ),
  noFlightDesc: tr(
    'برای استفاده از این خدمت ابتدا باید یک پرواز رزرو کرده باشید.',
    'You need an active flight booking to use this service.',
    'تحتاج إلى حجز رحلة نشط لاستخدام هذه الخدمة.',
  ),
  noFlightCta: tr('رزرو پرواز جدید', 'Book a new flight', 'احجز رحلة جديدة'),
};

export { SHARED as SERVICE_SHARED_COPY };

export const SERVICE_PAGES: Record<ServicePageId, ServicePageConfig> = {
  'seat-selection': {
    id: 'seat-selection',
    path: '/services/seat-selection',
    breadcrumbLabel: tr('انتخاب صندلی', 'Seat selection', 'اختيار المقعد'),
    badge: tr('خدمات پروازی', 'Flight services', 'خدمات الطيران'),
    heroTitle: tr(
      'انتخاب صندلی دلخواه، پیش از رسیدن به فرودگاه',
      'Choose your seat before you reach the airport',
      'اختر مقعدك قبل الوصول إلى المطار',
    ),
    heroDesc: tr(
      'با انتخاب صندلی، از همان لحظه رزرو مشخص می‌شود کنار پنجره می‌نشینید یا نزدیک راهرو. این خدمت برای هر پرواز جداگانه محاسبه و به مبلغ بلیط اضافه می‌شود.',
      'Pick a window or aisle seat right from booking. The fee is calculated per flight and added to your ticket.',
      'اختر مقعدًا بجانب النافذة أو الممر منذ لحظة الحجز. تُحسب الرسوم لكل رحلة وتُضاف إلى سعر التذكرة.',
    ),
    ctaPrimary: tr(
      'انتخاب صندلی برای رزرو من',
      'Choose a seat for my booking',
      'اختر مقعدًا لحجزي',
    ),
    ctaSecondary: tr('رزرو پرواز جدید', 'Book a new flight', 'احجز رحلة جديدة'),
    stepsTitle: tr(
      'چگونه صندلی خود را انتخاب کنیم؟',
      'How to choose your seat',
      'كيف تختار مقعدك؟',
    ),
    steps: [
      {
        no: 1,
        title: tr('رزرو خود را باز کنید', 'Open your booking', 'افتح حجزك'),
        desc: tr(
          'از «مدیریت رزرو» با کد رهگیری و نام خانوادگی وارد شوید.',
          'Go to Manage booking with your PNR and last name.',
          'اذهب إلى «إدارة الحجز» برمز الحجز واسم العائلة.',
        ),
      },
      {
        no: 2,
        title: tr(
          'صندلی را از نقشه انتخاب کنید',
          'Pick a seat on the cabin map',
          'اختر مقعدًا من خريطة المقصورة',
        ),
        desc: tr(
          'صندلی‌های آزاد، اشغال‌شده و پای‌باز روی نقشه هر پرواز مشخص است.',
          'Free, occupied, and extra-legroom seats are marked on each flight map.',
          'تُحدَّد المقاعد المتاحة والمحجوزة وذات مساحة الأرجل على خريطة كل رحلة.',
        ),
      },
      {
        no: 3,
        title: tr('پرداخت و تأیید', 'Pay and confirm', 'ادفع واحصل على التأكيد'),
        desc: tr(
          'هزینه صندلی به بلیط اضافه و روی کارت پرواز ثبت می‌شود.',
          'The seat fee is added to your ticket and boarding pass.',
          'تُضاف رسوم المقعد إلى تذكرتك وبطاقة الصعود.',
        ),
      },
    ],
    cardsTitle: tr('انواع صندلی', 'Seat types', 'أنواع المقاعد'),
    cards: [
      {
        title: tr('صندلی عادی', 'Standard seat', 'مقعد عادي'),
        desc: tr(
          'صندلی استاندارد در ردیف‌های میانی و انتهایی.',
          'Standard seat in middle and rear rows.',
          'مقعد عادي في الصفوف الوسطى والخلفية.',
        ),
        price: tr('رایگان تا ۲۵۰,۰۰۰ ت', 'Free – up to 250,000 T', 'مجاني حتى ٢٥٠,٠٠٠ ت'),
      },
      {
        title: tr('صندلی پای‌باز', 'Extra-legroom seat', 'مقعد بمساحة أرجل'),
        desc: tr(
          'فضای پا بیشتر، معمولاً کنار در اضطراری.',
          'More legroom, usually near emergency exits.',
          'مساحة أرجل أكبر، عادة بجانب مخارج الطوارئ.',
        ),
        price: tr('از ۳۵۰,۰۰۰ ت', 'From 350,000 T', 'من ٣٥٠,٠٠٠ ت'),
      },
      {
        title: tr('کنار پنجره/راهرو', 'Window / aisle', 'نافذة / ممر'),
        desc: tr(
          'انتخاب دقیق موقعیت در ردیف.',
          'Choose exact position in the row.',
          'اختر الموضع الدقيق في الصف.',
        ),
        price: tr('از ۱۵۰,۰۰۰ ت', 'From 150,000 T', 'من ١٥٠,٠٠٠ ت'),
      },
    ],
    sideNote: tr(
      'MD-80: بیزنس ۳–۶ · اکونومی پلاس ۷–۱۲ · اکونومی ۱۳–۲۷ · ظرفیت ۱۴۰ صندلی',
      'MD-80: Business 3–6 · Economy Plus 7–12 · Economy 13–27 · 140 seats',
      'MD-80: درجة الأعمال ٣-٦ · اقتصادي بلس ٧-١٢ · اقتصادي ١٣-٢٧ · ١٤٠ مقعدًا',
    ),
    faqTitle: tr('سوالات متداول', 'Frequently asked questions', 'الأسئلة الشائعة'),
    faqs: [
      {
        q: tr(
          'آیا برای همه پروازها امکان‌پذیر است؟',
          'Can I choose a seat on every flight?',
          'هل يمكنني اختيار مقعد في كل رحلة؟',
        ),
        a: tr(
          'بله، مگر برای هواپیماهایی با چیدمان متغیر که انتخاب صندلی غیرفعال است.',
          'Yes, except aircraft with variable layouts where seat selection is disabled.',
          'نعم، باستثناء الطائرات ذات التخطيط المتغير.',
        ),
      },
      {
        q: tr(
          'بعد از خرید بلیط هم می‌شود؟',
          'Can I choose after buying?',
          'هل يمكنني الاختيار بعد الشراء؟',
        ),
        a: tr(
          'بله، تا قبل از بسته شدن پذیرش از «مدیریت رزرو».',
          'Yes, from Manage booking until check-in closes.',
          'نعم، من «إدارة الحجز» حتى إغلاق تسجيل الوصول.',
        ),
      },
    ],
  },
  'extra-baggage': {
    id: 'extra-baggage',
    path: '/services/extra-baggage',
    breadcrumbLabel: tr('اضافه بار', 'Extra baggage', 'وزن إضافي'),
    badge: tr('خدمات پروازی', 'Flight services', 'خدمات الطيران'),
    heroTitle: tr(
      'خرید بار اضافه قبل از پرواز',
      'Buy extra baggage before your flight',
      'شراء أمتعة إضافية قبل الرحلة',
    ),
    heroDesc: tr(
      'بار مجاز کابین ۷ کیلوگرم است. بسته‌های ۵، ۱۰ و ۱۵ کیلوگرمی را قبل از پرواز با قیمت ثابت‌تر بخرید.',
      'Cabin allowance is 7 kg. Buy 5, 10, or 15 kg packs before flying at a fixed rate.',
      'الأمتعة المسموح بها في المقصورة ٧ كجم. اشترِ حزم ٥ أو ١٠ أو ١٥ كجم قبل الرحلة.',
    ),
    ctaPrimary: tr(
      'خرید بار اضافه برای رزرو من',
      'Buy extra baggage for my booking',
      'شراء أمتعة إضافية لحجزي',
    ),
    ctaSecondary: tr('رزرو پرواز جدید', 'Book a new flight', 'احجز رحلة جديدة'),
    stepsTitle: tr('مراحل خرید', 'How to buy', 'خطوات الشراء'),
    steps: [
      {
        no: 1,
        title: tr('رزرو را باز کنید', 'Open your booking', 'افتح حجزك'),
        desc: tr(
          'از «مدیریت رزرو» وارد شوید.',
          'Sign in via Manage booking.',
          'سجّل الدخول عبر «إدارة الحجز».',
        ),
      },
      {
        no: 2,
        title: tr('بسته وزن را انتخاب کنید', 'Pick a weight pack', 'اختر حزمة الوزن'),
        desc: tr(
          '۵، ۱۰ یا ۱۵ کیلوگرم — قیمت بسته به مسیر.',
          '5, 10, or 15 kg — price depends on route.',
          '٥ أو ١٠ أو ١٥ كجم — السعر حسب المسار.',
        ),
      },
      {
        no: 3,
        title: tr('پرداخت و تأیید', 'Pay and confirm', 'ادفع وأكد'),
        desc: tr(
          'بار اضافه به برچسب بار شما اضافه می‌شود.',
          'Extra allowance is added to your baggage tag.',
          'يُضاف الوزن الإضافي إلى بطاقة أمتعتك.',
        ),
      },
    ],
    cardsTitle: tr('بسته‌های بار', 'Baggage packs', 'حزم الأمتعة'),
    cards: [
      {
        title: tr('+۵ کیلوگرم', '+5 kg', '+٥ كجم'),
        desc: tr('مناسب سفر کوتاه', 'Good for short trips', 'مناسب للرحلات القصيرة'),
        price: tr('از ۴۵۰,۰۰۰ ت', 'From 450,000 T', 'من ٤٥٠,٠٠٠ ت'),
      },
      {
        title: tr('+۱۰ کیلوگرم', '+10 kg', '+١٠ كجم'),
        desc: tr('پرفروش‌ترین بسته', 'Most popular pack', 'الحزمة الأكثر طلبًا'),
        price: tr('از ۸۵۰,۰۰۰ ت', 'From 850,000 T', 'من ٨٥٠,٠٠٠ ت'),
      },
      {
        title: tr('+۱۵ کیلوگرم', '+15 kg', '+١٥ كجم'),
        desc: tr('سفر طولانی یا خرید', 'Long trips or shopping', 'رحلات طويلة أو تسوق'),
        price: tr('از ۱,۲۰۰,۰۰۰ ت', 'From 1,200,000 T', 'من ١,٢٠٠,٠٠٠ ت'),
      },
    ],
    notice: tr(
      'اقلام خطرناک و ممنوعه طبق فهرست سازمان هواپیمایی کشوری ممنوع است.',
      'Dangerous and prohibited items per civil aviation rules are not allowed.',
      'المواد الخطرة والمحظورة وفق قائمة الطيران المدني ممنوعة.',
    ),
    faqTitle: tr('سوالات متداول', 'FAQ', 'الأسئلة الشائعة'),
    faqs: [
      {
        q: tr('اگر در فرودگاه اضافه وزن داشته باشم؟', 'What if I exceed at airport?', 'ماذا لو تجاوزت الوزن في المطار؟'),
        a: tr(
          'جریمه در گیت پرداخت می‌شود و معمولاً گران‌تر از خرید آنلاین است.',
          'You pay a penalty at the gate, usually more than buying online.',
          'تدفع غرامة عند البوابة، عادة أعلى من الشراء عبر الإنترنت.',
        ),
      },
    ],
  },
  'refund-info': {
    id: 'refund-info',
    path: '/services/refund-info',
    breadcrumbLabel: tr('استرداد بلیط', 'Ticket refund', 'استرداد التذكرة'),
    badge: tr('خدمات پروازی', 'Flight services', 'خدمات الطيران'),
    heroTitle: tr(
      'قوانین و مراحل استرداد بلیط',
      'Ticket refund rules and steps',
      'قواعد وخطوات استرداد التذكرة',
    ),
    heroDesc: tr(
      'میزان جریمه بسته به فاصله تا پرواز و نوع نرخ متفاوت است. مبلغ دقیق قبل از تأیید نمایش داده می‌شود.',
      'Penalty depends on time to departure and fare type. Exact amount is shown before you confirm.',
      'تختلف الغرامة حسب الوقت المتبقي ونوع السعر. يُعرض المبلغ الدقيق قبل التأكيد.',
    ),
    ctaPrimary: tr('ثبت درخواست استرداد', 'Submit refund request', 'تقديم طلب استرداد'),
    ctaSecondary: tr('مدیریت رزرو', 'Manage booking', 'إدارة الحجز'),
    stepsTitle: tr('مراحل استرداد', 'Refund steps', 'خطوات الاسترداد'),
    steps: [
      {
        no: 1,
        title: tr('جستجوی رزرو', 'Find your booking', 'ابحث عن حجزك'),
        desc: tr('کد رهگیری + نام خانوادگی در «مدیریت رزرو».', 'PNR + last name in Manage booking.', 'رمز الحجز + اسم العائلة.'),
      },
      {
        no: 2,
        title: tr('ثبت درخواست', 'Submit request', 'قدّم الطلب'),
        desc: tr('شماره شبا وارد کنید؛ جریمه محاسبه می‌شود.', 'Enter IBAN; penalty is calculated.', 'أدخل الآيبان؛ تُحسب الغرامة.'),
      },
      {
        no: 3,
        title: tr('بازگشت وجه', 'Refund payout', 'استرداد المبلغ'),
        desc: tr('۷ تا ۱۵ روز کاری به حساب پرداخت‌کننده.', '7–15 business days to payer account.', '٧–١٥ يوم عمل إلى حساب الدافع.'),
      },
    ],
    cardsTitle: tr('سطوح جریمه', 'Penalty tiers', 'مستويات الغرامة'),
    cards: [
      {
        title: tr('بیش از ۷۲ ساعت', 'More than 72 h', 'أكثر من ٧٢ ساعة'),
        desc: tr('قبل از پرواز', 'Before departure', 'قبل الإقلاع'),
        price: tr('جریمه ۵٪', '5% penalty', 'غرامة ٥٪'),
      },
      {
        title: tr('۲۴ تا ۷۲ ساعت', '24–72 h', '٢٤–٧٢ ساعة'),
        desc: tr('نزدیک به پرواز', 'Close to departure', 'قرب موعد الرحلة'),
        price: tr('جریمه ۱۵٪', '15% penalty', 'غرامة ١٥٪'),
      },
      {
        title: tr('کمتر از ۲۴ ساعت', 'Under 24 h', 'أقل من ٢٤ ساعة'),
        desc: tr('یا عدم حضور', 'Or no-show', 'أو عدم الحضور'),
        price: tr('جریمه ۵۰٪+', '50%+ penalty', 'غرامة ٥٠٪+'),
      },
    ],
    faqTitle: tr('سوالات متداول', 'FAQ', 'الأسئلة الشائعة'),
    faqs: [
      {
        q: tr('کنسلی توسط ایرلاین؟', 'Airline cancellation?', 'إلغاء من شركة الطيران؟'),
        a: tr('بازگشت کامل بدون جریمه.', 'Full refund without penalty.', 'استرداد كامل بدون غرامة.'),
      },
    ],
  },
  'pet-travel': {
    id: 'pet-travel',
    path: '/services/pet-travel',
    breadcrumbLabel: tr('حمل حیوان خانگی', 'Pet travel', 'سفر الحيوانات'),
    badge: tr('خدمات پروازی', 'Flight services', 'خدمات الطيران'),
    heroTitle: tr(
      'سفر با حیوان خانگی در کابین یا انبار',
      'Travel with your pet in cabin or hold',
      'السفر مع حيوانك الأليف',
    ),
    heroDesc: tr(
      'حداکثر ۸ کیلوگرم در کابین کنار مسافر. رزرو حداقل ۴۸ ساعت قبل از پرواز.',
      'Up to 8 kg in cabin beside you. Book at least 48 h before departure.',
      'حتى ٨ كجم في المقصورة. احجز قبل ٤٨ ساعة على الأقل.',
    ),
    ctaPrimary: tr('درخواست حمل حیوان', 'Request pet travel', 'طلب نقل الحيوان'),
    ctaSecondary: tr('رزرو پرواز جدید', 'Book a new flight', 'احجز رحلة جديدة'),
    stepsTitle: tr('مراحل درخواست', 'How to request', 'خطوات الطلب'),
    steps: [
      {
        no: 1,
        title: tr('بررسی شرایط', 'Check requirements', 'تحقق من الشروط'),
        desc: tr('وزن، ابعاد قفس و مدارک سلامت.', 'Weight, carrier size, health docs.', 'الوزن وحجم الحامل والوثائق.'),
      },
      {
        no: 2,
        title: tr('ثبت درخواست', 'Submit request', 'قدّم الطلب'),
        desc: tr('از مدیریت رزرو یا تماس با پشتیبانی.', 'Via Manage booking or support.', 'عبر إدارة الحجز أو الدعم.'),
      },
      {
        no: 3,
        title: tr('پرداخت و تأیید', 'Pay and confirm', 'ادفع وأكد'),
        desc: tr('هزینه بسته به مسیر و نوع حمل.', 'Fee depends on route and cabin/hold.', 'الرسوم حسب المسار ونوع النقل.'),
      },
    ],
    cardsTitle: tr('روش‌های حمل', 'Transport options', 'خيارات النقل'),
    cards: [
      {
        title: tr('در کابین', 'In cabin', 'في المقصورة'),
        desc: tr('کنار مسافر، تا ۸ کیلو', 'Beside passenger, up to 8 kg', 'بجانب المسافر، حتى ٨ كجم'),
        price: tr('از ۸۵۰,۰۰۰ ت', 'From 850,000 T', 'من ٨٥٠,٠٠٠ ت'),
      },
      {
        title: tr('در انبار', 'In hold', 'في الع hold'),
        desc: tr('انبار کنترل‌شده دما', 'Temperature-controlled hold', 'ع hold بدرجة حرارة مضبوطة'),
        price: tr('از ۱,۱۰۰,۰۰۰ ت', 'From 1,100,000 T', 'من ١,١٠٠,٠٠٠ ت'),
      },
    ],
    faqTitle: tr('سوالات متداول', 'FAQ', 'الأسئلة الشائعة'),
    faqs: [
      {
        q: tr('نژادهای کوتاه‌سر مجازند؟', 'Brachycephalic breeds?', 'سلالات قصيرة الرأس؟'),
        a: tr('در انبار ممنوع؛ فقط کابین با شرایط.', 'Not in hold; cabin only with conditions.', 'ممنوع في الع hold؛ المقصورة فقط.'),
      },
    ],
  },
  wheelchair: {
    id: 'wheelchair',
    path: '/services/wheelchair',
    breadcrumbLabel: tr('درخواست ویلچر', 'Wheelchair request', 'طلب كرسي متحرك'),
    badge: tr('خدمات پروازی', 'Flight services', 'خدمات الطيران'),
    heroTitle: tr(
      'خدمات ویلچر و کمک حرکت در فرودگاه',
      'Wheelchair and mobility assistance',
      'مساعدة الكرسي المتحرك والتنقل',
    ),
    heroDesc: tr(
      'رایگان برای مسافران نیازمند کمک. حداقل ۴۸ ساعت قبل از پرواز درخواست دهید.',
      'Free for passengers who need assistance. Request at least 48 h before flight.',
      'مجاني للمسافرين المحتاجين. اطلب قبل ٤٨ ساعة على الأقل.',
    ),
    ctaPrimary: tr('ثبت درخواست ویلچر', 'Request wheelchair', 'طلب كرسي متحرك'),
    ctaSecondary: tr('تماس با پشتیبانی', 'Contact support', 'اتصل بالدعم'),
    stepsTitle: tr('مراحل درخواست', 'How to request', 'خطوات الطلب'),
    steps: [
      {
        no: 1,
        title: tr('نوع کمک را انتخاب کنید', 'Choose assistance level', 'اختر مستوى المساعدة'),
        desc: tr('WCHR، WCHS یا WCHC طبق استاندارد IATA.', 'WCHR, WCHS, or WCHC per IATA codes.', 'WCHR أو WCHS أو WCHC.'),
      },
      {
        no: 2,
        title: tr('ثبت در رزرو', 'Add to booking', 'أضف إلى الحجز'),
        desc: tr('از مدیریت رزرو یا پشتیبانی.', 'Via Manage booking or support.', 'عبر إدارة الحجز أو الدعم.'),
      },
      {
        no: 3,
        title: tr('هماهنگی در فرودگاه', 'Airport coordination', 'التنسيق في المطار'),
        desc: tr('همکاران blujet در گیت و سوار شدن همراهی می‌کنند.', 'blujet staff assist at gate and boarding.', 'موظفو blujet يساعدون عند البوابة.'),
      },
    ],
    cardsTitle: tr('سطوح خدمت', 'Assistance levels', 'مستويات المساعدة'),
    cards: [
      {
        title: tr('WCHR', 'WCHR', 'WCHR'),
        desc: tr('راه رفتن در فرودگاه', 'Walk in terminal', 'المشي في المبنى'),
        price: tr('رایگان', 'Free', 'مجاني'),
      },
      {
        title: tr('WCHS', 'WCHS', 'WCHS'),
        desc: tr('بالا/پایین پله با ویلچر', 'Stairs with wheelchair', 'السلالم بالكرسي'),
        price: tr('رایگان', 'Free', 'مجاني'),
      },
      {
        title: tr('WCHC', 'WCHC', 'WCHC'),
        desc: tr('کمک کامل تا صندلی', 'Full assist to seat', 'مساعدة كاملة للمقعد'),
        price: tr('رایگان', 'Free', 'مجاني'),
      },
    ],
    faqTitle: tr('سوالات متداول', 'FAQ', 'الأسئلة الشائعة'),
    faqs: [
      {
        q: tr('ویلچر شخصی مجاز است؟', 'Own wheelchair allowed?', 'هل الكرسي الشخصي مسموح؟'),
        a: tr('بله، با هماهنگی قبلی در زمان رزرو.', 'Yes, with prior coordination at booking.', 'نعم، مع التنسيق المسبق عند الحجز.'),
      },
    ],
  },
};

export function pickTr(t: Tr, locale: StoredLocale): string {
  return t[locale];
}
