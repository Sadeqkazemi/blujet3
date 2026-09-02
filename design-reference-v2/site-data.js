// Shared site content store — connects the IT/admin panels to the public site.
// The panel writes via SiteData.save(...); every site page reads via SiteData.getAll().
// Persisted in localStorage so edits survive reloads and propagate across pages/tabs.
(function () {
  var KEY = 'aseman_site_v1';

  var defaults = {
    banner: {
      title: 'پرواز بعدی‌ات را با blujet رزرو کن',
      subtitle: 'بیش از ۲۰۰ مقصد داخلی و بین‌المللی، با بهترین قیمت، پشتیبانی شبانه‌روزی و امتیاز در هر سفر.',
      button: 'مشاهده پیشنهادهای ویژه'
    },
    promoBanner: {
      badge: 'حراج تابستانه blujet',
      title: 'تا ۴۰٪ تخفیف روی پروازهای خارجی',
      subtitle: 'رزرو تا پایان مرداد برای سفرهای تابستان — صندلی‌ها محدودند، فرصت را از دست نده.',
      button: 'مشاهده پروازها'
    },
    contact: { phone: '021-91000000', email: 'support@aseman.ir' },
    // ── Loyalty club rules (قوانین باشگاه مشتریان) ── editable by مدیر بازرگانی, applies
    // to every member across the whole site (single shared rule set).
    clubRules: { silverMin: 0, goldMin: 5000, platinumMin: 15000, cardThreshold: 5000 },
    // ── Flight classes (اکونومی/بیزینس/فرست) ── editable by مدیر بازرگانی,
    // applies to every search/booking flow across the site.
    flightClasses: [
      { code: 'economy', labelFa: 'اکونومی', labelEn: 'Economy', labelAr: 'اقتصادية', multiplier: 1, active: true },
      { code: 'business', labelFa: 'بیزنس', labelEn: 'Business', labelAr: 'درجة الأعمال', multiplier: 1.65, active: true },
      { code: 'first', labelFa: 'فرست کلاس', labelEn: 'First Class', labelAr: 'الدرجة الأولى', multiplier: 2.4, active: true }
    ],
    // ── Cities / airports ────────────────────────────────────────────────
    // Single source of truth for every city picker across the site: the
    // public ticket search box AND the admin "افزودن پرواز جدید" form share
    // this list, so a city added in one place shows up in the other.
    cities: [
      { city: 'تهران', code: 'THR', airport: 'فرودگاه مهرآباد / امام' },
      { city: 'مشهد', code: 'MHD', airport: 'فرودگاه شهید هاشمی‌نژاد' },
      { city: 'کیش', code: 'KIH', airport: 'فرودگاه بین‌المللی کیش' },
      { city: 'شیراز', code: 'SYZ', airport: 'فرودگاه شهید دستغیب' },
      { city: 'اصفهان', code: 'IFN', airport: 'فرودگاه شهید بهشتی' },
      { city: 'تبریز', code: 'TBZ', airport: 'فرودگاه شهید مدنی' },
      { city: 'اهواز', code: 'AWZ', airport: 'فرودگاه بین‌المللی اهواز' },
      { city: 'قشم', code: 'GSM', airport: 'فرودگاه بین‌المللی قشم' },
      { city: 'بندرعباس', code: 'BND', airport: 'فرودگاه بین‌المللی بندرعباس' },
      { city: 'یزد', code: 'AZD', airport: 'فرودگاه شهید صدوقی' },
      { city: 'کرمان', code: 'KER', airport: 'فرودگاه آیت‌الله هاشمی رفسنجانی' },
      { city: 'رشت', code: 'RAS', airport: 'فرودگاه سردار جنگل' },
      { city: 'ساری', code: 'SRY', airport: 'فرودگاه دشت ناز' },
      { city: 'ارومیه', code: 'OMH', airport: 'فرودگاه شهید باکری' },
      { city: 'زاهدان', code: 'ZAH', airport: 'فرودگاه بین‌المللی زاهدان' },
      { city: 'کرمانشاه', code: 'KSH', airport: 'فرودگاه شهید اشرفی اصفهانی' },
      { city: 'بوشهر', code: 'BUZ', airport: 'فرودگاه بوشهر' },
      { city: 'عسلویه', code: 'PGU', airport: 'فرودگاه خلیج فارس' },
      { city: 'گرگان', code: 'GBT', airport: 'فرودگاه گرگان' },
      { city: 'اردبیل', code: 'ADU', airport: 'فرودگاه اردبیل' },
      { city: 'دبی', code: 'DXB', airport: 'فرودگاه بین‌المللی دبی' },
      { city: 'استانبول', code: 'IST', airport: 'فرودگاه بین‌المللی استانبول' },
      { city: 'نجف', code: 'NJF', airport: 'فرودگاه بین‌المللی نجف' }
    ],
    announcement: {
      enabled: true,
      text: 'اطلاعیه مهم: برخی پروازهای امروز به‌دلیل شرایط جوی با تأخیر انجام می‌شوند — آخرین وضعیت پروازها را بررسی کنید'
    },
    socials: { instagram: true, telegram: true, whatsapp: true, linkedin: false, x: true },
    // ── Careers (فرصت‌های شغلی) ── managed in پنل ادمین سایت, shown on فرصتهای شغلی / استخدام
    careersSettings: { enabled: true },
    jobs: [
      { id: 'JB-1001', slotId: 'job-1', title: 'کارشناس پشتیبانی مسافران', dept: 'پشتیبانی', city: 'تهران', type: 'تمام‌وقت', active: true,
        generalReqs: ['حداقل مدرک کارشناسی', 'روابط عمومی قوی', 'آشنایی با نرم‌افزارهای اداری'],
        specialReqs: ['سابقه کار در صنعت گردشگری یا هوانوردی', 'آمادگی کار شیفتی'] },
      { id: 'JB-1002', slotId: 'job-2', title: 'توسعه‌دهنده فرانت‌اند', dept: 'فناوری اطلاعات', city: 'تهران', type: 'دورکاری', active: true,
        generalReqs: ['تسلط به JavaScript و React', 'آشنایی با طراحی واکنش‌گرا', 'حداقل ۲ سال سابقه کار'],
        specialReqs: ['آشنایی با سامانه‌های رزرواسیون مزیت محسوب می‌شود'] },
      { id: 'JB-1003', slotId: 'job-3', title: 'کارشناس فروش و بازرگانی', dept: 'بازرگانی', city: 'مشهد', type: 'پاره‌وقت', active: true,
        generalReqs: ['مهارت مذاکره و فروش', 'آشنایی با اکسل و گزارش‌گیری'],
        specialReqs: ['آشنایی با قراردادهای آژانسی'] }
    ],
    jobApplications: [],
    fareRules: [],
    webServicePricing: [
      { id: 'ws-search', name: 'وب‌سرویس جستجو و رزرو پرواز', desc: 'جستجو، نرخ‌گیری و صدور بلیط برای آژانس‌ها', plans: [
        { key: 'basic', label: 'پایه (ماهانه)', price: 4500000 },
        { key: 'pro', label: 'حرفه‌ای (ماهانه)', price: 9800000 },
        { key: 'enterprise', label: 'سازمانی (ماهانه)', price: 18500000 } ] },
      { id: 'ws-cancel', name: 'وب‌سرویس استرداد و ابطال', desc: 'استعلام جریمه و ابطال آنلاین بلیط', plans: [
        { key: 'basic', label: 'پایه (ماهانه)', price: 2200000 },
        { key: 'pro', label: 'حرفه‌ای (ماهانه)', price: 4300000 } ] },
      { id: 'ws-report', name: 'وب‌سرویس گزارش فروش', desc: 'گزارش تراکنش‌ها و فروش دوره‌ای', plans: [
        { key: 'basic', label: 'پایه (ماهانه)', price: 1500000 } ] }
    ],
    services: {
      search: true, payment: true, api: true, sms: true, email: true, club: true,
      charter: true, refund: false, checkin: true, cdn: true, dest: true, mobile: true
    },
    routes: [
      { from: 'تهران', to: 'مشهد', price: '۱٬۶۰۰٬۰۰۰' },
      { from: 'تهران', to: 'استانبول', price: '۴٬۲۰۰٬۰۰۰' },
      { from: 'تهران', to: 'دبی', price: '۳٬۸۰۰٬۰۰۰' },
      { from: 'مشهد', to: 'کیش', price: '۲٬۱۰۰٬۰۰۰' },
      { from: 'شیراز', to: 'تهران', price: '۱٬۴۵۰٬۰۰۰' }
    ],
    destinations: [
      { city: 'استانبول', price: '۴٬۲۰۰٬۰۰۰' },
      { city: 'دبی', price: '۳٬۸۰۰٬۰۰۰' },
      { city: 'کیش', price: '۱٬۹۰۰٬۰۰۰' },
      { city: 'مشهد', price: '۱٬۶۰۰٬۰۰۰' }
    ],
    refunds: [
      { id: 'RF-1090', ticket: 'AS-91320', passenger: 'رضا کریمی', route: 'تهران ← کیش', date: 'امروز', amount: '۱٬۷۵۰٬۰۰۰', status: 'submitted',
        iban: 'IR۸۲۰۱۷۰۰۰۰۰۰۰۳۳۲۲۱۱۰۰۹۹', submittedAt: 'امروز · ۰۹:۱۵',
        nid: '۰۰۷۷۸۸۹۹۰۰', mobile: '۰۹۱۲۱۱۱۲۲۳۳',
        airline: 'blujet', flightNo: 'EP-۶۲۰', flightDate: '۲۵ تیر ۱۴۰۵', flightTime: '۱۴:۳۰',
        cabin: 'اکونومی', seat: '۱۴B', totalPaid: '۲٬۵۰۰٬۰۰۰', penaltyPct: '٪۳۰', penaltyAmount: '۷۵۰٬۰۰۰', refundable: '۱٬۷۵۰٬۰۰۰',
        history: [
          { step: 'submitted', label: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰', at: 'امروز · ۰۹:۱۵' }
        ] },
      { id: 'RF-1089', ticket: 'AS-91044', passenger: 'سمانه موسوی', route: 'مشهد ← تهران', date: 'دیروز', amount: '۱٬۳۰۰٬۰۰۰', status: 'review',
        iban: 'IR۴۵۰۶۲۰۰۰۰۰۰۰۸۸۹۹۰۰۱۱۲۲', submittedAt: 'دیروز · ۱۸:۴۰',
        nid: '۰۰۵۵۴۴۳۳۲۲', mobile: '۰۹۳۵۴۴۴۵۵۶۶',
        airline: 'blujet', flightNo: 'EP-۲۱۵', flightDate: '۲۴ تیر ۱۴۰۵', flightTime: '۰۹:۵۰',
        cabin: 'اکونومی', seat: '۷A', totalPaid: '۱٬۸۵۰٬۰۰۰', penaltyPct: '٪۳۰', penaltyAmount: '۵۵۰٬۰۰۰', refundable: '۱٬۳۰۰٬۰۰۰',
        history: [
          { step: 'submitted', label: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰', at: 'دیروز · ۱۸:۴۰' },
          { step: 'review', label: 'بررسی توسط ادمین سایت', at: 'امروز · ۰۸:۳۰' }
        ] },
      { id: 'RF-1048', ticket: 'AS-90477', passenger: 'مهدی صادقی', route: 'تهران ← مشهد', date: 'امروز', amount: '۲٬۱۰۰٬۰۰۰', status: 'finance', assignee: 'مریم کاظمی',
        iban: 'IR۶۲۰۵۴۰۰۰۰۰۰۰۴۴۵۵۶۶۷۷۸۸', submittedAt: 'امروز · ۱۰:۴۰',
        nid: '۰۰۳۳۴۴۵۵۶۶', mobile: '۰۹۱۹۸۷۶۵۴۳۲',
        airline: 'blujet', flightNo: 'EP-۳۳۰', flightDate: '۲۲ تیر ۱۴۰۵', flightTime: '۰۷:۱۵',
        cabin: 'اکونومی', seat: '۹C', totalPaid: '۳٬۰۰۰٬۰۰۰', penaltyPct: '٪۳۰', penaltyAmount: '۹۰۰٬۰۰۰', refundable: '۲٬۱۰۰٬۰۰۰',
        history: [
          { step: 'submitted', label: 'ثبت درخواست کنسلی توسط مشتری — جریمه ٪۳۰', at: 'امروز · ۱۰:۴۰' },
          { step: 'review', label: 'بررسی توسط ادمین سایت', at: 'امروز · ۱۱:۱۰' },
          { step: 'finance', label: 'ارجاع به مریم کاظمی (کارشناس مالی) توسط ادمین سایت', at: 'امروز · ۱۱:۲۵' }
        ] },
      { id: 'RF-1043', ticket: 'AS-88213', passenger: 'نگار رضایی', route: 'تهران ← استانبول', date: '۱۲ تیر ۱۴۰۵', amount: '۴٬۲۰۰٬۰۰۰', status: 'paid',
        iban: 'IR۳۲۰۱۲۰۰۰۰۰۰۰۱۲۳۴۵۶۷۸۹۰', submittedAt: '۱۲ تیر ۱۴۰۵ · ۰۹:۲۰',
        nid: '۰۰۱۲۳۴۵۶۷۸', mobile: '۰۹۱۲۳۴۵۶۷۸۹',
        airline: 'ایران‌ایر', flightNo: 'IR-۷۲۳', flightDate: '۲۸ مرداد ۱۴۰۵', flightTime: '۲۰:۰۰',
        cabin: 'اکونومی', seat: '۱۲A', totalPaid: '۶٬۰۰۰٬۰۰۰', penaltyPct: '٪۳۰', penaltyAmount: '۱٬۸۰۰٬۰۰۰', refundable: '۴٬۲۰۰٬۰۰۰',
        history: [
          { step: 'submitted', label: 'ثبت درخواست توسط مشتری', at: '۱۲ تیر ۱۴۰۵ - ۰۹:۲۰' },
          { step: 'review', label: 'بررسی توسط ادمین سایت', at: '۱۲ تیر ۱۴۰۵ - ۱۱:۴۵' },
          { step: 'finance', label: 'ارسال به مدیر مالی', at: '۱۲ تیر ۱۴۰۵ - ۱۲:۰۵' },
          { step: 'paid', label: 'تأیید و واریز وجه', at: '۱۳ تیر ۱۴۰۵ - ۱۰:۰۰' }
        ] }
    ],
    // ── Post-flight passenger survey ────────────────────────────────────
    surveySettings: {
      enabled: true,
      title: 'نظرسنجی رضایت مسافران',
      questions: [
        { id: 'overall', label: 'رضایت کلی از سفر' },
        { id: 'crew', label: 'برخورد و کیفیت خدمه پروازی' },
        { id: 'punctuality', label: 'دقت در زمان پرواز' },
        { id: 'comfort', label: 'راحتی صندلی و کابین' },
        { id: 'checkin', label: 'سرعت پذیرش و چک‌این' }
      ]
    },
    surveyResponses: [
      { id: 'SV-1', flightNo: 'EP-۸۲۱', route: 'تهران ← دبی', airline: 'blujet', date: '۱۲ تیر ۱۴۰۵', rating: 5, comment: 'پرواز بسیار خوبی بود، خدمه بسیار محترم بودند و پرواز دقیقاً به‌موقع انجام شد.' },
      { id: 'SV-2', flightNo: 'EP-۸۲۱', route: 'تهران ← دبی', airline: 'blujet', date: '۱۲ تیر ۱۴۰۵', rating: 4, comment: 'همه‌چیز خوب بود فقط صندلی‌ها کمی تنگ بود.' },
      { id: 'SV-3', flightNo: 'EP-۸۲۱', route: 'تهران ← دبی', airline: 'blujet', date: '۱۲ تیر ۱۴۰۵', rating: 3, comment: 'چک‌این کمی طول کشید ولی پرواز روان بود.' },
      { id: 'SV-4', flightNo: 'W5-۱۱۲', route: 'مشهد ← تهران', airline: 'ماهان', date: '۱۲ تیر ۱۴۰۵', rating: 2, comment: 'پرواز با ۴۰ دقیقه تأخیر انجام شد و توضیحی داده نشد.' },
      { id: 'SV-5', flightNo: 'W5-۱۱۲', route: 'مشهد ← تهران', airline: 'ماهان', date: '۱۲ تیر ۱۴۰۵', rating: 3, comment: 'کیفیت پذیرایی متوسط بود.' },
      { id: 'SV-6', flightNo: 'IR-۶۵۵', route: 'تهران ← استانبول', airline: 'ایران‌ایر', date: '۱۳ تیر ۱۴۰۵', rating: 5, comment: 'بهترین تجربه پروازی من بود، همه‌چیز عالی بود.' },
      { id: 'SV-7', flightNo: 'IR-۶۵۵', route: 'تهران ← استانبول', airline: 'ایران‌ایر', date: '۱۳ تیر ۱۴۰۵', rating: 4, comment: 'خدمه خوب بودند، غذا متوسط.' },
      { id: 'SV-8', flightNo: 'IR-۶۵۵', route: 'تهران ← استانبول', airline: 'ایران‌ایر', date: '۱۳ تیر ۱۴۰۵', rating: 4, comment: 'در کل رضایت‌بخش بود.' },
      { id: 'SV-9', flightNo: 'QB-۲۲۰', route: 'شیراز ← کیش', airline: 'قشم‌ایر', date: '۱۳ تیر ۱۴۰۵', rating: 5, comment: 'پرواز کوتاه و بدون مشکل، عالی بود.' },
      { id: 'SV-10', flightNo: 'QB-۲۲۰', route: 'شیراز ← کیش', airline: 'قشم‌ایر', date: '۱۳ تیر ۱۴۰۵', rating: 1, comment: 'صندلی من کثیف بود و کولر کابین کار نمی‌کرد.' }
    ],

    // ── Manager performance reports ───────────────────────────────────────
    // Each key action a manager takes in their own panel is logged here and
    // shown to the chairman (رئیس هیئت مدیره) and senior manager (مدیر ارشد).
    // roleKey: senior=مدیر ارشد, ceo=مدیر عامل, commercial=مدیر بازرگانی, finance=مدیر مالی, it=مدیر IT
    // (ادمین سایت intentionally excluded from the board's manager report)
    // jy/jm/jd = Jalali date for the Persian-calendar filter & search.
    managerReports: [
      { id: 'MR-5012', manager: 'کامران رستمی', roleKey: 'ceo', role: 'مدیر عامل', category: 'strategy', catLabel: 'تصمیم راهبردی', action: 'ابلاغ بودجهٔ توسعهٔ ناوگان', detail: 'بودجهٔ خرید دو فروند ایرباس A320 برای سال جاری ابلاغ و به واحد بازرگانی اعلام شد.', at: 'امروز · ۱۵:۱۰', jy: 1405, jm: 4, jd: 11 },
      { id: 'MR-5011', manager: 'محمد امینی', roleKey: 'senior', role: 'مدیر ارشد', category: 'strategy', catLabel: 'هماهنگی عملیاتی', action: 'تصویب برنامهٔ پروازی فصل تابستان', detail: 'برنامهٔ پروازی مسیرهای داخلی برای تیر تا شهریور نهایی و ابلاغ شد.', at: 'امروز · ۱۳:۴۰', jy: 1405, jm: 4, jd: 11 },
      { id: 'MR-5010', manager: 'آرش نیک‌نام', roleKey: 'it', role: 'مدیر IT', category: 'system', catLabel: 'زیرساخت فنی', action: 'ارتقای سرور سامانهٔ رزرواسیون', detail: 'سامانهٔ رزرواسیون به نسخهٔ جدید مهاجرت و پایداری آن تأیید شد.', at: 'امروز · ۱۰:۲۵', jy: 1405, jm: 4, jd: 11 },
      { id: 'MR-5007', manager: 'رضا مرادی', roleKey: 'commercial', role: 'مدیر بازرگانی', category: 'agency', catLabel: 'تأیید آژانس', action: 'تأیید همکاری آژانس پارسیان‌گشت', detail: 'درخواست همکاری بررسی و تأیید شد؛ سطح اعتبار اولیه ۵۰۰ میلیون تومان.', at: 'امروز · ۰۹:۵۵', jy: 1405, jm: 4, jd: 11 },
      { id: 'MR-5006', manager: 'رضا مرادی', roleKey: 'commercial', role: 'مدیر بازرگانی', category: 'pricing', catLabel: 'نرخ‌گذاری ایرلاین', action: 'به‌روزرسانی نرخ پرواز تهران–استانبول', detail: 'نرخ پایهٔ اکونومی برای ایرلاین bluejet به ۶٬۳۰۰٬۰۰۰ تومان تغییر یافت.', at: 'دیروز · ۱۷:۱۵', jy: 1405, jm: 4, jd: 10 },
      { id: 'MR-5009', manager: 'آرش نیک‌نام', roleKey: 'it', role: 'مدیر IT', category: 'system', catLabel: 'امنیت سامانه', action: 'فعال‌سازی احراز هویت دومرحله‌ای', detail: 'ورود دومرحله‌ای برای همهٔ پنل‌های مدیریتی الزامی شد.', at: 'دیروز · ۱۴:۳۰', jy: 1405, jm: 4, jd: 10 },
      { id: 'MR-5005', manager: 'سحر کاظمی', roleKey: 'finance', role: 'مدیر مالی', category: 'invoice', catLabel: 'صدور فاکتور', action: 'ارسال فاکتور دورهٔ آژانس کیان‌سیر', detail: 'فاکتور تسویهٔ دوره‌ای به مبلغ ۹۲۰ میلیون تومان صادر و ارسال شد.', at: 'دیروز · ۰۹:۴۰', jy: 1405, jm: 4, jd: 10 },
      { id: 'MR-5008', manager: 'محمد امینی', roleKey: 'senior', role: 'مدیر ارشد', category: 'strategy', catLabel: 'ارزیابی عملکرد', action: 'بازبینی گزارش عملکرد آژانس‌ها', detail: 'گزارش سه‌ماههٔ عملکرد آژانس‌های طرف قرارداد بررسی و جمع‌بندی شد.', at: '۲ روز پیش · ۱۶:۲۰', jy: 1405, jm: 4, jd: 9 },
      { id: 'MR-5004', manager: 'سحر کاظمی', roleKey: 'finance', role: 'مدیر مالی', category: 'refund', catLabel: 'استرداد بلیط', action: 'تأیید و واریز استرداد RF-1043', detail: 'مبلغ ۴٬۲۰۰٬۰۰۰ تومان بابت استرداد بلیط به کارت مسافر واریز شد.', at: '۲ روز پیش · ۱۱:۰۰', jy: 1405, jm: 4, jd: 9 },
      { id: 'MR-5002', manager: 'رضا مرادی', roleKey: 'commercial', role: 'مدیر بازرگانی', category: 'agency', catLabel: 'تعیین اعتبار', action: 'افزایش سقف اعتبار آژانس زاگرس‌تور', detail: 'سقف اعتبار از ۳۰۰ به ۴۵۰ میلیون تومان افزایش یافت.', at: '۳ روز پیش · ۱۳:۰۰', jy: 1405, jm: 4, jd: 8 }
    ],
    // ── Ticket pricing proposals ───────────────────────────────────────────
    // مدیر بازرگانی a price for a flight; it stays "pending" until مدیر عامل
    // approves it, after which the flight price is registered ("registered").
    // base=قیمت پایه, comp=قیمت رقبا, proposed=قیمت پیشنهادی مدیر بازرگانی.
    pricingProposals: [
      { id: 'PP-3001', route: 'تهران ← دبی', flightNo: 'EP-840', date: '۲۵ تیر ۱۴۰۵', cap: 180, charter: 60, base: 3800000, comp: 3900000, proposed: 3850000, legalRate: 4200000, proposedBy: 'رضا مرادی', proposedRole: 'مدیر بازرگانی', status: 'pending', at: 'امروز · ۱۰:۲۰', note: 'قیمت کمی پایین‌تر از رقبا برای پرکردن صندلی‌های آزاد.' },
      { id: 'PP-3002', route: 'تهران ← استانبول', flightNo: 'EP-712', date: '۲۷ تیر ۱۴۰۵', cap: 200, charter: 80, base: 6800000, comp: 6600000, proposed: 6750000, legalRate: 7100000, proposedBy: 'رضا مرادی', proposedRole: 'مدیر بازرگانی', status: 'pending', at: 'امروز · ۰۹:۱۵', note: 'تقاضای بالای مسیر، قیمت هم‌تراز بازار پیشنهاد می‌شود.' },
      { id: 'PP-3003', route: 'مشهد ← کیش', flightNo: 'W5-233', date: '۲۹ تیر ۱۴۰۵', cap: 150, charter: 45, base: 2500000, comp: 2600000, proposed: 2480000, legalRate: 2800000, proposedBy: 'رضا مرادی', proposedRole: 'مدیر بازرگانی', status: 'pending', at: 'دیروز · ۱۶:۴۰', note: 'مسیر رقابتی؛ قیمت پایین‌تر برای جذب مسافر.' },
      { id: 'PP-3004', route: 'تهران ← نجف', flightNo: 'EP-455', date: '۳۰ تیر ۱۴۰۵', cap: 160, charter: 90, base: 4000000, comp: 4200000, proposed: 4100000, legalRate: 4500000, proposedBy: 'رضا مرادی', proposedRole: 'مدیر بازرگانی', status: 'registered', registeredPrice: 4100000, at: '۲ روز پیش · ۱۱:۳۰', note: 'تعهد چارتری بالا؛ قیمت متعادل ثبت شد.' }
    ],
    // ── Staff (employees) ─────────────────────────────────────────────────
    // Employees are created by مدیر IT and belong to a department (dept):
    //   commercial → زیرمجموعهٔ مدیر بازرگانی, finance → زیرمجموعهٔ مدیر مالی.
    // Each staff member gets a tab in their manager's «گزارش کارمندان».
    staff: [
      { id: 'ST-7001', name: 'سمیرا احمدی', username: 'com.ahmadi', password: 'Aseman@1001', role: 'کارشناس فروش', rank: 'کارشناس', dept: 'commercial', permissions: ['dashboard','agencies','reports','cartable'], createdBy: 'مدیر IT', at: 'دیروز', jy: 1405, jm: 4, jd: 11, isNew: false },
      { id: 'ST-7002', name: 'بهنام رستمی', username: 'com.rostami', password: 'Aseman@1002', role: 'کارشناس نرخ‌گذاری', rank: 'کارشناس ارشد', dept: 'commercial', permissions: ['dashboard','flights','reports','cartable'], createdBy: 'مدیر IT', at: '۳ روز پیش', jy: 1405, jm: 4, jd: 9, isNew: false },
      { id: 'ST-7003', name: 'مریم کاظمی', username: 'fin.kazemi', password: 'Aseman@1003', role: 'کارشناس حسابداری', rank: 'کارشناس', dept: 'finance', permissions: ['dashboard','finance','reports','cartable'], createdBy: 'مدیر IT', at: 'دیروز', jy: 1405, jm: 4, jd: 11, isNew: false },
      { id: 'ST-7004', name: 'حسین نادری', username: 'fin.naderi', password: 'Aseman@1004', role: 'کارشناس تسویه', rank: 'کارشناس ارشد', dept: 'finance', permissions: ['dashboard','finance','refund','cartable'], createdBy: 'مدیر IT', at: '۴ روز پیش', jy: 1405, jm: 4, jd: 8, isNew: false },
      { id: 'ST-7005', name: 'بابک صدرایی', username: 'site.sadrayi', password: 'Aseman@1005', role: 'ادمین سایت', rank: 'کارشناس', dept: 'site', permissions: ['dashboard','content','support','cartable'], createdBy: 'مدیر IT', at: 'دیروز', jy: 1405, jm: 4, jd: 11, isNew: true }
    ],
    // Web-service purchase requests from agencies → admin inbox → refer → approve/activate.
    webServiceRequests: [
      { id: 'WS-3001', agency: 'پارسیان گشت blujet', agencyId: 'AG-1', type: 'جستجو و رزرو پرواز (API)', plan: 'یک‌ساله', price: 48000000, note: 'اتصال سامانهٔ فروش آنلاین آژانس به موتور رزرو.', status: 'submitted', assignee: null, at: 'امروز · ۰۹:۴۰', jy: 1405, jm: 4, jd: 12,
        history: [{ step: 'submitted', label: 'ثبت درخواست خرید توسط آژانس', at: 'امروز · ۰۹:۴۰' }] },
      { id: 'WS-3002', agency: 'کیان‌سیر جنوب', agencyId: 'AG-2', type: 'استعلام صندلی و اعتبار (API)', plan: 'شش‌ماهه', price: 26000000, note: 'نیازمند وب‌سرویس استعلام ظرفیت برای پنل داخلی.', status: 'submitted', assignee: null, at: 'دیروز · ۱۶:۱۰', jy: 1405, jm: 4, jd: 11,
        history: [{ step: 'submitted', label: 'ثبت درخواست خرید توسط آژانس', at: 'دیروز · ۱۶:۱۰' }] }
    ],
    staffTasks: [
      { id: 'TK-5001', dept: 'commercial', title: 'پیگیری درخواست افزایش اعتبار آژانس پارسیان‌گشت', priority: 'high', due: 'امروز', status: 'open', from: 'مدیر بازرگانی' },
      { id: 'TK-5002', dept: 'commercial', title: 'بازبینی نرخ پیشنهادی مسیر تهران–استانبول', priority: 'mid', due: 'فردا', status: 'open', from: 'مدیر بازرگانی' },
      { id: 'TK-5003', dept: 'commercial', title: 'تماس با آژانس کیان‌سیر بابت تسویهٔ معوق', priority: 'low', due: '۳ روز آینده', status: 'open', from: 'معاون بازرگانی' },
      { id: 'TK-5004', dept: 'finance', title: 'بررسی مدارک درخواست استرداد RF-1048', priority: 'high', due: 'امروز', status: 'open', from: 'مدیر مالی' },
      { id: 'TK-5005', dept: 'finance', title: 'صدور فاکتور دورهٔ تیرماه آژانس blujet‌پرواز', priority: 'mid', due: 'فردا', status: 'open', from: 'مدیر مالی' },
      { id: 'TK-5006', dept: 'finance', title: 'ثبت مغایرت تسویهٔ چارتر مسیر مشهد', priority: 'low', due: '۲ روز آینده', status: 'open', from: 'مدیر مالی' }
    ],
    // Referrals routed to a specific employee (assignee) within their own unit.
    staffReferrals: [
      { id: 'RE-6001', dept: 'commercial', assignee: 'سمیرا احمدی', title: 'بررسی درخواست همکاری آژانس نگین‌پرواز', desc: 'کنترل مدارک و اطلاعات آژانس متقاضی و ثبت گزارش.', from: 'مدیر بازرگانی', at: 'امروز · ۰۹:۳۰', status: 'open', note: 'اولویت با بررسی مجوز بند «ب» است.' },
      { id: 'RE-6002', dept: 'finance', assignee: 'حسین نادری', title: 'پیگیری استرداد بلیط مهدی صادقی', desc: 'کنترل شماره شبا و مبلغ جریمه، آماده‌سازی برای واریز.', from: 'مدیر مالی', at: 'امروز · ۱۰:۱۵', status: 'open', note: 'پس از تأیید، پرونده بسته شود.' }
    ],
    // Each key action an employee takes is logged and shown to their manager.
    staffReports: [
      { id: 'SR-9001', staffId: 'ST-7001', staffName: 'سمیرا احمدی', dept: 'commercial', category: 'agency', catLabel: 'پیگیری آژانس', action: 'تماس با آژانس پارسیان‌گشت', detail: 'پیگیری تسویهٔ دوره‌ای و ثبت درخواست افزایش اعتبار.', at: 'امروز · ۱۱:۲۰', jy: 1405, jm: 4, jd: 12 },
      { id: 'SR-9002', staffId: 'ST-7002', staffName: 'بهنام رستمی', dept: 'commercial', category: 'pricing', catLabel: 'نرخ‌گذاری', action: 'بازبینی نرخ مسیر تهران–مشهد', detail: 'مقایسهٔ نرخ رقبا و پیشنهاد اصلاح قیمت به مدیر بازرگانی.', at: 'امروز · ۰۹:۴۵', jy: 1405, jm: 4, jd: 12 },
      { id: 'SR-9003', staffId: 'ST-7001', staffName: 'سمیرا احمدی', dept: 'commercial', category: 'sales', catLabel: 'فروش', action: 'صدور ۸ بلیط گروهی', detail: 'رزرو گروهی مسیر تهران–کیش برای شرکت طرف قرارداد.', at: 'دیروز · ۱۶:۱۰', jy: 1405, jm: 4, jd: 11 },
      { id: 'SR-9004', staffId: 'ST-7003', staffName: 'مریم کاظمی', dept: 'finance', category: 'invoice', catLabel: 'صدور فاکتور', action: 'صدور فاکتور آژانس کیان‌سیر', detail: 'فاکتور تسویهٔ دوره‌ای به مبلغ ۳۲۰ میلیون تومان صادر شد.', at: 'امروز · ۱۰:۳۰', jy: 1405, jm: 4, jd: 12 },
      { id: 'SR-9005', staffId: 'ST-7004', staffName: 'حسین نادری', dept: 'finance', category: 'refund', catLabel: 'استرداد', action: 'بررسی درخواست استرداد RF-1088', detail: 'کنترل مدارک و ارجاع به مدیر مالی برای تأیید نهایی.', at: 'دیروز · ۱۴:۲۰', jy: 1405, jm: 4, jd: 11 },
      { id: 'SR-9006', staffId: 'ST-7003', staffName: 'مریم کاظمی', dept: 'finance', category: 'settle', catLabel: 'تسویه', action: 'ثبت مغایرت تسویهٔ چارتر', detail: 'شناسایی مغایرت ۱۲ میلیون تومانی و اعلام به مدیر مالی.', at: '۲ روز پیش · ۱۱:۰۰', jy: 1405, jm: 4, jd: 10 }
    ],
    // Notifications to a manager when IT creates a new employee in their dept.
    staffNotifs: [],
    // ── Loyalty club ──────────────────────────────────────────────────────
    // Each passenger who joins the club gets a profile. Reaching a points
    // threshold makes them eligible for a membership card; issuance must be
    // approved (admin → super-admin / senior-manager → card issued).
    clubMembers: [
      { id: 'CM-2001', name: 'نگار رضایی', email: 'negar@email.com', birth: '۱۳۷۲/۰۵/۱۴', nationalId: '۰۰۱۲۳۴۵۶۷۸', joinDate: '۱۴۰۴/۰۳/۱۰', points: 12450, used: 500, level: 'gold', cardStatus: 'issued', cardNo: 'GOLD-8842', cardBlocked: false, issuedBy: 'رئیس هیئت مدیره (تأیید درخواست)', transactions: [
        { date: '۱۴۰۵/۰۳/۲۰', desc: 'استفاده از امتیاز برای ارتقای صندلی — تهران به استانبول', points: 300 },
        { date: '۱۴۰۴/۱۲/۰۵', desc: 'تخفیف بلیط با کارت طلایی — مشهد', points: 200 }
      ] },
      { id: 'CM-2002', name: 'محمد کریمی', email: 'm.karimi@email.com', birth: '۱۳۶۸/۱۱/۰۲', nationalId: '۰۰۹۸۷۶۵۴۳۲', joinDate: '۱۴۰۴/۰۵/۲۲', points: 6200, used: 0, level: 'gold', cardStatus: 'review', cardNo: null, cardBlocked: false, issuedBy: null, transactions: [] },
      { id: 'CM-2003', name: 'سارا احمدی', email: 'sara.ah@email.com', birth: '۱۳۷۵/۰۲/۱۹', nationalId: '۰۰۱۱۲۲۳۳۴۴', joinDate: '۱۴۰۵/۰۱/۰۸', points: 3100, used: 0, level: 'silver', cardStatus: 'none', cardNo: null, cardBlocked: false, issuedBy: null, transactions: [] },
      { id: 'CM-2004', name: 'علی مرادی', email: 'ali.m@email.com', birth: '۱۳۶۰/۰۸/۳۰', nationalId: '۰۰۵۵۶۶۷۷۸۸', joinDate: '۱۴۰۳/۱۰/۱۵', points: 18900, used: 1200, level: 'platinum', cardStatus: 'issued', cardNo: 'PLAT-1290', cardBlocked: false, issuedBy: 'مدیر ارشد (صدور مستقیم)', transactions: [
        { date: '۱۴۰۵/۰۲/۱۱', desc: 'استفاده از امتیاز برای بلیط رایگان داخلی — کیش', points: 800 },
        { date: '۱۴۰۴/۱۱/۱۸', desc: 'ترانسفر فرودگاهی رایگان با کارت پلاتین', points: 400 }
      ] }
    ],
    cardRequests: [
      { id: 'CR-501', memberId: 'CM-2002', name: 'محمد کریمی', level: 'gold', points: 6200, date: '۱۴۰۵/۰۴/۰۲', status: 'referred', assignedTo: 'senior', cardNo: null,
        history: [
          { step: 'submitted', label: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت', at: '۱۴۰۵/۰۴/۰۲ - ۱۰:۱۲' },
          { step: 'referred', label: 'ارجاع به مدیر ارشد توسط ادمین سایت', at: '۱۴۰۵/۰۴/۰۲ - ۱۱:۳۰' }
        ] },
      { id: 'CR-500', memberId: 'CM-2001', name: 'نگار رضایی', level: 'gold', points: 12450, date: '۱۴۰۴/۰۳/۱۲', status: 'approved', assignedTo: 'super', cardNo: 'GOLD-8842',
        history: [
          { step: 'submitted', label: 'رسیدن به حد امتیاز و ثبت درخواست صدور کارت', at: '۱۴۰۴/۰۳/۱۲ - ۰۹:۰۰' },
          { step: 'referred', label: 'ارجاع به رئیس هیئت مدیره توسط ادمین سایت', at: '۱۴۰۴/۰۳/۱۲ - ۱۰:۱۵' },
          { step: 'approved', label: 'تأیید و صدور کارت طلایی', at: '۱۴۰۴/۰۳/۱۳ - ۱۲:۴۰' }
        ] }
    ],
    // ── Reservation system (PNRs) ──────────────────────────────────────────
    reservations: [
      { pnr:'AS5K2P', passenger:'نگار رضایی', nid:'۰۰۱۲۳۴۵۶۷۸', mobile:'۰۹۱۲۳۴۵۶۷۸۹', from:'تهران', to:'دبی', fromCode:'IKA', toCode:'DXB', date:'۱۴۰۵/۰۴/۱۲', time:'08:30', flightNo:'EP-821', aircraft:'Airbus A320', cabin:'اکونومی', pax:1, seat:'12A', price:3800000, channel:'مستقیم', status:'issued', createdAt:'۱۴۰۵/۰۳/۲۸' },
      { pnr:'AS9T4L', passenger:'محمد کریمی', nid:'۰۰۹۸۷۶۵۴۳۲', mobile:'۰۹۳۵۱۲۳۴۵۶۷', from:'مشهد', to:'تهران', fromCode:'MHD', toCode:'IKA', date:'۱۴۰۵/۰۴/۱۵', time:'13:10', flightNo:'W5-112', aircraft:'Airbus A321', cabin:'اکونومی', pax:2, seat:'7C', price:2300000, channel:'آژانس', status:'confirmed', createdAt:'۱۴۰۵/۰۴/۰۲' },
      { pnr:'AS3X7M', passenger:'علی مرادی', nid:'۰۰۵۵۶۶۷۷۸۸', mobile:'۰۹۱۰۰۰۰۱۲۳۴', from:'تهران', to:'استانبول', fromCode:'IKA', toCode:'IST', date:'۱۴۰۵/۰۴/۱۸', time:'20:00', flightNo:'IR-655', aircraft:'Boeing 737-800', cabin:'بیزنس', pax:1, seat:'2A', price:6800000, channel:'VIP', status:'issued', createdAt:'۱۴۰۵/۰۴/۰۱' },
      { pnr:'AS8B1Q', passenger:'سارا احمدی', nid:'۰۰۱۱۲۲۳۳۴۴', mobile:'۰۹۲۱۲۳۴۵۶۷۸', from:'شیراز', to:'کیش', fromCode:'SYZ', toCode:'KIH', date:'۱۴۰۵/۰۴/۲۰', time:'10:45', flightNo:'QB-220', aircraft:'ATR 72-600', cabin:'اکونومی', pax:3, seat:'14B', price:1900000, channel:'آژانس', status:'cancelled', createdAt:'۱۴۰۵/۰۳/۳۰' }
    ],
    // ── Partner API platform (agency access) ──────────────────────────
    agencyApi: [
      { name:'آژانس پارسیان گشت', key:'pk_live_8f2a91c4d7', scope:'کامل (جستجو + رزرو + صدور)', status:'active', activatedAt:'۱۴۰۵/۰۱/۱۵', expiresAt:'۱۴۰۶/۰۱/۱۵', lastConn:'۵ دقیقه پیش', calls:'۱۲٬۴۸۰' },
      { name:'آژانس blujet پرواز', key:'pk_live_3b71e0a9f5', scope:'جستجو + رزرو', status:'active', activatedAt:'۱۴۰۵/۰۲/۲۸', expiresAt:'۱۴۰۶/۰۲/۲۸', lastConn:'۴۰ دقیقه پیش', calls:'۸٬۱۳۰' },
      { name:'آژانس سپهر سیر', key:'pk_test_a04c8821b3', scope:'فقط جستجو (آزمایشی)', status:'suspended', activatedAt:'۱۴۰۵/۰۳/۱۰', expiresAt:'۱۴۰۵/۰۹/۱۰', lastConn:'۳ روز پیش', calls:'۴۱۰' }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // One-time term migrations on persisted data (non-destructive — only rewrites
  // affected string values in place, never wipes the store).
  var TERM_FIXES = [['سوپر ادمین', 'رئیس هیئت مدیره']];
  function sanitizeStrings(v) {
    if (typeof v === 'string') {
      var s = v;
      for (var i = 0; i < TERM_FIXES.length; i++) { s = s.split(TERM_FIXES[i][0]).join(TERM_FIXES[i][1]); }
      return s;
    }
    if (Array.isArray(v)) { return v.map(sanitizeStrings); }
    if (v && typeof v === 'object') { var o = {}; for (var k in v) { o[k] = sanitizeStrings(v[k]); } return o; }
    return v;
  }
  function migrate() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var obj = sanitizeStrings(JSON.parse(raw));
      // Manager reports are seed/demo data (not user-generated). If a persisted
      // copy predates the current schema (missing Jalali date, or still lists the
      // excluded ادمین سایت), drop it so the fresh defaults are served.
      if (Array.isArray(obj.managerReports)) {
        var stale = obj.managerReports.some(function (r) {
          // only the original seed set (MR-500x) or the excluded admin role force a refresh
          return !r || r.roleKey === 'admin' || (/^MR-500\d$/.test(r.id) && r.jd == null);
        });
        if (stale) delete obj.managerReports;
      }
      // Pricing proposals seed refresh: if a persisted seed row (PP-30xx) predates
      // the نرخ قانونی field, drop the whole array so fresh defaults are served.
      if (Array.isArray(obj.pricingProposals)) {
        var staleP = obj.pricingProposals.some(function (p) {
          return p && /^PP-30\d\d$/.test(p.id) && p.legalRate == null;
        });
        if (staleP) delete obj.pricingProposals;
      }
      // Refunds seed refresh: if a persisted seed row (RF-1043) predates the
      // passenger-info fields (iban), or the RF-1048 finance-referred seed is
      // missing, drop the whole array so fresh defaults serve.
      if (Array.isArray(obj.refunds)) {
        var staleR = obj.refunds.some(function (r) {
          return r && r.id === 'RF-1043' && r.iban == null;
        });
        var missingSeed = !obj.refunds.some(function (r) { return r && r.id === 'RF-1048'; });
        var missingPending = !obj.refunds.some(function (r) { return r && r.id === 'RF-1090'; });
        if (staleR || missingSeed || missingPending) delete obj.refunds;
      }
      // Staff seed refresh: if persisted staff predates the permissions/password
      // fields, or the staffTasks/staffReferrals stores are missing, refresh them.
      if (Array.isArray(obj.staff)) {
        var staleStaff = obj.staff.some(function (s) { return s && s.id === 'ST-7001' && s.permissions == null; });
        if (staleStaff) { delete obj.staff; delete obj.staffTasks; delete obj.staffReferrals; }
      }
      if (obj.staffTasks == null) delete obj.staffTasks;
      if (obj.staffReferrals == null) delete obj.staffReferrals;
      if (obj.webServiceRequests == null) delete obj.webServiceRequests;
      var fixed = JSON.stringify(obj);
      if (fixed !== raw) localStorage.setItem(KEY, fixed);
    } catch (e) {}
  }
  migrate();

  function getAll() {
    var out = clone(defaults);
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) {
          if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) {
            out[k] = Object.assign({}, out[k], saved[k]);
          } else {
            out[k] = saved[k];
          }
        }
      }
    } catch (e) {}
    return out;
  }

  // Merge a partial patch (e.g. { banner: {...} }) and persist.
  function save(patch) {
    var cur = getAll();
    for (var k in patch) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
        cur[k] = Object.assign({}, cur[k], patch[k]);
      } else {
        cur[k] = patch[k];
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('sitedata:change', { detail: cur })); } catch (e) {}
    return cur;
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ── Cities / airports ────────────────────────────────────────────────
  function getCities() { return getAll().cities || []; }
  function addCity(rec) {
    var all = getAll();
    var list = all.cities ? all.cities.slice() : [];
    if (list.some(function (c) { return c.city === rec.city; })) return all;
    list.push(rec);
    return save({ cities: list });
  }

  // ── Flight classes ───────────────────────────────────────────────────────
  function getFlightClasses() { return getAll().flightClasses || []; }
  function saveFlightClasses(list) { return save({ flightClasses: list }); }
  function addFlightClass(rec) {
    var all = getAll();
    var list = all.flightClasses ? all.flightClasses.slice() : [];
    if (list.some(function (c) { return c.code === rec.code; })) return all;
    list.push(rec);
    return save({ flightClasses: list });
  }
  function updateFlightClass(code, patch) {
    var all = getAll();
    var list = (all.flightClasses || []).map(function (c) { return c.code === code ? Object.assign({}, c, patch) : c; });
    return save({ flightClasses: list });
  }
  function deleteFlightClass(code) {
    var all = getAll();
    var list = (all.flightClasses || []).filter(function (c) { return c.code !== code; });
    return save({ flightClasses: list });
  }

  // ── Refund flow ──────────────────────────────────────────────────────────
  function getRefunds() { return getAll().refunds || []; }
  function addRefund(r) {
    var all = getAll();
    var list = all.refunds ? all.refunds.slice() : [];
    list.unshift(r);
    return save({ refunds: list });
  }
  // Advance/replace a refund by id; patch may include status + a history entry.
  function updateRefund(id, patch, historyEntry) {
    var all = getAll();
    var list = (all.refunds || []).map(function (r) {
      if (r.id !== id) return r;
      var next = Object.assign({}, r, patch);
      if (historyEntry) next.history = (r.history || []).concat([historyEntry]);
      return next;
    });
    return save({ refunds: list });
  }

  // ── Careers / jobs flow ──
  function getCareersSettings() { return getAll().careersSettings || { enabled: true }; }
  function toggleCareers() {
    var c = getCareersSettings();
    return save({ careersSettings: { enabled: !c.enabled } });
  }
  function getJobs() { return getAll().jobs || []; }
  function getActiveJobs() { return getJobs().filter(function (j) { return j.active !== false; }); }
  function getJob(id) {
    return getJobs().filter(function (j) { return j.id === id; })[0] || null;
  }
  function addJob(j) {
    var list = getJobs().slice();
    list.unshift(j);
    return save({ jobs: list });
  }
  function updateJob(id, patch) {
    var list = getJobs().map(function (j) { return j.id === id ? Object.assign({}, j, patch) : j; });
    return save({ jobs: list });
  }
  function toggleJob(id) {
    var list = getJobs().map(function (j) { return j.id === id ? Object.assign({}, j, { active: j.active === false }) : j; });
    return save({ jobs: list });
  }
  function getJobApplications() { return getAll().jobApplications || []; }
  function addJobApplication(a) {
    var rec = Object.assign({ status: 'submitted' }, a);
    if (!rec.history) rec.history = [{ step: 'submitted', label: 'ثبت درخواست استخدام از سایت', at: rec.at || 'هم‌اکنون' }];
    var list = getJobApplications().slice();
    list.unshift(rec);
    return save({ jobApplications: list });
  }
  function updateJobApplication(id, patch, historyEntry) {
    var list = getJobApplications().map(function (a) {
      if (a.id !== id) return a;
      var next = Object.assign({}, a, patch);
      if (historyEntry) next.history = (a.history || []).concat([historyEntry]);
      return next;
    });
    return save({ jobApplications: list });
  }

  // ── Fare classes (کلاس‌های نرخی) ──
  function getFareRules(flightNo) {
    var list = getAll().fareRules || [];
    return flightNo ? list.filter(function (r) { return r.flightNo === flightNo; }) : list;
  }
  function addFareRule(r) {
    var list = (getAll().fareRules || []).slice();
    list.unshift(r);
    return save({ fareRules: list });
  }
  function updateFareRule(id, patch) {
    var list = (getAll().fareRules || []).map(function (r) { return r.id === id ? Object.assign({}, r, patch) : r; });
    return save({ fareRules: list });
  }
  function deleteFareRule(id) {
    var list = (getAll().fareRules || []).filter(function (r) { return r.id !== id; });
    return save({ fareRules: list });
  }

  // ── Web-service pricing ──
  function getWebServicePricing() { return getAll().webServicePricing || []; }
  function saveWebServicePricing(list) { return save({ webServicePricing: list }); }

  // ── Loyalty club flow ────────────────────────────────────────────────────
  // Fallback shape only — live thresholds come from getClubRules(), editable
  // in پنل مدیر بازرگانی and shared by every member on the site.
  var CARD_TIERS = [
    { key: 'silver', label: 'نقره‌ای', min: 0, max: 5000 },
    { key: 'gold', label: 'طلایی', min: 5000, max: 15000 },
    { key: 'platinum', label: 'پلاتین', min: 15000, max: Infinity }
  ];
  var CARD_THRESHOLD = 5000;
  function getClubRules() {
    var r = getAll().clubRules || {};
    return {
      silverMin: r.silverMin != null ? r.silverMin : 0,
      goldMin: r.goldMin != null ? r.goldMin : 5000,
      platinumMin: r.platinumMin != null ? r.platinumMin : 15000,
      cardThreshold: r.cardThreshold != null ? r.cardThreshold : 5000
    };
  }
  function saveClubRules(rules) { return save({ clubRules: rules }); }
  function getCardThreshold() { return getClubRules().cardThreshold; }
  function tiersFromRules() {
    var r = getClubRules();
    return [
      { key: 'silver', label: 'نقره‌ای', min: r.silverMin, max: r.goldMin },
      { key: 'gold', label: 'طلایی', min: r.goldMin, max: r.platinumMin },
      { key: 'platinum', label: 'پلاتین', min: r.platinumMin, max: Infinity }
    ];
  }
  function levelForPoints(p) {
    var tiers = tiersFromRules();
    for (var i = tiers.length - 1; i >= 0; i--) { if (p >= tiers[i].min) return tiers[i].key; }
    return 'silver';
  }
  function getClubMembers() { return getAll().clubMembers || []; }
  function addClubMember(m) {
    var all = getAll();
    var list = all.clubMembers ? all.clubMembers.slice() : [];
    list.unshift(m);
    return save({ clubMembers: list });
  }
  function updateClubMember(id, patch) {
    var all = getAll();
    var list = (all.clubMembers || []).map(function (m) { return m.id === id ? Object.assign({}, m, patch) : m; });
    return save({ clubMembers: list });
  }
  function getCardRequests() { return getAll().cardRequests || []; }
  function addCardRequest(r) {
    var all = getAll();
    var list = all.cardRequests ? all.cardRequests.slice() : [];
    list.unshift(r);
    return save({ cardRequests: list });
  }
  function updateCardRequest(id, patch, historyEntry) {
    var all = getAll();
    var list = (all.cardRequests || []).map(function (r) {
      if (r.id !== id) return r;
      var next = Object.assign({}, r, patch);
      if (historyEntry) next.history = (r.history || []).concat([historyEntry]);
      return next;
    });
    return save({ cardRequests: list });
  }

  // ── Reservation system ────────────────────────────────────────────
  function getReservations() { return getAll().reservations || []; }
  function addReservation(r) {
    var all = getAll();
    var list = all.reservations ? all.reservations.slice() : [];
    list.unshift(r);
    return save({ reservations: list });
  }
  function updateReservation(pnr, patch) {
    var all = getAll();
    var list = (all.reservations || []).map(function (r) { return r.pnr === pnr ? Object.assign({}, r, patch) : r; });
    return save({ reservations: list });
  }
  function getAgencyApi() { return getAll().agencyApi || []; }
  function updateAgencyApi(name, patch) {
    var all = getAll();
    var list = (all.agencyApi || []).map(function (a) { return a.name === name ? Object.assign({}, a, patch) : a; });
    return save({ agencyApi: list });
  }
  // Create or replace an agency's API access (used by agency detail page).
  function addAgencyApi(rec) {
    var all = getAll();
    var list = (all.agencyApi || []).slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].name === rec.name) { idx = i; break; } }
    if (idx >= 0) { list[idx] = Object.assign({}, list[idx], rec); }
    else { list.unshift(rec); }
    return save({ agencyApi: list });
  }
  function apiForAgency(name) {
    var list = getAll().agencyApi || [];
    for (var i = 0; i < list.length; i++) { if (list[i].name === name) return list[i]; }
    return null;
  }

  // ── Post-flight passenger survey ────────────────────────────────────────
  // Created/configured by مدیر IT (questions + on/off). Responses are collected
  // from passengers after each completed flight; رئیس هیئت مدیره, مدیر عامل and
  // مدیر ارشد read the results and can ask AI for a short summary per flight.
  function getSurveySettings() {
    var s = getAll().surveySettings || {};
    return {
      enabled: s.enabled !== false,
      title: s.title || 'نظرسنجی رضایت مسافران',
      questions: s.questions || []
    };
  }
  function saveSurveySettings(patch) {
    var cur = getSurveySettings();
    return save({ surveySettings: Object.assign({}, cur, patch) });
  }
  function getSurveyResponses(flightNo) {
    var r = getAll().surveyResponses || [];
    return flightNo ? r.filter(function (x) { return x.flightNo === flightNo; }) : r;
  }
  // Aggregate responses into one row per flight (route, date, count, avg rating).
  function getSurveyFlights() {
    var r = getAll().surveyResponses || [];
    var byFlight = {};
    r.forEach(function (x) {
      if (!byFlight[x.flightNo]) byFlight[x.flightNo] = { flightNo: x.flightNo, route: x.route, airline: x.airline, date: x.date, responses: [] };
      byFlight[x.flightNo].responses.push(x);
    });
    return Object.keys(byFlight).map(function (k) {
      var f = byFlight[k];
      var sum = 0; f.responses.forEach(function (x) { sum += x.rating; });
      f.avg = f.responses.length ? Math.round((sum / f.responses.length) * 10) / 10 : 0;
      f.count = f.responses.length;
      return f;
    });
  }

  // ── Manager performance reports ────────────────────────────────────────
  function getManagerReports() { return getAll().managerReports || []; }
  function addManagerReport(r) {
    var all = getAll();
    var list = all.managerReports ? all.managerReports.slice() : [];
    // جلوگیری از ثبت تکراری با همان شناسه
    if (r && r.id && list.some(function (x) { return x.id === r.id; })) return;
    list.unshift(r);
    return save({ managerReports: list });
  }

  // ── Ticket pricing proposals ───────────────────────────────────────────
  function getPricingProposals() { return getAll().pricingProposals || []; }
  function addPricingProposal(p) {
    var all = getAll();
    var list = all.pricingProposals ? all.pricingProposals.slice() : [];
    if (p && p.id && list.some(function (x) { return x.id === p.id; })) return;
    list.unshift(p);
    return save({ pricingProposals: list });
  }
  function updatePricingProposal(id, patch) {
    var all = getAll();
    var list = (all.pricingProposals || []).slice();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list[i] = Object.assign({}, list[i], patch); break; }
    }
    return save({ pricingProposals: list });
  }

  // ── Staff (employees), reports & notifications ─────────────────────────
  function getStaff(dept) { var s = getAll().staff || []; return dept ? s.filter(function (x) { return x.dept === dept; }) : s; }
  function authStaff(username, password) {
    var s = getAll().staff || [];
    for (var i = 0; i < s.length; i++) {
      if (s[i].username === username && (password == null || s[i].password === password)) return s[i];
    }
    return null;
  }
  function getStaffTasks(dept) { var t = getAll().staffTasks || []; return dept ? t.filter(function (x) { return x.dept === dept; }) : t; }
  function updateStaffTask(id, patch) {
    var all = getAll();
    var list = (all.staffTasks || []).map(function (t) { return t.id === id ? Object.assign({}, t, patch) : t; });
    return save({ staffTasks: list });
  }
  function getStaffReferrals(dept, assignee) {
    var r = getAll().staffReferrals || [];
    return r.filter(function (x) { return (!dept || x.dept === dept) && (!assignee || x.assignee === assignee); });
  }
  function updateStaffReferral(id, patch) {
    var all = getAll();
    var list = (all.staffReferrals || []).map(function (r) { return r.id === id ? Object.assign({}, r, patch) : r; });
    return save({ staffReferrals: list });
  }
  function getWebServiceRequests() { return getAll().webServiceRequests || []; }
  function addWebServiceRequest(rec) {
    var all = getAll();
    var list = (all.webServiceRequests || []).slice();
    list.unshift(rec);
    return save({ webServiceRequests: list });
  }
  function updateWebServiceRequest(id, patch, historyEntry) {
    var all = getAll();
    var list = (all.webServiceRequests || []).map(function (r) {
      if (r.id !== id) return r;
      var next = Object.assign({}, r, patch);
      if (historyEntry) next.history = (r.history || []).concat([historyEntry]);
      return next;
    });
    return save({ webServiceRequests: list });
  }
  function getStaffReports(dept) { var r = getAll().staffReports || []; return dept ? r.filter(function (x) { return x.dept === dept; }) : r; }
  function getStaffNotifs(dept) { var n = getAll().staffNotifs || []; return dept ? n.filter(function (x) { return x.dept === dept; }) : n; }
  function addStaff(rec) {
    var all = getAll();
    var list = all.staff ? all.staff.slice() : [];
    if (rec && rec.id && list.some(function (x) { return x.id === rec.id; })) return;
    list.unshift(rec);
    var notifs = all.staffNotifs ? all.staffNotifs.slice() : [];
    notifs.unshift({ id: 'SN-' + Date.now(), dept: rec.dept, staffId: rec.id, staffName: rec.name,
      text: 'کارمند جدید «' + rec.name + '» (' + (rec.role || 'کارشناس') + ') توسط مدیر IT ایجاد شد.', at: rec.at || 'هم‌اکنون', read: false });
    return save({ staff: list, staffNotifs: notifs });
  }
  function addStaffReport(rec) {
    var all = getAll();
    var list = all.staffReports ? all.staffReports.slice() : [];
    if (rec && rec.id && list.some(function (x) { return x.id === rec.id; })) return;
    list.unshift(rec);
    return save({ staffReports: list });
  }
  function markStaffNotifsRead(dept) {
    var all = getAll();
    var notifs = (all.staffNotifs || []).map(function (n) { return (n.dept === dept) ? Object.assign({}, n, { read: true }) : n; });
    var staff = (all.staff || []).map(function (s) { return (s.dept === dept) ? Object.assign({}, s, { isNew: false }) : s; });
    return save({ staffNotifs: notifs, staff: staff });
  }

  // ── Granular permission catalog (per unit → sections → fine-grained perms) ──
  var PERM_CATALOG = {
    commercial: [
      { section: 'agencies', sectionLabel: 'مدیریت آژانس‌ها', perms: [
        { key: 'ag_list', label: 'مشاهدهٔ فهرست آژانس‌ها' },
        { key: 'ag_requests', label: 'بررسی درخواست عضویت جدید آژانس' },
        { key: 'ag_info', label: 'دسترسی به اطلاعات کامل آژانس' } ] },
      { section: 'flights', sectionLabel: 'مدیریت پروازها', perms: [
        { key: 'fl_view', label: 'مشاهدهٔ پروازها' },
        { key: 'fl_manage', label: 'ویرایش و مدیریت پرواز' } ] },
      { section: 'pricing', sectionLabel: 'نرخ‌گذاری', perms: [
        { key: 'pr_propose', label: 'ثبت نرخ پیشنهادی' } ] },
      { section: 'reports', sectionLabel: 'گزارش‌ها', perms: [
        { key: 'rp_sales', label: 'گزارش فروش' } ] }
    ],
    finance: [
      { section: 'refund', sectionLabel: 'استرداد بلیط', perms: [
        { key: 'rf_list', label: 'مشاهدهٔ درخواست‌های استرداد' },
        { key: 'rf_details', label: 'مشاهدهٔ جزییات کامل مسافر' },
        { key: 'rf_process', label: 'پردازش و ارجاع استرداد' } ] },
      { section: 'agencies', sectionLabel: 'آژانس‌ها', perms: [
        { key: 'ag_settle', label: 'تسویه حساب آژانس‌ها' },
        { key: 'ag_info', label: 'دسترسی به اطلاعات آژانس' } ] },
      { section: 'finance', sectionLabel: 'امور مالی', perms: [
        { key: 'fn_invoices', label: 'مشاهده و مدیریت فاکتورها' } ] },
      { section: 'reports', sectionLabel: 'گزارش‌ها', perms: [
        { key: 'rp_finance', label: 'گزارش مالی' } ] }
    ],
    it: [
      { section: 'users', sectionLabel: 'مدیریت کاربران', perms: [
        { key: 'us_manage', label: 'ایجاد و مدیریت کاربران' } ] },
      { section: 'services', sectionLabel: 'سرویس‌های سایت', perms: [
        { key: 'sv_control', label: 'کنترل و راه‌اندازی سرویس‌ها' } ] },
      { section: 'security', sectionLabel: 'امنیت', perms: [
        { key: 'sc_manage', label: 'مدیریت امنیت و رمزها' } ] },
      { section: 'logs', sectionLabel: 'لاگ و رویدادها', perms: [
        { key: 'lg_view', label: 'مشاهدهٔ لاگ و رویدادها' } ] }
    ]
  };
  var PERM_LABELS = { dashboard: 'داشبورد', cartable: 'کارتابل', referrals: 'ارجاعات' };
  (function () { for (var d in PERM_CATALOG) { PERM_CATALOG[d].forEach(function (g) { g.perms.forEach(function (p) { PERM_LABELS[p.key] = p.label; }); }); } })();
  function getPermCatalog(dept) { return PERM_CATALOG[dept] || PERM_CATALOG.commercial; }
  function permLabel(key) { return PERM_LABELS[key] || key; }
  function permSection(key) { for (var d in PERM_CATALOG) { for (var i = 0; i < PERM_CATALOG[d].length; i++) { var g = PERM_CATALOG[d][i]; for (var j = 0; j < g.perms.length; j++) { if (g.perms[j].key === key) return g.section; } } } return null; }

  window.SiteData = { KEY: KEY, defaults: defaults, getAll: getAll, save: save, reset: reset,
    getCities: getCities, addCity: addCity,
    getFlightClasses: getFlightClasses, saveFlightClasses: saveFlightClasses, addFlightClass: addFlightClass, updateFlightClass: updateFlightClass, deleteFlightClass: deleteFlightClass,
    PERM_CATALOG: PERM_CATALOG, getPermCatalog: getPermCatalog, permLabel: permLabel, permSection: permSection,
    getRefunds: getRefunds, addRefund: addRefund, updateRefund: updateRefund,
    CARD_TIERS: CARD_TIERS, CARD_THRESHOLD: CARD_THRESHOLD, levelForPoints: levelForPoints,
    getClubRules: getClubRules, saveClubRules: saveClubRules, getCardThreshold: getCardThreshold, tiersFromRules: tiersFromRules,
    getClubMembers: getClubMembers, addClubMember: addClubMember, updateClubMember: updateClubMember,
    getCardRequests: getCardRequests, addCardRequest: addCardRequest, updateCardRequest: updateCardRequest,
    getReservations: getReservations, addReservation: addReservation, updateReservation: updateReservation,
    getManagerReports: getManagerReports, addManagerReport: addManagerReport,
    getSurveySettings: getSurveySettings, saveSurveySettings: saveSurveySettings,
    getSurveyResponses: getSurveyResponses, getSurveyFlights: getSurveyFlights,
    getPricingProposals: getPricingProposals, addPricingProposal: addPricingProposal, updatePricingProposal: updatePricingProposal,
    getStaff: getStaff, addStaff: addStaff, getStaffReports: getStaffReports, addStaffReport: addStaffReport,
    authStaff: authStaff, getStaffTasks: getStaffTasks, updateStaffTask: updateStaffTask,
    getStaffReferrals: getStaffReferrals, updateStaffReferral: updateStaffReferral,
    getWebServiceRequests: getWebServiceRequests, addWebServiceRequest: addWebServiceRequest, updateWebServiceRequest: updateWebServiceRequest,
    getStaffNotifs: getStaffNotifs, markStaffNotifsRead: markStaffNotifsRead,
    getAgencyApi: getAgencyApi, updateAgencyApi: updateAgencyApi, addAgencyApi: addAgencyApi, apiForAgency: apiForAgency,
    getCareersSettings: getCareersSettings, toggleCareers: toggleCareers,
    getJobs: getJobs, getActiveJobs: getActiveJobs, getJob: getJob, addJob: addJob, updateJob: updateJob, toggleJob: toggleJob,
    getJobApplications: getJobApplications, addJobApplication: addJobApplication, updateJobApplication: updateJobApplication,
    getFareRules: getFareRules, addFareRule: addFareRule, updateFareRule: updateFareRule, deleteFareRule: deleteFareRule,
    getWebServicePricing: getWebServicePricing, saveWebServicePricing: saveWebServicePricing };
})();

// ── Arabic (العربية) UI layer ─────────────────────────────────────────────
// Pages render their Persian (RTL) variant and pass renderVals output through
// window.arDeep when lang === "ar". Exact-match dictionary; unmatched strings
// fall back to Persian. Extend ARDict to widen coverage.
(function () {
  var D = {
    // nav / header
    'پرواز': 'الطيران', 'مقاصد پروازی': 'الوجهات', 'باشگاه مشتریان': 'نادي العملاء',
    'اطلاعات سفر': 'معلومات السفر', 'پشتیبانی': 'الدعم', 'منو': 'القائمة',
    'ورود / ثبت‌نام': 'تسجيل الدخول / التسجيل', 'ورود': 'تسجيل الدخول', 'ثبت‌نام': 'إنشاء حساب',
    'عضویت در باشگاه': 'الانضمام إلى النادي', 'اعلان‌ها': 'الإشعارات',
    // user menu
    'مشاهده پروفایل': 'عرض الملف الشخصي', 'سفرها و مدیریت رزرو': 'الرحلات وإدارة الحجز',
    'استرداد': 'الاسترداد', 'امتیاز باشگاه': 'نقاط النادي', 'کد همکاری': 'رمز الشراكة',
    'پنل آژانس': 'لوحة الوكالة', 'خروج از حساب': 'تسجيل الخروج',
    'خروج از حساب کاربری': 'تسجيل الخروج من الحساب',
    'آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟': 'هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟',
    'انصراف': 'إلغاء', 'نگار رضایی': 'نيغار رضائي', 'آژانس مسافرتی پارسیان': 'وكالة بارسيان للسفر',
    '🏢 پنل همکاری B2B': '🏢 لوحة شراكة B2B', 'عضو طلایی': 'عضو ذهبي', '★ عضو طلایی': '★ عضو ذهبي',
    // notifications
    'یادآوری سفر': 'تذكير بالرحلة', 'پیشنهاد ویژه': 'عرض خاص',
    'پرواز تهران ← دبی شما فردا است. چک‌این آنلاین باز است.': 'رحلتك من طهران إلى دبي غدًا. تسجيل الوصول عبر الإنترنت متاح.',
    '۴۵۰ امتیاز از خرید اخیر شما به حسابتان اضافه شد.': 'تمت إضافة ٤٥٠ نقطة من عمليتك الأخيرة إلى حسابك.',
    '۱ ساعت پیش': 'قبل ساعة', 'دیروز': 'أمس', 'امروز': 'اليوم', 'هم‌اکنون': 'الآن',
    '۲ روز پیش': 'قبل يومين', 'هفته گذشته': 'الأسبوع الماضي', 'ارسال پاسخ': 'إرسال الرد',
    // search card
    'پرواز داخلی': 'رحلات داخلية', 'پرواز خارجی': 'رحلات دولية',
    'یک‌طرفه': 'ذهاب فقط', 'رفت و برگشت': 'ذهاب وإياب', 'چندمسیره': 'متعدد المدن',
    'مبدا': 'من', 'مقصد': 'إلى', 'انتخاب کنید': 'اختر',
    'شهر مبدا را انتخاب کنید': 'اختر مدينة المغادرة', 'شهر مقصد را انتخاب کنید': 'اختر مدينة الوصول',
    'ابتدا مبدا را انتخاب کنید': 'اختر مدينة المغادرة أولاً',
    'تاریخ رفت': 'تاريخ الذهاب', 'تاریخ برگشت': 'تاريخ العودة',
    'تاریخ رفت را انتخاب کنید': 'اختر تاريخ الذهاب',
    'چه زمانی برمی‌گردید؟': 'متى ستعود؟',
    'مسافران و کلاس پرواز': 'المسافرون والدرجة', 'بزرگسال': 'بالغ', 'کودک': 'طفل', 'نوزاد': 'رضيع',
    'اکونومی': 'اقتصادية', 'بیزنس': 'درجة الأعمال', 'فرست': 'الدرجة الأولى', 'فرست کلاس': 'الدرجة الأولى',
    'جستجوی پرواز': 'البحث عن رحلات', 'جستجو': 'بحث',
    // common actions
    'مشاهده همه': 'عرض الكل', 'بیشتر': 'المزيد', 'رزرو': 'حجز', 'خرید بلیط': 'شراء التذكرة',
    'ادامه': 'متابعة', 'تأیید و ادامه': 'تأكيد ومتابعة', 'بازگشت': 'رجوع',
    'ثبت': 'إرسال', 'ارسال': 'إرسال', 'ذخیره': 'حفظ', 'بستن': 'إغلاق', 'حذف': 'حذف',
    'تومان': 'تومان', 'شروع قیمت از': 'يبدأ السعر من',
    // footer
    'دسترسی سریع': 'روابط سريعة', 'خدمات': 'الخدمات', 'خدمات مشتریان': 'خدمة العملاء',
    'درباره ما': 'من نحن', 'تماس با ما': 'اتصل بنا', 'قوانین و مقررات': 'الشروط والأحكام',
    'سوالات متداول': 'الأسئلة الشائعة', 'فرصت‌های شغلی': 'الوظائف',
    'وضعیت پرواز': 'حالة الرحلة', 'مدیریت رزرو': 'إدارة الحجز', 'استرداد بلیط': 'استرداد التذكرة',
    'چک‌این آنلاین': 'تسجيل الوصول عبر الإنترنت', 'بلیط هواپیما': 'تذاكر الطيران',
    'بیمه مسافرتی': 'تأمين السفر', 'راهنمای خرید': 'دليل الشراء',
    'تمامی حقوق این وب‌سایت متعلق به blujet است.': 'جميع حقوق هذا الموقع محفوظة لـ blujet.',
    // weekdays
    'شنبه': 'السبت', 'یکشنبه': 'الأحد', 'دوشنبه': 'الاثنين', 'سه‌شنبه': 'الثلاثاء',
    'چهارشنبه': 'الأربعاء', 'پنجشنبه': 'الخميس', 'جمعه': 'الجمعة',
    // sections / headings (home)
    'پیشنهادهای ویژه': 'عروض خاصة', 'مقصدهای محبوب': 'الوجهات الشائعة',
    'مسیرهای پرتردد': 'المسارات الأكثر طلبًا', 'چرا blujet؟': 'لماذا blujet؟',
    'پشتیبانی ۲۴/۷': 'دعم ٢٤/٧', 'بهترین قیمت': 'أفضل الأسعار', 'استرداد آسان': 'استرداد سهل',
    'پرداخت امن': 'دفع آمن',
    // user panel
    'خریدهای من': 'مشترياتي', 'کیف پول': 'المحفظة', 'پروفایل': 'الملف الشخصي',
    'سفرهای من': 'رحلاتي', 'داشبورد': 'لوحة التحكم', 'تراکنش‌ها': 'المعاملات',
    'شارژ کیف پول': 'شحن المحفظة', 'موجودی کیف پول': 'رصيد المحفظة',
    'اطلاعات حساب': 'معلومات الحساب', 'مسافران همراه': 'المسافرون المرافقون',
    'افزودن مسافر': 'إضافة مسافر', 'ویرایش': 'تعديل',
    // agency panel
    'داشبورد آژانس': 'لوحة الوكالة', 'صندلی‌های تخصیص‌یافته': 'المقاعد المخصصة',
    'وب‌سرویس': 'خدمة الويب', 'اعتبار و مانده حساب': 'الرصيد والائتمان',
    'گزارش فروش': 'تقرير المبيعات', 'پیام‌ها': 'الرسائل', 'فاکتورها': 'الفواتير',
    'پروفایل آژانس': 'ملف الوكالة', 'پیام جدید': 'رسالة جديدة', 'شارژ اعتبار': 'شحن الرصيد',
    'فروش امروز': 'مبيعات اليوم', 'فروش این ماه': 'مبيعات هذا الشهر',
    // agency panel — tabs/subs/nav
    'صندلی‌های تخصیصی': 'المقاعد المخصصة', 'وب سرویس': 'خدمة الويب', 'مستندات وب‌سرویس': 'وثائق خدمة الويب',
    'اعتبار و موجودی': 'الرصيد والائتمان', 'فروش و گزارش‌ها': 'المبيعات والتقارير',
    'صندوق پیام‌ها': 'صندوق الرسائل', 'پروفایل و مدارک': 'الملف والمستندات',
    'نمای کلی فروش، اعتبار و صندلی‌های شما': 'نظرة عامة على مبيعاتك ورصيدك ومقاعدك',
    'ظرفیت تخصیص‌یافته بر اساس تقاضا برای پروازهای مجاز': 'السعة المخصصة بحسب الطلب للرحلات المرخصة',
    'درخواست و دریافت وب‌سرویس اختصاصی آژانس شما': 'اطلب واحصل على واجهة برمجية مخصصة لوكالتك',
    'راهنمای یکپارچه‌سازی با اینترفیس رزرو آژانس': 'دليل الربط مع واجهة حجز الوكالة',
    'سقف اعتبار، فاکتورهای شرکت هواپیمایی و فعالیت حساب': 'سقف الرصيد وفواتير شركة الطيران ونشاط الحساب',
    'عملکرد فروش و گزارش‌های آژانس': 'أداء مبيعات الوكالة وتقاريرها',
    'پیام‌های مدیریت شرکت هواپیمایی': 'رسائل إدارة شركة الطيران',
    'اطلاعات آژانس و مدارک ثبت‌شده': 'معلومات الوكالة والمستندات المسجّلة',
    'اعتبار باقیمانده': 'الرصيد المتبقي', 'صندلی تخصیص‌یافته': 'المقاعد المخصصة', 'صندلی فروخته‌شده': 'المقاعد المباعة',
    'مانده قابل استفاده': 'الرصيد المتاح استخدامه',
    'روند فروش آژانس': 'اتجاه مبيعات الوكالة', 'مصرف‌شده:': 'المستخدم:',
    // agency profile & documents
    'مدیرعامل': 'المدير التنفيذي', 'شماره مجوز': 'رقم الترخيص', 'شهر': 'المدينة', 'تلفن': 'الهاتف',
    'نوع همکاری': 'نوع الشراكة', 'آژانس همکار طلایی': 'وكالة شريكة ذهبية', 'مدارک آژانس': 'مستندات الوكالة',
    'مدارک آژانس': 'مستندات الوكالة', 'بارگذاری مدرک جدید': 'رفع مستند جديد',
    'مجوز نوع ب': 'ترخيص نوع ب', 'جواز کسب': 'رخصة عمل', 'کارت ملی مدیرعامل': 'الهوية الوطنية للمدير التنفيذي',
    'تأیید شده': 'مؤكَّد', 'در حال بررسی': 'قيد المراجعة', 'مدارک آژانس': 'مستندات الوكالة', 'بارگذاری مدرک جدید': 'رفع مستند جديد',
    // agency messages inbox
    'مدیر تجاری': 'المدير التجاري', 'مدیر مالی': 'المدير المالي', 'ادمین سایت': 'مسؤول الموقع',
    'قیمت‌گذاری': 'التسعير', 'مالی': 'مالي', 'اطلاعیه': 'إشعار', 'قدردانی': 'تقدير',
    'به‌روزرسانی کرایه مسیر دبی': 'تحديث أجرة مسار دبي',
    'همکار گرامی،\nکرایه پروازهای تهران–دبی برای هفته آینده به‌روزرسانی شده است. لطفاً پیش از صدور بلیط، نرخ‌های جدید را در سیستم بررسی کنید.\nبا احترام':
      'زميلنا العزيز،\nتم تحديث أجرة رحلات طهران–دبي للأسبوع القادم. يرجى مراجعة الأسعار الجديدة في النظام قبل إصدار التذاكر.\nمع التحية',
    'تسویه صورت‌حساب دوره‌ای': 'تسوية الفاتورة الدورية',
    'مهلت تسویه صورت‌حساب دوره جاری تا پایان همین هفته است. مانده بدهی شما ۴۹۰,۰۰۰,۰۰۰ تومان می‌باشد.':
      'مهلة تسوية الفاتورة الحالية حتى نهاية هذا الأسبوع. رصيد مديونيتك ٤٩٠,٠٠٠,٠٠٠ تومان.',
    'افزایش ظرفیت تخصیصی': 'زيادة السعة المخصصة',
    'ظرفیت تخصیص‌یافته به آژانس شما برای مسیر مشهد افزایش یافت. اکنون می‌توانید صندلی بیشتری صادر کنید.':
      'ازدادت السعة المخصصة لوكالتكم لمسار مشهد. يمكنكم الآن إصدار مقاعد أكثر.',
    'قدردانی از عملکرد فروش': 'تقدير للأداء البيعي',
    'از تلاش‌های تیم شما برای رشد فروش در سه‌ماهه گذشته صمیمانه سپاسگزاریم. منتظر ادامه همکاری هستیم.':
      'نشكركم بصدق على جهود فريقكم في نمو المبيعات خلال الربع الماضي. نتطلع لاستمرار التعاون.',
    // credit / invoices
    'فاکتورهای صادرشده توسط ایرلاین': 'الفواتير الصادرة عن شركة الطيران', 'فاکتور در انتظار پرداخت': 'فاتورة في انتظار الدفع',
    'صدور': 'الإصدار', 'سررسید': 'الاستحقاق', 'پرداخت از اعتبار': 'الدفع من الرصيد', 'پرداخت‌شده': 'مدفوعة',
    'گردش حساب اخیر': 'حركة الحساب الأخيرة', 'در انتظار پرداخت': 'في انتظار الدفع', 'سررسید گذشته': 'متأخرة الاستحقاق',
    'افزایش اعتبار حساب': 'شحن رصيد الحساب', 'واریز به کیف پول آژانس': 'إيداع في محفظة الوكالة',
    'افزایش اعتبار توسط مدیریت': 'شحن رصيد بواسطة الإدارة', 'تسویه نقدی': 'تسوية نقدية',
    'پرداخت فاکتور — ۸ صندلی، مسیر دبی': 'دفع فاتورة — ٨ مقاعد، مسار دبي',
    'پرداخت فاکتور — ۵ صندلی، مسیر مشهد': 'دفع فاتورة — ٥ مقاعد، مسار مشهد',
    'پرداخت فاکتور — ۳ صندلی، مسیر استانبول': 'دفع فاتورة — ٣ مقاعد، مسار إسطنبول',
    'تخصیص ۳۰ صندلی — پرواز EP-821 (تهران → دبی)': 'تخصيص ٣٠ مقعدًا — رحلة EP-821 (طهران → دبي)',
    'تخصیص ۲۰ صندلی — پرواز W5-112 (مشهد → تهران)': 'تخصيص ٢٠ مقعدًا — رحلة W5-112 (مشهد → طهران)',
    'تخصیص ۲۵ صندلی — پرواز EP-640 (تهران → استانبول)': 'تخصيص ٢٥ مقعدًا — رحلة EP-640 (طهران → إسطنبول)',
    // allocated seats
    'تقاضای شما': 'طلبك', 'تخصیص‌یافته': 'مخصص', 'باقیمانده': 'المتبقي', 'مجوز پرواز صادر شد': 'صدر ترخيص الرحلة', 'فروخته‌شده': 'مباعة',
    'مشهد → تهران': 'مشهد → طهران', 'تهران → استانبول': 'طهران → إسطنبول', 'شیراز → تهران': 'شيراز → طهران',
    'صندلی‌های تخصیص‌یافته توسط ایرلاین بر اساس تقاضای آژانس شما، برای پروازهایی که مجوز پروازی آن‌ها صادر شده است. این ظرفیت برای فروش در اختیار شماست.':
      'المقاعد المخصصة من شركة الطيران بحسب طلب وكالتكم، للرحلات الصادر لها ترخيص طيران. هذه السعة متاحة لكم للبيع.',
    // sales report
    'جمع فروش': 'إجمالي المبيعات', 'فروش هر پرواز': 'مبيعات كل رحلة', 'وب‌سرویس‌های خریداری‌شده': 'خدمات الويب المشتراة',
    'فاکتورهای پرداخت‌نشده': 'الفواتير غير المدفوعة', 'مشاهده بلیط‌های صادرشده': 'عرض التذاكر الصادرة',
    'فروش به تفکیک مسیر': 'المبيعات حسب المسار', 'پلن‌های خریداری‌شده': 'الخطط المشتراة',
    'در انتظار پرداخت از اعتبار': 'بانتظار الدفع من الرصيد', 'مسیر فعال': 'مسار نشط', 'سرویس': 'خدمة', 'فاکتور': 'فاتورة',
    'گزارش فعالیت مالی': 'تقرير النشاط المالي', 'پرداخت فاکتورها و افزایش اعتبار': 'دفع الفواتير وشحن الرصيد',
    'جمع فروش — بلیط‌های صادرشده': 'إجمالي المبيعات — التذاكر الصادرة', 'فروش هر پرواز — به تفکیک مسیر': 'مبيعات كل رحلة — حسب المسار',
    'بازگشت به گزارش فروش': 'العودة إلى تقرير المبيعات', 'خروجی Excel': 'تصدير Excel', 'در حال آماده‌سازی خروجی اکسل…': 'جارٍ تجهيز تصدير إكسل…',
    'مسافر': 'المسافر', 'مسیر': 'المسار', 'تاریخ': 'التاريخ', 'کلاس': 'الدرجة', 'مبلغ': 'المبلغ',
    'مسیر پرواز': 'مسار الرحلة', 'تعداد بلیط': 'عدد التذاكر', 'مبلغ فروش': 'مبلغ المبيعات', 'بلیط': 'تذكرة',
    'هنوز وب‌سرویسی خریداری نشده است.': 'لم تُشترَ أي خدمة ويب بعد.',
    '✓ همهٔ فاکتورها پرداخت شده‌اند.': '✓ جميع الفواتير مدفوعة.',
    'میانگین کرایه': 'متوسط الأجرة', 'نرخ استرداد': 'نسبة الاسترداد', 'بلیط صادرشده': 'تذاكر صادرة',
    // web service purchase & docs
    'خرید وب‌سرویس جدید': 'شراء خدمة ويب جديدة', 'پلن مورد نظر را انتخاب و خریداری کنید تا درخواست برای ادمین ارسال شود.': 'اختر الخطة المطلوبة واشترها ليُرسل الطلب إلى المسؤول.',
    'نوع وب‌سرویس': 'نوع خدمة الويب', 'مدت اشتراک': 'مدة الاشتراك', 'توضیحات درخواست': 'ملاحظات الطلب',
    'کاربرد مورد نظر و سیستم متصل‌شونده را توضیح دهید…': 'صف الاستخدام المطلوب والنظام المتصل…',
    'مبلغ قابل پرداخت': 'المبلغ المستحق', 'خرید و ثبت درخواست': 'الشراء وإرسال الطلب',
    'درخواست‌های خرید من': 'طلبات الشراء الخاصة بي', 'هنوز درخواست خریدی ثبت نکرده‌اید.': 'لم تقدّم أي طلب شراء بعد.',
    'جستجو و رزرو پرواز (API)': 'بحث وحجز رحلات (API)', 'استعلام صندلی و اعتبار (API)': 'استعلام المقاعد والرصيد (API)',
    'استعلام اعتبار و فاکتور (API)': 'استعلام الرصيد والفاتورة (API)', 'فید گزارش فروش (API)': 'موجز تقرير المبيعات (API)',
    'شش‌ماهه': 'نصف سنوي', 'یک‌ساله': 'سنوي', 'دوساله': 'سنتان',
    'اتصال فعال وب‌سرویس': 'اتصال خدمة الويب النشط', 'آدرس پایه (Base URL)': 'العنوان الأساسي (Base URL)',
    'کلید دسترسی (API Key)': 'مفتاح الوصول (API Key)', 'نمایش': 'إظهار', 'کپی': 'نسخ', 'کلید وب‌سرویس کپی شد': 'تم نسخ مفتاح خدمة الويب',
    'مشاهده مستندات API': 'عرض وثائق API', 'درخواست خرید شما در حال بررسی است': 'طلب الشراء الخاص بك قيد المراجعة',
    'پس از تأیید توسط ادمین و مدیران مربوطه، وب‌سرویس فعال و کلید دسترسی نمایش داده می‌شود.': 'بعد موافقة المسؤول والمديرين المعنيين، تُفعَّل خدمة الويب ويُعرض مفتاح الوصول.',
    'در انتظار تأیید': 'بانتظار الموافقة', 'دسترسی اختصاصی API آژانس شما': 'وصول API مخصص لوكالتك',
    'تأییدشده · فعال': 'مؤكَّد · نشط', 'ارجاع‌شده': 'محال', 'رد شده': 'مرفوض',
    'برای استفاده از وب‌سرویس ابتدا باید یک پلن خریداری کنید؛ درخواست شما برای ادمین ارسال می‌شود و پس از بررسی و تأیید، کلید دسترسی و مستندات API فعال و نمایش داده می‌شود.':
      'لاستخدام خدمة الويب يجب أولًا شراء خطة؛ يُرسل طلبك إلى المسؤول، وبعد المراجعة والموافقة يُفعَّل مفتاح الوصول ووثائق API وتُعرض.',
    // top-up modal
    'افزایش اعتبار حساب': 'شحن رصيد الحساب',
    'مبلغ مورد نظر برای افزایش اعتبار را وارد کنید. پس از تأیید، اعتبار به کیف پول آژانس افزوده و تراکنش در «گزارش فعالیت مالی» ثبت می‌شود.':
      'أدخل المبلغ المطلوب لشحن الرصيد. بعد التأكيد، يُضاف الرصيد إلى محفظة الوكالة ويُسجَّل في «تقرير النشاط المالي».',
    'مبلغ (تومان)': 'المبلغ (تومان)', 'مبلغ افزایش اعتبار باید حداقل ۱٬۰۰۰٬۰۰۰ تومان باشد': 'يجب ألا يقل مبلغ شحن الرصيد عن ١٬٠٠٠٬٠٠٠ تومان',
    // compose modal
    'پیام جدید به مدیریت': 'رسالة جديدة إلى الإدارة', 'گیرنده': 'المستلم', 'انتخاب گیرنده…': 'اختر المستلم…',
    'موضوع پیام': 'موضوع الرسالة', 'متن پیام خود را بنویسید…': 'اكتب نص رسالتك…',
    'لطفاً گیرنده، موضوع و متن پیام را کامل کنید.': 'يرجى إكمال المستلم والموضوع ونص الرسالة.',
    // API docs
    'معرفی': 'مقدمة', 'احراز هویت': 'المصادقة', 'متدها (Endpoints)': 'نقاط النهاية (Endpoints)',
    'کدهای خطا': 'رموز الأخطاء', 'تاریخچه نسخه‌ها': 'سجل الإصدارات', 'توکن': 'الرمز المميز',
    'وب‌سرویس رزرو آژانس': 'خدمة حجز الوكالة', 'آدرس پایه': 'العنوان الأساسي', 'قالب داده': 'صيغة البيانات',
    'محدودیت نرخ درخواست': 'حد معدل الطلبات', 'احراز هویت درخواست‌ها': 'مصادقة الطلبات',
    'درخواست': 'الطلب', 'پاسخ': 'الاستجابة',
    'این وب‌سرویس REST به سیستم شما امکان می‌دهد بدون استفاده از رابط پنل آژانس، مستقیماً پرواز جست‌وجو کند، رزرو بسازد، بلیت صادر کند و لغو/استرداد را مدیریت کند.':
      'تتيح واجهة REST هذه لنظامكم البحث عن الرحلات وإنشاء الحجوزات وإصدار التذاكر وإدارة الإلغاء/الاسترداد مباشرة، دون استخدام واجهة لوحة الوكالة.',
    'همه درخواست‌ها و پاسخ‌ها با فرمت JSON (UTF-8) هستند.': 'جميع الطلبات والاستجابات بصيغة JSON (UTF-8).',
    '۶۰ درخواست در دقیقه به ازای هر کلید API. عبور از این حد، خطای HTTP 429 برمی‌گرداند.': '٦٠ طلبًا في الدقيقة لكل مفتاح API. تجاوز هذا الحد يُرجع خطأ HTTP 429.',
    'کلید API آژانس خود را به‌صورت Bearer token در هدر Authorization هر درخواست ارسال کنید.': 'أرسل مفتاح API الخاص بوكالتك كرمز Bearer في ترويسة Authorization لكل طلب.',
    'کلید API شما پس از تأیید و فعال‌شدن پلن، در تب «وب سرویس» در دسترس است.': 'يتوفر مفتاح API الخاص بك في تبويب «خدمة الويب» بعد الموافقة على الخطة وتفعيلها.',
    'همه مسیرهای زیر نسبت به آدرس پایه ذکرشده در بخش «معرفی» هستند.': 'جميع المسارات أدناه نسبية إلى العنوان الأساسي المذكور في قسم «مقدمة».',
    'در صورت خطا، بدنه پاسخ شامل یک شیء "error" با همین کد است.': 'عند حدوث خطأ، يتضمن جسم الاستجابة كائن "error" بنفس الرمز.',
    'پرواز': 'رحلة', 'مالی': 'مالي',
    'عدم احراز هویت': 'عدم مصادقة', 'کلید API ارسال نشده یا نامعتبر است.': 'مفتاح API غير مُرسَل أو غير صالح.',
    'دسترسی مجاز نیست': 'الوصول غير مسموح', 'پلن وب‌سرویس غیرفعال یا معلق شده است.': 'خطة خدمة الويب غير مفعّلة أو موقوفة.',
    'یافت نشد': 'غير موجود', 'پرواز یا رزرو (PNR) مورد نظر پیدا نشد.': 'لم يتم العثور على الرحلة أو الحجز (PNR) المطلوب.',
    'تداخل': 'تعارض', 'صندلی با قیمت اعلام‌شده دیگر موجود نیست.': 'المقعد لم يعد متوفرًا بالسعر المعلن.',
    'خطای اعتبارسنجی': 'خطأ تحقق', 'یک یا چند فیلد درخواست نامعتبر است.': 'حقل واحد أو أكثر من حقول الطلب غير صالح.',
    'تعداد درخواست بیش از حد': 'عدد الطلبات يتجاوز الحد', 'محدودیت نرخ درخواست رد شده — به بخش معرفی مراجعه کنید.': 'تم رفض الطلب لتجاوز حد المعدل — راجع قسم المقدمة.',
    'دریافت توکن دسترسی با نام کاربری و رمز عبور آژانس. این توکن را در تمام درخواست‌های بعدی به‌صورت هدر Bearer ارسال کنید.':
      'احصل على رمز وصول باستخدام اسم مستخدم وكلمة مرور الوكالة. أرسل هذا الرمز كترويسة Bearer في كل الطلبات اللاحقة.',
    'دریافت برنامه پروازی (تایم‌تیبل) بین مبدأ و مقصد برای یک بازه تاریخ.': 'احصل على جدول الرحلات بين نقطتي المغادرة والوصول لفترة تاريخ معينة.',
    'جست‌وجوی پروازها و نرخ‌های موجود برای یک تاریخ سفر مشخص.': 'ابحث عن الرحلات المتاحة وأسعارها لتاريخ سفر محدد.',
    'اعتبارسنجی نهایی قیمت و خدمات قابل‌ارائه برای پرواز انتخاب‌شده پیش از رزرو.': 'تحقق نهائي من السعر والخدمات المتاحة للرحلة المختارة قبل الحجز.',
    'ایجاد رزرو (PNR) برای پرواز قیمت‌گذاری‌شده همراه با اطلاعات مسافران.': 'أنشئ حجزًا (PNR) للرحلة المسعّرة مع بيانات المسافرين.',
    'تأیید و نهایی‌سازی رزرو و کسر مبلغ بلیت از اعتبار آژانس.': 'أكّد وأنهِ الحجز مع خصم قيمة التذكرة من رصيد الوكالة.',
    'درخواست صدور بلیت برای رزرو تأییدشده.': 'اطلب إصدار التذكرة لحجز مؤكَّد.',
    'دریافت جزئیات کامل بلیت و وضعیت فعلی آن بر اساس PNR یا شماره بلیت.': 'احصل على تفاصيل التذكرة الكاملة وحالتها الحالية عبر PNR أو رقم التذكرة.',
    'دریافت قوانین نرخی (شرایط تغییر/استرداد) یک پرواز بر اساس شماره مرجع.': 'احصل على قواعد السعر (شروط التغيير/الاسترداد) لرحلة عبر رقم المرجع.',
    'لغو یک یا چند بلیت از یک رزرو و شروع فرآیند صدور واچر استرداد.': 'ألغِ تذكرة واحدة أو أكثر من حجز وابدأ عملية إصدار قسيمة استرداد.',
    'پیگیری وضعیت یک درخواست لغو/استرداد ثبت‌شده قبلی.': 'تابع حالة طلب إلغاء/استرداد سابق.',
    'دریافت موجودی و سقف اعتبار فعلی آژانس شما.': 'احصل على الرصيد الحالي وسقف اعتماد وكالتك.',
    // booking / results
    'بدون توقف': 'بدون توقف', 'یک توقف': 'توقف واحد', 'فیلترها': 'الفلاتر',
    'ارزان‌ترین': 'الأرخص', 'سریع‌ترین': 'الأسرع', 'زودترین': 'الأبكر',
    'نتایج پرواز': 'نتائج الرحلات', 'جزئیات پرواز': 'تفاصيل الرحلة',
    'قوانین استرداد': 'قواعد الاسترداد', 'بار مجاز': 'الأمتعة المسموح بها',
    'انتخاب صندلی': 'اختيار المقعد', 'وعده غذایی': 'وجبة الطعام',
    'شماره پرواز': 'رقم الرحلة', 'کلاس نرخی': 'درجة السعر',
    'مشخصات مسافر': 'بيانات المسافر', 'نام': 'الاسم', 'نام خانوادگی': 'اسم العائلة',
    'کد ملی': 'رقم الهوية', 'شماره تماس': 'رقم الهاتف', 'ایمیل': 'البريد الإلكتروني',
    'تاریخ تولد': 'تاريخ الميلاد', 'جنسیت': 'الجنس', 'مرد': 'ذكر', 'زن': 'أنثى',
    'پرداخت': 'الدفع', 'جزئیات پرداخت': 'تفاصيل الدفع', 'مبلغ قابل پرداخت': 'المبلغ المستحق',
    'تخفیف': 'الخصم', 'مالیات و عوارض': 'الضرائب والرسوم', 'قیمت پایه': 'السعر الأساسي',
    // support / contact
    'سوالی دارید؟': 'هل لديك سؤال؟', 'ارسال پیام': 'إرسال رسالة', 'موضوع': 'الموضوع',
    'متن پیام': 'نص الرسالة', 'تلفن پشتیبانی': 'هاتف الدعم', 'آدرس': 'العنوان',
    'ساعات پاسخگویی': 'ساعات العمل',
    // home page
    'اطلاعیه مهم: برخی پروازهای امروز به‌دلیل شرایط جوی با تأخیر انجام می‌شوند — آخرین وضعیت پروازها را بررسی کنید': 'إشعار هام: قد تتأخر بعض رحلات اليوم بسبب الأحوال الجوية — تحقق من آخر حالة للرحلات',
    'در هر پرواز تا ۵٥ کش‌بک بگیرید': 'احصل على استرداد نقدي حتى ٥٪ في كل رحلة',
    'در هر پرواز تا ۵٪ کش‌بک بگیرید': 'احصل على استرداد نقدي حتى ٥٪ في كل رحلة',
    'پرواز بعدی‌ات را با blujet رزرو کن': 'احجز رحلتك القادمة مع blujet',
    'بیش از ۲۰۰ مقصد داخلی و بین‌المللی، با بهترین قیمت، پشتیبانی شبانه‌روزی و امتیاز در هر سفر.': 'أكثر من ٢٠٠ وجهة داخلية ودولية بأفضل الأسعار، مع دعم على مدار الساعة ونقاط في كل رحلة.',
    'مشاهده پیشنهادهای ویژه': 'عرض العروض الخاصة',
    'رزرو پرواز': 'حجز رحلة',
    'مسافران و کلاس': 'المسافرون والدرجة',
    'نوع پرواز:': 'نوع الرحلة:',
    'ارزان‌ترین نرخ در پرطرفدارترین مسیرها': 'أرخص الأسعار على أكثر المسارات طلبًا',
    'دبی': 'دبي', 'کیش': 'كيش', 'شیراز': 'شيراز', 'تهران': 'طهران',
    'استانبول': 'إسطنبول', 'تبریز': 'تبريز', 'اصفهان': 'أصفهان', 'تفلیس': 'تبليسي',
    'ترکیه': 'تركيا', 'ایران': 'إيران',
    'خرید بار اضافه': 'شراء أمتعة إضافية',
    'تغییر و استرداد بلیط': 'تغيير واسترداد التذكرة',
    'استعلام وضعیت پرواز': 'الاستعلام عن حالة الرحلة',
    'تخفیف‌های مدت‌دار روی پرطرفدارترین مسیرها — تا اتمام ظرفیت': 'خصومات لفترة محدودة على أكثر المسارات طلبًا — حتى نفاد المقاعد',
    'مشاهده همه پیشنهادها': 'عرض كل العروض',
    '[ عکس استانبول ]': '[ صورة إسطنبول ]', '[ عکس دبی ]': '[ صورة دبي ]',
    '[ عکس کیش ]': '[ صورة كيش ]', '[ عکس مشهد ]': '[ صورة مشهد ]',
    '[ موکاپ اپلیکیشن ]': '[ نموذج التطبيق ]',
    'تا ۴۰٪ تخفیف روی پروازهای خارجی': 'خصم حتى ٤٠٪ على الرحلات الدولية',
    'رزرو تا پایان مرداد برای سفرهای تابستان — صندلی‌ها محدودند، فرصت را از دست نده.': 'احجز قبل نهاية الموسم لرحلات الصيف — المقاعد محدودة، لا تفوّت الفرصة.',
    'مشاهده پروازها': 'عرض الرحلات',
    'پرطرفدارترین پروازها با بهترین قیمت': 'أكثر الرحلات طلبًا بأفضل الأسعار',
    'کارت عضویت باشگاه': 'بطاقة عضوية النادي',
    'با رسیدن به حد امتیاز، کارت عضویت بگیر': 'احصل على بطاقة العضوية عند بلوغ حد النقاط',
    'از ۵٬۰۰۰ امتیاز واجد شرایط دریافت کارت می‌شوی؛ درخواست برای ادمین ارسال و پس از تأیید مدیران، کارت برایت صادر می‌شود.': 'عند بلوغ ٥٬٠٠٠ نقطة تصبح مؤهلاً للحصول على البطاقة؛ يُرسل الطلب إلى الإدارة وتُصدر بطاقتك بعد الموافقة.',
    'مشاهده شرایط و سطوح': 'عرض الشروط والمستويات',
    'امارات': 'الإمارات', 'ایران': 'إيران', 'نقره‌ای': 'فضي', 'طلایی': 'ذهبي', 'پلاتین': 'بلاتيني',
    '۰ تا ۵٬۰۰۰ امتیاز': 'من ٠ إلى ٥٬٠٠٠ نقطة', 'بالای ۱۵٬۰۰۰': 'أكثر من ١٥٬٠٠٠',
    'اپلیکیشن blujet': 'تطبيق blujet',
    'رزرو سریع‌تر، مدیریت بلیط، کارت پرواز دیجیتال و دریافت آخرین تخفیف‌ها — همه در اپلیکیشن موبایل.': 'حجز أسرع، إدارة التذاكر، بطاقة صعود رقمية وأحدث الخصومات — كل ذلك في تطبيق الهاتف.',
    'بازار / مایکت': 'بازار / مايكت',
    'رزرو آنلاین بلیط پروازهای داخلی و بین‌المللی با بهترین قیمت و خدمات باشگاه مشتریان.': 'حجز تذاكر الطيران الداخلية والدولية عبر الإنترنت بأفضل الأسعار مع خدمات نادي العملاء.',
    'رزرو آنلاین بلیط پروازهای داخلی و بین‌المللی با بهترین قیمت و امتیازهای باشگاه مشتریان.': 'حجز تذاكر الطيران الداخلية والدولية عبر الإنترنت بأفضل الأسعار ومزايا نادي العملاء.',
    'نماد اعتماد الکترونیکی': 'شعار الثقة الإلكترونية',
    'انجمن صنفی دفاتر خدمات مسافرتی': 'نقابة مكاتب خدمات السفر',
    'ساماندهی': 'ساماندهي', 'شرکت': 'الشركة', 'مرکز راهنما': 'مركز المساعدة',
    '© ۱۴۰۵ bluejet. تمامی حقوق محفوظ است.': '© 2026 bluejet. جميع الحقوق محفوظة.',
    '© ۱۴۰۵ blujet. تمامی حقوق محفوظ است.': '© 2026 blujet. جميع الحقوق محفوظة.',
    // destinations page
    'شبکه پروازی blujet · ۱۲ مقصد فعال': 'شبكة رحلات blujet · ١٢ وجهة نشطة',
    'مقصد بعدی شما کجاست؟': 'ما هي وجهتك القادمة؟',
    'از پروازهای روزانه داخلی تا مسیرهای مستقیم بین‌المللی — جستجو کنید و مستقیم به رزرو بروید.': 'من الرحلات الداخلية اليومية إلى المسارات الدولية المباشرة — ابحث وانتقل مباشرة إلى الحجز.',
    'پروازهای داخلی': 'الرحلات الداخلية', 'پروازهای خارجی': 'الرحلات الدولية',
    'با کلیک روی هر مقصد، مستقیم به نتایج پرواز همان مسیر می‌روید': 'بالنقر على أي وجهة تنتقل مباشرة إلى نتائج رحلات ذلك المسار',
    'پرفروش این فصل': 'الأكثر مبيعًا هذا الموسم', 'داخلی': 'داخلي', 'بین‌المللی': 'دولي',
    'پرواز مستقیم': 'رحلة مباشرة',
    'پوشش پروازی داخلی': 'تغطية الرحلات الداخلية',
    'از هر جای ایران،': 'من أي مكان في إيران،', 'به هر جای ایران': 'إلى أي مكان في إيران',
    '۸ فرودگاه داخلی با پروازهای روزانه به هم متصل‌اند. روی هر شهر نقشه کلیک کنید تا مقاصد همان شهر را ببینید.': 'ثمانية مطارات داخلية مترابطة برحلات يومية. انقر على أي مدينة في الخريطة لعرض وجهاتها.',
    'فرودگاه داخلی': 'مطار داخلي', 'مقصد بین‌المللی': 'وجهة دولية',
    // flight results
    'انتخاب پرواز رفت': 'اختيار رحلة الذهاب',
    'ویرایش جستجو': 'تعديل البحث', 'رادار هوشمند قیمت': 'رادار الأسعار الذكي',
    'همین حالا بخرم یا صبر کنم؟': 'أشتري الآن أم أنتظر؟', 'تحلیل قیمت': 'تحليل السعر',
    'زودترین پرواز': 'أبكر رحلة', 'فیلتر': 'فلترة', 'همه ایرلاین‌ها': 'كل شركات الطيران',
    'جزئیات و رزرو': 'التفاصيل والحجز', 'قبلی': 'السابق', 'بعدی': 'التالي',
    // checkout flow
    'خدمات جانبی': 'الخدمات الإضافية', 'بازبینی': 'المراجعة',
    'وارد کردن اطلاعات مسافر': 'إدخال بيانات المسافر',
    'گذرنامه': 'جواز السفر', 'اسکن مدرک': 'مسح المستند',
    'از مسافران ذخیره‌شده': 'من المسافرين المحفوظين', 'افزودن مسافر جدید': 'إضافة مسافر جديد',
    'فروردین': 'فروردين', 'اردیبهشت': 'أرديبهشت', 'خرداد': 'خرداد', 'تیر': 'تير',
    'مرداد': 'مرداد', 'شهریور': 'شهريور', 'مهر': 'مهر', 'آبان': 'آبان', 'آذر': 'آذر',
    'دی': 'دي', 'بهمن': 'بهمن', 'اسفند': 'إسفند',
    'قیمت بلیط': 'سعر التذكرة', 'پرداخت امن و رمزگذاری‌شده': 'دفع آمن ومشفّر',
    'با کلیک روی «ادامه»، شما با': 'بالنقر على «متابعة»، فإنك توافق على',
    'قوانین سایت': 'شروط الموقع', 'و قوانین نرخ ایرلاین موافقت می‌کنید.': 'وقواعد أسعار شركة الطيران.',
    // user panel
    'عضو جدید باشگاه': 'عضو جديد في النادي', 'پروفایل من': 'ملفي الشخصي',
    'سفرها و خریدها': 'الرحلات والمشتريات', 'کیف پول و امتیاز': 'المحفظة والنقاط',
    'پیام به پشتیبانی': 'رسالة إلى الدعم', 'سفرها و خریدهای من': 'رحلاتي ومشترياتي',
    'تاریخچه بلیط‌های خریداری‌شده شما': 'سجل التذاكر التي اشتريتها',
    'اطلاعات پروازی موجود نیست': 'لا توجد معلومات رحلات',
    'هنوز بلیطی خریداری نکرده‌اید — رزرو اولین پرواز خود را همین حالا انجام دهید.': 'لم تشترِ أي تذكرة بعد — احجز رحلتك الأولى الآن.',
    // agency panel
    // cities & airports
    'اهواز': 'الأهواز', 'بندرعباس': 'بندر عباس', 'یزد': 'يزد', 'کرمان': 'كرمان',
    'ساری': 'ساري', 'ارومیه': 'أرومية', 'کرمانشاه': 'كرمانشاه', 'عسلویه': 'عسلوية',
    'گرگان': 'جرجان', 'اردبیل': 'أردبيل', 'نجف': 'النجف',
    'فرودگاه مهرآباد / امام': 'مطار مهرآباد / الإمام', 'فرودگاه شهید هاشمی‌نژاد': 'مطار الشهيد هاشمي نجاد',
    'فرودگاه بین‌المللی کیش': 'مطار كيش الدولي', 'فرودگاه شهید دستغیب': 'مطار الشهيد دستغيب',
    'فرودگاه شهید بهشتی': 'مطار الشهيد بهشتي', 'فرودگاه شهید مدنی': 'مطار الشهيد مدني',
    'فرودگاه بین‌المللی اهواز': 'مطار الأهواز الدولي', 'فرودگاه بین‌المللی قشم': 'مطار قشم الدولي',
    'فرودگاه بین‌المللی بندرعباس': 'مطار بندر عباس الدولي', 'فرودگاه شهید صدوقی': 'مطار الشهيد صدوقي',
    'فرودگاه آیت‌الله هاشمی رفسنجانی': 'مطار آية الله هاشمي رفسنجاني', 'فرودگاه سردار جنگل': 'مطار سردار جنگل',
    'فرودگاه دشت ناز': 'مطار دشت ناز', 'فرودگاه شهید باکری': 'مطار الشهيد باكري',
    'فرودگاه بین‌المللی زاهدان': 'مطار زاهدان الدولي', 'فرودگاه شهید اشرفی اصفهانی': 'مطار الشهيد أشرفي أصفهاني',
    'فرودگاه بوشهر': 'مطار بوشهر', 'فرودگاه خلیج فارس': 'مطار الخليج الفارسي',
    'فرودگاه گرگان': 'مطار جرجان', 'فرودگاه اردبیل': 'مطار أردبيل',
    'فرودگاه بین‌المللی دبی': 'مطار دبي الدولي', 'فرودگاه بین‌المللی استانبول': 'مطار إسطنبول الدولي',
    'فرودگاه بین‌المللی نجف': 'مطار النجف الدولي',
    'فرودگاه مبدأ': 'مطار المغادرة', 'فرودگاه مقصد': 'مطار الوصول',
    'شهرهای دارای فرودگاه': 'المدن التي بها مطارات', 'شهری با این نام یافت نشد': 'لم يتم العثور على مدينة بهذا الاسم',
    'شهر یا کد فرودگاه را وارد کنید…': 'أدخل المدينة أو رمز المطار…',
    // flight results detail box + stale-search modal + loading
    'جزئیات قیمت': 'تفاصيل السعر', 'مسافر بزرگسال (۱)': 'مسافر بالغ (١)', 'مجموع': 'المجموع',
    'صندلی باقیمانده': 'المقاعد المتبقية', 'خودکار': 'تلقائي', 'نوع هواپیما': 'نوع الطائرة',
    'کلاس پروازی': 'درجة المقصورة', 'مجاز بار': 'الأمتعة المسموح بها',
    'قفل قیمت هوشمند (ویژه اعضای طلایی)': 'قفل السعر الذكي (لأعضاء الفئة الذهبية)',
    'قفل قیمت هوشمند': 'قفل السعر الذكي',
    'جستجوی خود را به‌روزرسانی کنید': 'حدّث بحثك',
    'قیمت و موجودی این نتایج ممکن است دیگر دقیق نباشد. لطفاً دوباره جستجو کنید تا آخرین نتایج را ببینید.': 'قد لا تكون أسعار هذه النتائج وتوفرها دقيقة بعد الآن. يرجى البحث مجددًا لرؤية أحدث النتائج.',
    'بازگشت به صفحه اصلی': 'العودة إلى الصفحة الرئيسية', 'به‌روزرسانی جستجو': 'تحديث البحث',
    'در حال به‌روزرسانی…': 'جارِ التحديث…', 'تعداد مسافر': 'عدد المسافرين',
    'blujet در حال جستجوی بهترین پروازها از': 'blujet يبحث لك عن أفضل الرحلات من', 'برای شماست': 'خصيصًا لك', 'به': 'إلى',
    'مشاهده همه مقصدها': 'عرض جميع الوجهات',
    'سفرت را همراه خودت ببر': 'خذ رحلتك معك', 'بازار / مایکت': 'متجر / مايكت',
    '۵٬۰۰۰ تا ۱۵٬۰۰۰': 'من ٥٬٠٠٠ إلى ١٥٬٠٠٠',
    // notification boxes (EN literals used across pages)
    'Trip reminder': 'تذكير بالرحلة', 'Loyalty points': 'نقاط النادي', 'Discount code': 'رمز الخصم', 'Special offer': 'عرض خاص',
    'Your Tehran → Dubai flight is tomorrow. Online check-in is open.': 'رحلتك من طهران إلى دبي غدًا. تسجيل الوصول عبر الإنترنت متاح.',
    '450 points from your last purchase were added to your account.': 'تمت إضافة ٤٥٠ نقطة من عمليتك الأخيرة إلى حسابك.',
    'Code BLUE20 is active for domestic flights until the end of the week.': 'الرمز BLUE20 فعّال للرحلات الداخلية حتى نهاية الأسبوع.',
    '1 hour ago': 'قبل ساعة', 'Yesterday': 'أمس', '2 days ago': 'قبل يومين', 'Notifications': 'الإشعارات', '2 new': 'جديدان',
    'حراج تابستانه blujet': 'تخفيضات blujet الصيفية',
    'همکار B2B': 'شريك B2B', '● فعال · کد ۴۴۷۱': '● نشط · الرمز ٤٤٧١',
    'صندلی‌های تخصیصی': 'المقاعد المخصصة', 'وب سرویس': 'خدمة الويب',
    'مستندات وب‌سرویس': 'وثائق خدمة الويب', 'اعتبار و موجودی': 'الرصيد والائتمان',
    'فروش و گزارش‌ها': 'المبيعات والتقارير', 'صندوق پیام‌ها': 'صندوق الرسائل',
    'پروفایل و مدارک': 'الملف والمستندات',
    'نمای کلی فروش، اعتبار و صندلی‌های شما': 'نظرة عامة على مبيعاتك ورصيدك ومقاعدك',
    'اعتبار باقیمانده': 'الرصيد المتبقي', 'صندلی تخصیص‌یافته': 'المقاعد المخصصة',
    'صندلی فروخته‌شده': 'المقاعد المباعة', 'روند فروش آژانس': 'اتجاه مبيعات الوكالة',
    '۶ ماه اخیر · تومان': 'آخر ٦ أشهر · تومان',
    'فروش امروز': 'مبيعات اليوم', 'فروش این ماه': 'مبيعات هذا الشهر',
    'پروازی یافت نشد': 'لا توجد رحلات', 'پروازی برای این جستجو یافت نشد': 'لا توجد رحلات لهذا البحث',
    'پروازی برای این مسیر، تاریخ یا فیلترهای انتخابی موجود نیست. فیلترها را پاک کنید یا تاریخ سفر را تغییر دهید.': 'لا توجد رحلات لهذا المسار أو التاريخ أو الفلاتر المحددة. امسح الفلاتر أو غيّر تاريخ السفر.',
    'پاک کردن فیلترها': 'مسح الفلاتر', 'تغییر جستجو': 'تغيير البحث',
    'شهری با این نام یافت نشد': 'لم يتم العثور على مدينة بهذا الاسم',
    'تکمیل پروفایل': 'إكمال الملف الشخصي',
    'با تکمیل شماره گذرنامه و تأیید ایمیل، پروفایل را کامل کنید و ۲۰۰ امتیاز بگیرید.': 'أكمل رقم جواز سفرك وتحقق من بريدك الإلكتروني لإتمام ملفك الشخصي والحصول على ٢٠٠ نقطة.',
    'پروفایل شما تکمیل نشده است': 'ملفك الشخصي غير مكتمل',
    'برای استفاده کامل از امکانات (رزرو سریع‌تر، احراز هویت و صدور کارت)، اطلاعات هویتی، ایمیل و آدرس خود را تکمیل کنید.': 'لاستخدام كامل الميزات (حجز أسرع، التحقق من الهوية، وإصدار البطاقة)، أكمل بيانات هويتك وبريدك الإلكتروني وعنوانك.',
    'ویرایش اطلاعات': 'تعديل المعلومات',
    'استرداد و کنسلی بلیط': 'استرداد التذكرة وإلغاؤها',
    'فقط بلیط پروازهای انجام‌نشده و پیش از زمان پرواز قابل استرداد هستند. جریمهٔ کنسلی بر اساس فاصله تا زمان پرواز محاسبه می‌شود.': 'يمكن استرداد التذاكر لرحلات لم تُنفَّذ بعد وقبل موعد المغادرة فقط. تُحتسب غرامة الإلغاء بناءً على الوقت المتبقي حتى الرحلة.',
    'پرواز قابل استردادی ندارید': 'ليس لديك رحلات قابلة للاسترداد',
    'فقط بلیط پروازهای پیش‌رو (انجام‌نشده) قابل استرداد هستند.': 'التذاكر للرحلات القادمة (غير المنفذة) فقط قابلة للاسترداد.',
    'قوانین کنسلی و جریمهٔ استرداد': 'قواعد الإلغاء وغرامة الاسترداد',
    'درصد جریمه بر اساس فاصلهٔ زمانی تا پرواز': 'نسبة الغرامة حسب الوقت المتبقي حتى الرحلة',
    'بیش از ۷۲ ساعت مانده': 'أكثر من ٧٢ ساعة متبقية',
    '۲۴ تا ۷۲ ساعت مانده': 'من ٢٤ إلى ٧٢ ساعة متبقية',
    '۳ تا ۲۴ ساعت مانده': 'من ٣ إلى ٢٤ ساعة متبقية',
    'غیرمجاز': 'غير مسموح',
    'کمتر از ۳ ساعت / پس از پرواز': 'أقل من ٣ ساعات / بعد الرحلة',
    'پس از ثبت درخواست، ابتدا ادمین سایت آن را بررسی و به مدیر مالی ارجاع می‌دهد؛ سپس مبلغ قابل بازگشت پس از کسر جریمه، حداکثر تا ۷ روز کاری به کارت پرداخت‌کننده واریز می‌شود.': 'بعد تقديم الطلب، يراجعه مسؤول الموقع أولاً ثم يحيله إلى المدير المالي؛ بعد ذلك يُودَع المبلغ القابل للاسترداد (بعد خصم الغرامة) في بطاقة الدافع خلال ٧ أيام عمل كحد أقصى.',
    'پیگیری درخواست‌های استرداد': 'تتبع طلبات الاسترداد',
    'وضعیت لحظه‌ای درخواست‌های شما در هر مرحله': 'الحالة اللحظية لطلباتك في كل مرحلة',
    'افزایش موجودی': 'شحن الرصيد',
    'گردش امتیاز': 'سجل النقاط',
    'تراکنشی ثبت نشده است!': 'لا توجد معاملات مسجلة بعد!',
    'با خرید بلیط یا استفاده از خدمات، امتیاز و گردش کیف پول اینجا نمایش داده می‌شود.': 'ستظهر هنا نقاطك ومعاملات محفظتك بمجرد شراء تذكرة أو استخدام خدمة.',
    'افزایش موجودی کیف پول': 'شحن رصيد المحفظة',
    'موجودی فعلی': 'الرصيد الحالي',
    'مبلغ واریزی (تومان)': 'المبلغ المودع (تومان)',
    'پرداخت و افزایش موجودی': 'الدفع وشحن الرصيد',
    'در حال اتصال به درگاه بانکی…': 'جارٍ الاتصال ببوابة البنك…',
    'لطفاً صبر کنید؛ پرداخت مبلغ': 'يرجى الانتظار؛ يتم دفع مبلغ',
    'موجودی جدید': 'الرصيد الجديد',
    'سطح عضویت شما': 'فئة عضويتك',
    'امتیاز فعلی': 'النقاط الحالية',
    'با رسیدن به ۵٬۰۰۰ امتیاز واجد شرایط دریافت کارت می‌شوید؛ درخواست برای ادمین ارسال و پس از تأیید مدیران کارت صادر می‌شود.': 'عند بلوغ ٥٬٠٠٠ نقطة تصبح مؤهلاً للحصول على البطاقة؛ يُرسل الطلب إلى الإدارة وتُصدر البطاقة بعد الموافقة.',
    'امتیاز شما': 'نقاطك',
    'حد لازم': 'الحد المطلوب',
    'صادر شد': 'تم الإصدار',
    'با کسب': 'باكتساب',
    'امتیاز دیگر (مجموع ۵٬۰۰۰ امتیاز)، می‌توانید درخواست صدور کارت را ثبت کنید.': 'نقطة أخرى (بإجمالي ٥٬٠٠٠ نقطة)، يمكنك تقديم طلب إصدار البطاقة.',
    'بلو بانک': 'بنك بلو',
    'کارت بلوجت صادر شد': 'تم إصدار بطاقة blujet',
    'درخواست شما ثبت شد': 'تم تسجيل طلبك',
    'پس از بررسی و تأیید، کارت بلوجت برایتان صادر خواهد شد.': 'بعد المراجعة والموافقة، ستصدر بطاقة blujet الخاصة بك.',
    'مشتری بانک سامان هستم': 'أنا عميل بنك سامان',
    'مشتری بانک سامان نیستم': 'لست عميل بنك سامان',
    'شماره مشتری بانک سامان خود را وارد کنید تا اطلاعات حساب شما به پنل بلوجت متصل شود.': 'أدخل رقم عميلك في بنك سامان لربط حسابك بلوحة blujet.',
    'شماره مشتری بانک سامان': 'رقم عميل بنك سامان',
    'اتصال حساب به بانک سامان': 'ربط الحساب ببنك سامان',
    'اگر مشتری بانک سامان نیستید، درخواست عضویت خود را ارسال کنید تا کارشناسان بانک برای افتتاح حساب و صدور کارت بلوجت با شما تماس بگیرند.': 'إذا لم تكن عميلاً في بنك سامان، أرسل طلب العضوية ليتواصل معك خبراء البنك لفتح حساب وإصدار بطاقة blujet.',
    'ارسال درخواست عضویت': 'إرسال طلب العضوية',
    'مزایای سطح طلایی شما': 'مزايا فئتك الذهبية',
    'آیا مطمئن هستید که می‌خواهید از حساب کاربری خود خارج شوید؟': 'هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟',
    'صندوق درخواست‌های پشتیبانی شما خالی است.': 'صندوق طلبات الدعم لديك فارغ.',
    'اگر سوال یا مشکلی دارید می‌توانید با ایجاد درخواست پشتیبانی در سریع‌ترین زمان ممکن آن را پیگیری کنید.': 'إذا كان لديك سؤال أو مشكلة، يمكنك إنشاء طلب دعم ومتابعته في أسرع وقت ممكن.',
    'ایجاد درخواست جدید': 'إنشاء طلب جديد',
    'تیکت جدید پشتیبانی': 'تذكرة دعم جديدة',
    'پیگیری گفت‌وگوهای شما با تیم پشتیبانی': 'متابعة محادثاتك مع فريق الدعم',
    'تیکت جدید': 'تذكرة جديدة',
    'لطفاً شماره مشتری بانک سامان را وارد کنید': 'يرجى إدخال رقم عميل بنك سامان',
    'از نشان‌شده‌ها حذف شد': 'تمت الإزالة من العناصر المحفوظة',
    'تنظیمات امنیت': 'إعدادات الأمان',
    'مسافران ذخیره‌شده': 'المسافرون المحفوظون',
    'مسافری ذخیره نشده است.': 'لا يوجد مسافرون محفوظون.',
    'محمد رضایی': 'محمد رضائي', 'سارا احمدی': 'سارة أحمدي', 'کیان رضایی (کودک)': 'كيان رضائي (طفل)',
    'قابل استرداد': 'قابل للاسترداد',
    'درخواست فعال': 'طلب نشط',
    'پروازهای قابل استرداد': 'الرحلات القابلة للاسترداد',
    'برای مشاهدهٔ قوانین و ثبت درخواست، روی «درخواست استرداد» بزنید.': 'لمشاهدة القواعد وتقديم الطلب، اضغط على «طلب استرداد».',
    'معرفی کامل باشگاه و سطوح بالاتر': 'نظرة شاملة على النادي والفئات الأعلى',
    'پذیرش اختصاصی فرودگاه': 'تسجيل وصول مخصص في المطار', 'بدون صف، سریع‌تر': 'بدون طابور، أسرع',
    'تا ۵٪ کش‌بک بیشتر': 'استرداد نقدي إضافي حتى ٥٪', 'روی هر خرید بلیط': 'على كل عملية شراء تذكرة',
    '۲ برابر امتیاز': 'ضعف النقاط', 'در فصل‌های پرسفر': 'في مواسم السفر الذروة',
    'لطفاً نام و ایمیل خود را وارد کنید': 'يرجى إدخال اسمك وبريدك الإلكتروني',
    'عضویت شما در باشگاه مشتریان ثبت شد ✓': 'تم تسجيل عضويتك في نادي العملاء ✓',
    '۵٬۰۰۰ تا ۱۵٬۰۰۰ امتیاز': 'من ٥٬٠٠٠ إلى ١٥٬٠٠٠ نقطة', 'بالای ۱۵٬۰۰۰ امتیاز': 'أكثر من ١٥٬٠٠٠ نقطة',
    '۲٪ کش‌بک در هر خرید': 'استرداد نقدي ٢٪ في كل عملية شراء', 'جمع‌آوری امتیاز پایه': 'تجميع نقاط أساسي',
    'پشتیبانی اعضا': 'دعم الأعضاء', 'پیشنهادهای فصلی': 'عروض موسمية',
    '۵٪ کش‌بک در هر خرید': 'استرداد نقدي ٥٪ في كل عملية شراء', 'ارتقای رایگان به بیزنس': 'ترقية مجانية إلى درجة الأعمال',
    'درخواست خودرو با تخفیف': 'طلب سيارة بخصم', '۷٪ کش‌بک + هدایای ویژه': 'استرداد نقدي ٧٪ + هدايا خاصة',
    'ارتقای تضمینی صندلی': 'ترقية مقعد مضمونة', 'لانژ اختصاصی فرودگاه': 'صالة مطار حصرية',
    'مدیر سفر اختصاصی': 'مدير سفر مخصص', 'این پیام به‌صورت خودکار بسته می‌شود': 'يُغلق هذا التنبيه تلقائيًا',
    'درخواست صدور کارت ثبت شد ✓': 'تم تسجيل طلب إصدار البطاقة ✓',
    'لینک دانلود از App Store به‌زودی فعال می‌شود': 'رابط التنزيل من App Store سيُفعَّل قريبًا',
    'لینک دانلود از Google Play به‌زودی فعال می‌شود': 'رابط التنزيل من Google Play سيُفعَّل قريبًا',
    'ثبت شماره مشتری': 'إرسال رقم العميل', 'لطفاً شماره مشتری را وارد کنید': 'يرجى إدخال رقم العميل',
    'شماره مشتری بانک سامان ثبت شد ✓': 'تم تسجيل رقم عميل بنك سامان ✓',
    'خرید اقساطی بلیط با کارت بانک سامان': 'شراء التذاكر بالتقسيط عبر بطاقة بنك سامان',
    'بدون کارمزد، تا ۱۲ ماه اقساط روی خرید بلیط پرواز': 'بدون رسوم، حتى ١٢ شهرًا من التقسيط على شراء تذاكر الطيران',
    'باشگاه مشتریان blujet': 'نادي عملاء blujet', 'هر پرواز، یک قدم به مزایای بیشتر': 'كل رحلة خطوة أقرب لمزايا أكبر',
    'با هر سفر امتیاز جمع کنید، کش‌بک بگیرید و از خدمات اختصاصی مثل ارتقای رایگان، پذیرش ویژه‌ی فرودگاه و درخواست خودرو بهره‌مند شوید.': 'اجمع نقاطًا مع كل رحلة، احصل على استرداد نقدي، واستمتع بخدمات حصرية مثل الترقية المجانية واستقبال مطار خاص وطلب السيارة.',
    'عضویت رایگان': 'انضمام مجاني', 'حساب من': 'حسابي', 'کش‌بک در هر خرید': 'استرداد نقدي في كل عملية شراء',
    'مقصد پروازی': 'وجهة طيران', 'سطح عضویت': 'فئة العضوية', 'سطوح عضویت': 'فئات العضوية',
    'هر چه بیشتر پرواز کنید، به سطح بالاتر و مزایای بیشتر می‌رسید.': 'كلما زاد سفرك، ارتقيت إلى فئة أعلى وحصلت على مزايا أكبر.',
    'پرکاربردترین': 'الأكثر رواجًا', 'صدور کارت بلوجت': 'إصدار بطاقة blujet',
    'با رسیدن به حد امتیاز، کارت بگیرید': 'عند بلوغ حد النقاط، احصل على بطاقتك', 'به محض رسیدن به آستانه‌ی': 'بمجرد بلوغ عتبة',
    '۵٬۰۰۰ امتیاز': '٥٬٠٠٠ نقطة',
    '، واجد شرایط دریافت کارت عضویت می‌شوید. درخواست شما برای ادمین سایت ارسال و سپس برای تأیید به رئیس هیئت مدیره یا مدیر ارشد ارجاع می‌شود؛ پس از تأیید، کارت برای مسافر صادر می‌گردد.': '، تصبح مؤهلاً للحصول على بطاقة العضوية. يُرسل طلبك إلى مسؤول الموقع ثم يُحال إلى رئيس مجلس الإدارة أو المدير الأول للموافقة؛ وبعد الموافقة، تُصدر البطاقة للمسافر.',
    'کسب امتیاز': 'كسب النقاط', 'با هر پرواز امتیاز جمع کنید تا به حد ۵٬۰۰۰ برسید.': 'اجمع نقاطًا مع كل رحلة حتى تبلغ ٥٬٠٠٠ نقطة.',
    'درخواست صدور کارت برای ادمین سایت ارسال می‌شود.': 'يُرسل طلب إصدار البطاقة إلى مسؤول الموقع.',
    'ارجاع برای تأیید': 'الإحالة للموافقة',
    'ادمین درخواست را به رئیس هیئت مدیره یا مدیر ارشد ارجاع می‌دهد.': 'يحيل المسؤول الطلب إلى رئيس مجلس الإدارة أو المدير الأول.',
    'صدور کارت': 'إصدار البطاقة', 'پس از تأیید، کارت عضویت برای مسافر صادر می‌شود.': 'بعد الموافقة، تُصدر بطاقة العضوية للمسافر.',
    'کارت نقره‌ای': 'بطاقة فضية', 'کارت طلایی': 'بطاقة ذهبية', 'کارت پلاتین': 'بطاقة بلاتينية',
    'درخواست صدور کارت': 'طلب إصدار البطاقة', 'چطور امتیاز بگیرم؟': 'كيف أحصل على نقاط؟',
    'پرواز کنید': 'سافر', 'به ازای هر خرید بلیط امتیاز بگیرید.': 'احصل على نقاط مع كل عملية شراء تذكرة.',
    'کش‌بک بگیرید': 'احصل على استرداد نقدي', 'بخشی از مبلغ به کیف پول برمی‌گردد.': 'يعود جزء من المبلغ إلى محفظتك.',
    'معرفی دوستان': 'دعوة الأصدقاء', 'با دعوت دوستان امتیاز هدیه بگیرید.': 'ادعُ أصدقاءك واحصل على نقاط إضافية.',
    'ماموریت‌ها': 'المهام', 'با تکمیل ماموریت‌ها امتیاز جمع کنید.': 'أكمل المهام لجمع المزيد من النقاط.',
    'خدمات ویژه‌ی اعضا': 'خدمات حصرية للأعضاء', 'درخواست خودرو': 'طلب سيارة',
    'رزرو خودرو فرودگاه تا مقصد با تخفیف ویژه اعضا.': 'احجز سيارة من المطار إلى وجهتك بخصم خاص للأعضاء.',
    'ارتقای صندلی': 'ترقية المقعد', 'ارتقای رایگان یا تخفیف‌دار به کلاس بیزنس.': 'ترقية مجانية أو بخصم إلى درجة الأعمال.',
    'پذیرش ویژه': 'استقبال خاص', 'چک‌این سریع و پذیرش اختصاصی بدون صف.': 'تسجيل وصول سريع واستقبال حصري دون طابور.',
    'همین حالا عضو طلایی شوید': 'كن عضوًا ذهبيًا الآن',
    'عضویت رایگان است و از اولین پرواز، امتیاز و کش‌بک دریافت می‌کنید.': 'العضوية مجانية، واحصل على نقاط واسترداد نقدي من أول رحلة.',
    'ثبت‌نام در باشگاه': 'التسجيل في النادي', 'عضویت در باشگاه مشتریان': 'الانضمام إلى نادي العملاء',
    'عضویت رایگان است و از اولین پرواز امتیاز می‌گیرید.': 'العضوية مجانية وتبدأ بجمع النقاط من أول رحلة.',
    'عضویت شما ثبت شد': 'تم تسجيل عضويتك', 'به باشگاه مشتریان blujet خوش آمدید،': 'مرحبًا بك في نادي عملاء blujet،',
    '! حساب شما با سطح نقره‌ای فعال شد و از اولین پرواز امتیاز جمع می‌کنید.': '! تم تفعيل حسابك في الفئة الفضية وستبدأ بجمع النقاط من أول رحلة.',
    'مشاهدهٔ حساب من': 'عرض حسابي', 'نام و نام خانوادگی': 'الاسم الكامل', 'مثلاً نگار رضایی': 'مثلاً نيغار رضائي',
    'شماره موبایل': 'رقم الجوال', 'ثبت عضویت رایگان': 'تسجيل العضوية المجانية',
    'با ثبت‌نام، قوانین و مقررات باشگاه مشتریان blujet را می‌پذیرید.': 'بالتسجيل، فإنك توافق على شروط وأحكام نادي عملاء blujet.',
    'چطور می‌توانیم کمک کنیم؟': 'كيف يمكننا المساعدة؟',
    'پاسخ پرسش‌های متداول را پیدا کنید یا با تیم پشتیبانی ۲۴ ساعته در ارتباط باشید.': 'اعثر على إجابات للأسئلة الشائعة أو تواصل مع فريق الدعم على مدار الساعة.',
    'جستجو در راهنما… مثلاً: استرداد بلیط': 'ابحث في مركز المساعدة… مثلاً: استرداد تذكرة',
    'لطفاً توضیح درخواست خود را بنویسید': 'يرجى كتابة تفاصيل طلبك',
    'تیکت پشتیبانی شما با موضوع «': 'تم تقديم تذكرة الدعم الخاصة بك بخصوص «', '» ثبت شد ✓': '» ✓',
    'در حال جستجو برای «': 'جارٍ البحث عن «', '»…': '»…', 'عبارت مورد نظر را برای جستجو وارد کنید': 'يرجى إدخال كلمة للبحث',
    'خروج از حساب کاربری': 'تسجيل الخروج من الحساب',
    'با موفقیت از حساب کاربری خارج شدید.': 'تم تسجيل خروجك من الحساب بنجاح.',
    'رزرو و خرید بلیط': 'حجز وشراء التذكرة', 'مراحل خرید، پرداخت و دریافت بلیط': 'خطوات الشراء والدفع واستلام التذكرة',
    'استرداد و تغییر': 'الاسترداد والتغيير', 'کنسلی، تغییر تاریخ و بازگشت وجه': 'الإلغاء وتغيير التاريخ واسترداد المبلغ',
    'بار و صندلی': 'الأمتعة والمقاعد', 'قوانین بار، انتخاب صندلی و خدمات': 'قواعد الأمتعة واختيار المقعد والخدمات',
    'امتیازها، سطوح عضویت و مزایا': 'النقاط وفئات العضوية والمزايا',
    'پرسش‌های متداول': 'الأسئلة الشائعة',
    'چگونه بلیط خود را استرداد کنم؟': 'كيف أسترد تذكرتي؟',
    'از بخش «مدیریت رزرو» با وارد کردن کد رزرو و نام خانوادگی، بلیط را انتخاب و گزینهٔ استرداد را بزنید. مبلغ قابل بازگشت بر اساس قوانین نرخ بلیط محاسبه و حداکثر ظرف ۷۲ ساعت کاری به حساب شما واریز می‌شود.': 'من قسم «إدارة الحجز» أدخل رمز الحجز واسم العائلة، اختر التذكرة واضغط على خيار الاسترداد. يُحتسب المبلغ القابل للاسترداد وفق قواعد سعر التذكرة ويُودَع في حسابك خلال ٧٢ ساعة عمل كحد أقصى.',
    'چک‌این آنلاین از چه زمانی فعال می‌شود؟': 'متى يُفتح تسجيل الوصول عبر الإنترنت؟',
    'چک‌این آنلاین از ۲۴ ساعت تا ۵ ساعت پیش از پرواز فعال است. پس از انجام چک‌این، کارت پرواز به‌صورت الکترونیکی برای شما صادر و قابل دانلود خواهد بود.': 'يُفتح تسجيل الوصول عبر الإنترنت من ٢٤ ساعة إلى ٥ ساعات قبل الرحلة. بعد تسجيل الوصول، تصدر بطاقة الصعود إلكترونيًا وتكون قابلة للتنزيل.',
    'اگر پرداخت انجام شد ولی بلیط صادر نشد چه کنم؟': 'ماذا أفعل إذا تم الدفع ولم تُصدر التذكرة؟',
    'در صورت کسر وجه و عدم صدور بلیط، مبلغ به‌صورت خودکار طی ۲۴ تا ۷۲ ساعت به حساب شما بازمی‌گردد. برای پیگیری فوری می‌توانید تیکت ثبت کنید یا با پشتیبانی تماس بگیرید.': 'في حال خصم المبلغ دون إصدار التذكرة، يُعاد المبلغ تلقائيًا إلى حسابك خلال ٢٤ إلى ٧٢ ساعة. للمتابعة العاجلة يمكنك تقديم تذكرة دعم أو الاتصال بالدعم.',
    'میزان بار مجاز هر بلیط چقدر است؟': 'ما هو وزن الأمتعة المسموح به لكل تذكرة؟',
    'در نرخ اکونومی ۲۰ کیلوگرم و در نرخ بیزنس ۴۰ کیلوگرم بار رایگان لحاظ می‌شود. بار اضافه را می‌توانید هنگام خرید یا از بخش خدمات اضافه خریداری کنید.': 'يُسمح بـ ٢٠ كجم مجانًا في درجة الاقتصادية و٤٠ كجم في درجة الأعمال. يمكن شراء أمتعة إضافية عند الشراء أو من قسم الخدمات الإضافية.',
    'چگونه امتیاز باشگاه مشتریان جمع کنم؟': 'كيف أجمع نقاط نادي العملاء؟',
    'با هر خرید بلیط به‌صورت خودکار امتیاز دریافت می‌کنید. امتیازها قابل تبدیل به تخفیف، ارتقای صندلی و بار اضافه هستند و در پنل کاربری قابل مشاهده‌اند.': 'تحصل على نقاط تلقائيًا مع كل عملية شراء تذكرة. يمكن تحويل النقاط إلى خصومات وترقية مقعد وأمتعة إضافية، وهي مرئية في لوحة حسابك.',
    'تماس مستقیم': 'اتصال مباشر', 'تلفن ۲۴ ساعته': 'هاتف على مدار الساعة', 'گفتگوی آنلاین': 'محادثة مباشرة',
    'هم‌اکنون آنلاین': 'متصل الآن', 'ثبت تیکت پشتیبانی': 'تقديم تذكرة دعم',
    'درخواست خود را ثبت کنید؛ کارشناسان ما حداکثر ظرف ۲ ساعت پاسخ می‌دهند.': 'قدّم طلبك؛ سيرد فريقنا خلال ساعتين كحد أقصى.',
    'تیکت شما ثبت شد': 'تم تقديم تذكرتك', 'توضیح درخواست…': 'وصف الطلب…', 'ارسال تیکت': 'إرسال التذكرة',
    'مدیریت رزرو': 'إدارة الحجز',
    'رزرو خود را با کد رزرو مشاهده، تغییر صندلی، دانلود بلیط یا درخواست استرداد دهید.': 'اعرض حجزك برمز الحجز، وغيّر مقعدك، ونزّل تذكرتك، أو قدّم طلب استرداد.',
    'کد رزرو': 'رمز الحجز', 'نام خانوادگی مسافر': 'اسم عائلة المسافر', 'نام خانوادگی': 'اسم العائلة',
    'مشاهده رزرو': 'عرض الحجز',
    'کد رزرو در ایمیل/پیامک تأیید خرید برای شما ارسال شده است.': 'أُرسل رمز الحجز إليك عبر البريد الإلكتروني/الرسائل النصية عند تأكيد الشراء.',
    'کد رزرو و نام خانوادگی را وارد کنید': 'أدخل رمز الحجز واسم العائلة',
    'مقاصد محبوب': 'الوجهات الشائعة', 'پرطرفدارترین مسیرهای این فصل با بهترین قیمت': 'أكثر المسارات طلبًا هذا الموسم بأفضل الأسعار',
    'مشاهده همه مقاصد ‹': 'عرض جميع الوجهات ‹', 'شروع از': 'يبدأ من',
    'عکس بنر باشگاه مشتریان را اینجا رها کنید': 'ضع صورة بانر نادي العملاء هنا',
    'با هر پرواز، امتیاز بگیرید': 'اجمع النقاط مع كل رحلة',
    'عضویت رایگان در باشگاه مشتریان blujet — امتیازها را به بلیط و ارتقای کابین تبدیل کنید.': 'عضوية مجانية في نادي عملاء blujet — حوّل نقاطك إلى تذاكر وترقيات مقصورة.',
    'عضویت در باشگاه': 'الانضمام إلى النادي',
    'رزروی یافت نشد': 'لم يتم العثور على الحجز',
    'کد رزرو و نام خانوادگی وارد‌شده با هیچ رزروی مطابقت ندارد.': 'رمز الحجز واسم العائلة المدخلان لا يطابقان أي حجز.',
    'جستجوی دوباره': 'إعادة البحث', 'ایران ایر': 'إيران للطيران', 'تأییدشده': 'مؤكد',
    'تهران — مهرآباد': 'طهران — مهرآباد',
    'مسافران': 'المسافرون', 'صندلی': 'المقعد',
    'صفحهٔ تغییر صندلی باز شد': 'فُتحت صفحة تغيير المقعد', 'بلیط الکترونیکی در حال دانلود است…': 'جارٍ تنزيل التذكرة الإلكترونية…',
    'تغییر صندلی': 'تغيير المقعد', 'استرداد بلیط': 'استرداد التذكرة',
    'آخرین به‌روزرسانی: ۱ تیر ۱۴۰۵ · لطفاً پیش از خرید بلیط مطالعه فرمایید.': 'آخر تحديث: ٢٢ يونيو ٢٠٢٦ · يرجى القراءة قبل شراء التذكرة.',
    'فهرست': 'المحتويات',
    'قوانین استرداد و تغییر بسته به نوع نرخ بلیط و سیاست هر ایرلاین متفاوت است. مبلغ دقیق قابل بازگشت در مرحلهٔ استرداد در بخش «مدیریت رزرو» به شما نمایش داده می‌شود.': 'تختلف قواعد الاسترداد والتغيير حسب نوع سعر التذكرة وسياسة كل شركة طيران. يُعرض عليك المبلغ الدقيق القابل للاسترداد في خطوة الاسترداد ضمن «إدارة الحجز».',
    'استرداد و تغییر بلیط': 'استرداد وتغيير التذكرة', 'مشکل در پرداخت': 'مشكلة في الدفع',
    'بار و چک‌این': 'الأمتعة وتسجيل الوصول', 'سایر موارد': 'أخرى',
    'درباره blujet': 'عن blujet', 'سفر را ساده، مطمئن و در دسترس می‌کنیم': 'نجعل السفر الجوي بسيطًا وموثوقًا ومتاحًا',
    'blujet یک پلتفرم رزرو آنلاین بلیط هواپیماست که از سال ۱۳۹۲ با هدف ساده‌سازی تجربهٔ سفر هوایی برای مسافران ایرانی فعالیت می‌کند.': 'blujet منصة حجز تذاكر طيران عبر الإنترنت تعمل منذ عام ٢٠١٣ على تبسيط تجربة السفر الجوي للمسافرين الإيرانيين.',
    'مسافر سالانه': 'مسافر سنويًا', 'مسیر پروازی': 'مسار طيران', 'ایرلاین طرف قرارداد': 'شركة طيران شريكة',
    'مأموریت ما': 'مهمتنا',
    'دسترس‌پذیر کردن سفر هوایی با شفاف‌ترین قیمت‌ها، فرایند خرید بدون پیچیدگی و خدماتی که در تمام مراحل سفر کنار مسافر است.': 'إتاحة السفر الجوي بأكثر الأسعار شفافية، وعملية شراء بسيطة، وخدمات ترافق المسافر في كل مرحلة من رحلته.',
    'چشم‌انداز': 'الرؤية',
    'تبدیل‌شدن به مرجع نخست رزرو سفر در منطقه با اتکا به فناوری، صداقت در قیمت‌گذاری و تجربهٔ کاربری بی‌نقص.': 'أن نصبح المرجع الأول لحجز السفر في المنطقة عبر التكنولوجيا والصدق في التسعير وتجربة مستخدم لا تشوبها شائبة.',
    'ارزش‌های ما': 'قيمنا', 'شفافیت': 'الشفافية',
    'بدون هزینهٔ پنهان؛ قیمت نهایی همان است که می‌بینید.': 'بدون رسوم خفية؛ السعر النهائي هو ما تراه.',
    'سرعت': 'السرعة', 'خرید بلیط در کمتر از دو دقیقه و صدور آنی.': 'شراء التذكرة في أقل من دقيقتين مع إصدار فوري.',
    'اعتماد': 'الثقة', 'درگاه پرداخت امن و حفاظت کامل از اطلاعات مسافران.': 'بوابة دفع آمنة وحماية كاملة لبيانات المسافرين.',
    'عضویت باشگاه': 'الانضمام إلى النادي'
  };
  var SUBS = {
    '\u067e\u0631\u0648\u0627\u0632\u06cc \u0628\u0631\u0627\u06cc ': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0631\u062d\u0644\u0627\u062a \u0644\u0640 ',
    ' \u062f\u0631 \u0627\u06cc\u0646 \u062a\u0627\u0631\u06cc\u062e \u0645\u0648\u062c\u0648\u062f \u0646\u06cc\u0633\u062a. \u0645\u0633\u06cc\u0631 \u06cc\u0627 \u062a\u0627\u0631\u06cc\u062e \u0633\u0641\u0631 \u0631\u0627 \u062a\u063a\u06cc\u06cc\u0631 \u062f\u0647\u06cc\u062f.': ' \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u062a\u0627\u0631\u064a\u062e. \u062c\u0631\u0651\u0628 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0645\u0633\u0627\u0631 \u0623\u0648 \u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0633\u0641\u0631.',
    'مشاهده همه مقصدها': 'عرض جميع الوجهات', 'سفرت را همراه خودت ببر': 'خذ رحلتك معك',
    'مهلت: ': 'الموعد النهائي: ', 'از ': 'من ', ' تا ': ' إلى ', ' روز': ' يوم', 'امروز': 'اليوم',
    'پرواز رفت: ': 'رحلة الذهاب: ', ' به ': ' إلى ',
    'پروازهای': 'رحلات', 'پروازها': 'الرحلات', 'پرواز در هفته': 'رحلة أسبوعيًا',
    ' ساعت پرواز': ' ساعة طيران', ' ساعت و ': ' ساعة و', ' ساعت ': ' ساعة ', ' دقیقه': ' دقيقة',
    'روزانه ': 'يوميًا ', 'هفته‌ای ': 'أسبوعيًا ', 'تخفیف': 'خصم', ' سرویس': ' خدمة', ' فاکتور': ' فاتورة', ' بلیط': ' تذكرة', ' مسیر فعال': ' مسار نشط',
    'صندلی باقی‌مانده': 'مقاعد متبقية', 'بزرگسال': 'بالغ', 'کودک': 'طفل', 'نوزاد': 'رضيع',
    'اکونومی': 'اقتصادية', 'رفت و برگشت': 'ذهاب وإياب', '· صفحه ': '· صفحة ', 'بیزینس': 'درجة الأعمال',
    'جمعه': 'الجمعة', 'شنبه': 'السبت', 'پرواز': 'رحلة', 'مسافر': 'مسافر',
    'دبی': 'دبي', 'کیش': 'كيش', 'شیراز': 'شيراز', 'تهران': 'طهران', 'استانبول': 'إسطنبول',
    'تبریز': 'تبريز', 'اصفهان': 'أصفهان', 'تیر ۱۴۰۵': 'تير ١٤٠٥', ' تیر': ' تير',
    'مگابایت': 'ميغابايت', 'کیلوبایت': 'كيلوبايت', 'تصویر · ': 'صورة · '
  };
  var SUBS_KEYS = Object.keys(SUBS).sort(function (a, b) { return b.length - a.length; });
  function trDigits(s) {
    return s.replace(/[۰-۹]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]; });
  }
  function trStr(s) {
    if (D[s]) return D[s];
    var out = s;
    for (var i = 0; i < SUBS_KEYS.length; i++) {
      var k = SUBS_KEYS[i];
      if (out.indexOf(k) !== -1) out = out.split(k).join(SUBS[k]);
    }
    return trDigits(out);
  }
  function deep(v) {
    if (typeof v === 'string') return trStr(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object' && !v.$$typeof && v.constructor === Object && !('current' in v) && !v.__html) {
      var o = {}; for (var k in v) o[k] = deep(v[k]); return o;
    }
    return v;
  }
  window.ARDict = D;
  window.arDeep = deep;
})();
