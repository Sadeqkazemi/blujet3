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
    contact: { phone: '۰۲۱-۹۱۰۰۰۰۰۰', email: 'support@aseman.ir' },
    socials: { instagram: true, telegram: true, whatsapp: true, linkedin: false, x: true },
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

  // ── Loyalty club flow ────────────────────────────────────────────────────
  // Card tiers keyed by points threshold.
  var CARD_TIERS = [
    { key: 'silver', label: 'نقره‌ای', min: 0, max: 5000 },
    { key: 'gold', label: 'طلایی', min: 5000, max: 15000 },
    { key: 'platinum', label: 'پلاتین', min: 15000, max: Infinity }
  ];
  // Points needed before a member may request a membership card.
  var CARD_THRESHOLD = 5000;
  function levelForPoints(p) {
    for (var i = CARD_TIERS.length - 1; i >= 0; i--) { if (p >= CARD_TIERS[i].min) return CARD_TIERS[i].key; }
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
    PERM_CATALOG: PERM_CATALOG, getPermCatalog: getPermCatalog, permLabel: permLabel, permSection: permSection,
    getRefunds: getRefunds, addRefund: addRefund, updateRefund: updateRefund,
    CARD_TIERS: CARD_TIERS, CARD_THRESHOLD: CARD_THRESHOLD, levelForPoints: levelForPoints,
    getClubMembers: getClubMembers, addClubMember: addClubMember, updateClubMember: updateClubMember,
    getCardRequests: getCardRequests, addCardRequest: addCardRequest, updateCardRequest: updateCardRequest,
    getReservations: getReservations, addReservation: addReservation, updateReservation: updateReservation,
    getManagerReports: getManagerReports, addManagerReport: addManagerReport,
    getPricingProposals: getPricingProposals, addPricingProposal: addPricingProposal, updatePricingProposal: updatePricingProposal,
    getStaff: getStaff, addStaff: addStaff, getStaffReports: getStaffReports, addStaffReport: addStaffReport,
    authStaff: authStaff, getStaffTasks: getStaffTasks, updateStaffTask: updateStaffTask,
    getStaffReferrals: getStaffReferrals, updateStaffReferral: updateStaffReferral,
    getWebServiceRequests: getWebServiceRequests, addWebServiceRequest: addWebServiceRequest, updateWebServiceRequest: updateWebServiceRequest,
    getStaffNotifs: getStaffNotifs, markStaffNotifsRead: markStaffNotifsRead,
    getAgencyApi: getAgencyApi, updateAgencyApi: updateAgencyApi, addAgencyApi: addAgencyApi, apiForAgency: apiForAgency };
})();
