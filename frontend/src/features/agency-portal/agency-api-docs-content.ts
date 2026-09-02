import type { StoredLocale } from '../../hooks/useLocale';

export type DocSectionKey = 'intro' | 'auth' | 'endpoints' | 'errors' | 'changelog';

export interface DocEndpoint {
  id: string;
  method: string;
  path: string;
  locked: boolean;
  desc: Record<StoredLocale, string>;
  req: string;
  res: string;
}

export interface DocGroup {
  key: string;
  title: Record<StoredLocale, string>;
  eps: DocEndpoint[];
}

export const DOC_SECTIONS: { key: DocSectionKey; label: Record<StoredLocale, string> }[] = [
  { key: 'intro', label: { fa: 'معرفی', en: 'Introduction', ar: 'مقدمة' } },
  { key: 'auth', label: { fa: 'احراز هویت', en: 'Authentication', ar: 'المصادقة' } },
  { key: 'endpoints', label: { fa: 'متدها (Endpoints)', en: 'Endpoints', ar: 'نقاط النهاية' } },
  { key: 'errors', label: { fa: 'کدهای خطا', en: 'Error Codes', ar: 'رموز الخطأ' } },
  { key: 'changelog', label: { fa: 'تاریخچه نسخه‌ها', en: 'Changelog', ar: 'سجل الإصدارات' } },
];

export const API_DOC_GROUPS: DocGroup[] = [
  {
    key: 'Token',
    title: { fa: 'توکن', en: 'Token', ar: 'الرمز' },
    eps: [
      {
        id: 'getAuthorizeToken',
        method: 'POST',
        path: '/api/v2/accounting/getAuthorizeToken',
        locked: false,
        desc: {
          fa: 'دریافت توکن دسترسی با نام کاربری و رمز عبور آژانس. این توکن را در تمام درخواست‌های بعدی به‌صورت هدر Bearer ارسال کنید.',
          en: 'Validate the active agency API key. Send X-API-Key on every request; no second token is issued.',
          ar: 'الحصول على رمز وصول باستخدام اسم المستخدم وكلمة مرور الوكالة. أرسل هذا الرمز في كل طلب لاحق كـ Bearer.',
        },
        req: `POST /api/v2/accounting/getAuthorizeToken\nX-API-Key: <agency-api-key>`,
        res: `{\n  "success": true,\n  "data": { "authenticated": true, "agencyId": "<agency-id>", "scope": "SEARCH_BOOK" }\n}`,
      },
    ],
  },
  {
    key: 'Flight',
    title: { fa: 'پرواز', en: 'Flight', ar: 'الرحلة' },
    eps: [
      {
        id: 'FlightSearch',
        method: 'POST',
        path: '/api/v2/flight/FlightSearch',
        locked: true,
        desc: {
          fa: 'جست‌وجوی پروازها و نرخ‌های موجود برای یک تاریخ سفر مشخص.',
          en: 'Search available flights and fares for an exact travel date.',
          ar: 'البحث عن الرحلات والأسعار المتاحة لتاريخ سفر محدد.',
        },
        req: `POST /api/v2/flight/FlightSearch\nX-API-Key: <agency-api-key>\nContent-Type: application/json\n\n{\n  "origin": "THR",\n  "destination": "MHD",\n  "date": "2026-08-15"\n}`,
        res: `{\n  "success": true,\n  "data": [{ "id": "<flight-instance-id>", "flightNo": "XY1234", "cabins": [] }]\n}`,
      },
      {
        id: 'Allotments',
        method: 'GET',
        path: '/api/v2/flight/Allotments',
        locked: true,
        desc: {
          fa: 'دریافت سهمیه‌های واقعی متعلق به آژانس، همراه با مسیر و ظرفیت باقی‌مانده برای رزرو.',
          en: 'Get agency-owned allotments with route details and remaining bookable capacity.',
          ar: 'الحصول على حصص الوكالة مع تفاصيل المسار والسعة المتبقية القابلة للحجز.',
        },
        req: `GET /api/v2/flight/Allotments\nX-API-Key: <agency-api-key>`,
        res: `{\n  "success": true,\n  "data": [{ "id": "<agency-allotment-id>", "originCode": "THR", "destinationCode": "MHD", "seats": 20, "used": 4, "remaining": 16 }]\n}`,
      },
      {
        id: 'SeatMap',
        method: 'GET',
        path: '/api/v2/flight/:flightInstanceId/SeatMap',
        locked: true,
        desc: {
          fa: 'دریافت نقشه زنده صندلی‌های پرواز و وضعیت قابل فروش یا رزروشده هر صندلی.',
          en: 'Get the live seat map and sellable or reserved status of each seat.',
          ar: 'الحصول على خريطة المقاعد الحية وحالة كل مقعد المتاح للبيع أو المحجوز.',
        },
        req: `GET /api/v2/flight/<flight-instance-id>/SeatMap\nX-API-Key: <agency-api-key>`,
        res: `{\n  "success": true,\n  "data": { "flightInstanceId": "<flight-instance-id>", "seats": [] }\n}`,
      },
      {
        id: 'Book',
        method: 'POST',
        path: '/api/v2/flight/Book',
        locked: true,
        desc: {
          fa: 'ایجاد رزرو (PNR) برای پرواز قیمت‌گذاری‌شده همراه با اطلاعات مسافران.',
          en: 'Create a reservation (PNR) for the priced flight with passenger details.',
          ar: 'إنشاء حجز (PNR) للرحلة المُسعّرة مع بيانات المسافرين.',
        },
        req: `POST /api/v2/flight/Book\nX-API-Key: <agency-api-key>\nIdempotency-Key: <unique-request-key>\nContent-Type: application/json\n\n{\n  "allotmentId": "<agency-allotment-id>",\n  "cabin": "ECONOMY",\n  "passengers": [{\n    "fullName": "Ali Rezaei",\n    "passengerType": "ADULT",\n    "birthDate": "1990-01-01",\n    "seatCode": "4A"\n  }]\n}`,
        res: `{\n  "success": true,\n  "data": { "pnr": "<pnr>", "status": "TICKETED" }\n}`,
      },
      {
        id: 'GetBooking',
        method: 'GET',
        path: '/api/v2/flight/Bookings/:bookingReference',
        locked: true,
        desc: {
          fa: 'دریافت رزرو متعلق به همان آژانس با شناسه رزرو یا PNR.',
          en: 'Retrieve a booking owned by the same agency using its ID or PNR.',
          ar: 'استرجاع حجز تابع لنفس الوكالة باستخدام المعرّف أو رقم PNR.',
        },
        req: `GET /api/v2/flight/Bookings/<booking-id-or-pnr>\nX-API-Key: <agency-api-key>`,
        res: `{\n  "success": true,\n  "data": { "pnr": "<pnr>", "status": "TICKETED" }\n}`,
      },
      {
        id: 'AirDemandTicket',
        method: 'POST',
        path: '/api/v2/flight/AirDemandTicket',
        locked: true,
        desc: {
          fa: 'درخواست صدور بلیت برای رزرو تأییدشده.',
          en: 'Retrieve the already-ticketed result of a direct-inventory agency reservation.',
          ar: 'طلب إصدار التذكرة لحجز مؤكد.',
        },
        req: `POST /api/v2/flight/AirDemandTicket\nX-API-Key: <agency-api-key>\nContent-Type: application/json\n\n{\n  "bookingReference": "<booking-id-or-pnr>"\n}`,
        res: `{\n  "success": true,\n  "data": { "pnr": "<pnr>", "status": "TICKETED" }\n}`,
      },
    ],
  },
  {
    key: 'Accounting',
    title: { fa: 'مالی', en: 'Accounting', ar: 'المحاسبة' },
    eps: [
      {
        id: 'myCredit',
        method: 'POST',
        path: '/api/v2/accounting/myCredit',
        locked: true,
        desc: {
          fa: 'دریافت موجودی و سقف اعتبار فعلی آژانس شما.',
          en: "Get your agency's current credit balance and limit.",
          ar: 'الحصول على رصيد وسقف ائتمان وكالتك الحالي.',
        },
        req: `POST /api/v2/accounting/myCredit\nX-API-Key: <agency-api-key>`,
        res: `{\n  "success": true,\n  "data": { "limitIrr": "<limit-irr>", "usedIrr": "<used-irr>", "remainingIrr": "<remaining-irr>" }\n}`,
      },
    ],
  },
];

export const ERROR_ROWS: { code: string; title: Record<StoredLocale, string>; desc: Record<StoredLocale, string> }[] = [
  {
    code: '401',
    title: { fa: 'عدم احراز هویت', en: 'Unauthorized', ar: 'غير مصرّح' },
    desc: {
      fa: 'کلید API ارسال نشده یا نامعتبر است.',
      en: 'Missing or invalid API key.',
      ar: 'مفتاح API مفقود أو غير صالح.',
    },
  },
  {
    code: '403',
    title: { fa: 'دسترسی مجاز نیست', en: 'Forbidden', ar: 'محظور' },
    desc: {
      fa: 'پلن وب‌سرویس غیرفعال یا معلق شده است.',
      en: 'Web service plan inactive or suspended.',
      ar: 'خطة خدمة الويب غير نشطة أو معلّقة.',
    },
  },
  {
    code: '429',
    title: { fa: 'تعداد درخواست بیش از حد', en: 'Too Many Requests', ar: 'طلبات كثيرة جداً' },
    desc: {
      fa: 'محدودیت نرخ درخواست رد شده — ۶۰ درخواست در دقیقه.',
      en: 'Rate limit exceeded — 60 requests per minute per API key.',
      ar: 'تم تجاوز حد المعدل — ٦٠ طلباً في الدقيقة.',
    },
  },
];

export const CHANGELOG_ROWS: { v: string; date: Record<StoredLocale, string>; note: Record<StoredLocale, string> }[] = [
  {
    v: 'v1.1',
    date: { fa: '۱۴۰۴/۰۸/۲۹', en: '2025-11-20', ar: '٢٠٢٥-١١-٢٠' },
    note: {
      fa: 'افزوده‌شدن متد POST /bookings/{pnr}/issue.',
      en: 'Added POST /bookings/{pnr}/issue endpoint.',
      ar: 'إضافة نقطة POST /bookings/{pnr}/issue.',
    },
  },
  {
    v: 'v1.0',
    date: { fa: '۱۴۰۴/۰۵/۱۰', en: '2025-08-01', ar: '٢٠٢٥-٠٨-٠١' },
    note: {
      fa: 'انتشار عمومی اولیه وب‌سرویس رزرو آژانس.',
      en: 'Initial public release of the agency booking API.',
      ar: 'الإصدار العام الأول لواجهة حجز الوكالة.',
    },
  },
];

export const DOC_COPY: Record<
  StoredLocale,
  {
    title: string;
    subtitle: string;
    baseUrlLabel: string;
    formatLabel: string;
    formatVal: string;
    rateLabel: string;
    rateVal: string;
    authTitle: string;
    authP1: string;
    authP2: string;
    endpointsHint: string;
    reqLabel: string;
    resLabel: string;
    errorsHint: string;
    lockedHint: string;
    activePlanHint: string;
    loading: string;
  }
> = {
  fa: {
    title: 'وب‌سرویس رزرو آژانس',
    subtitle: 'راهنمای یکپارچه‌سازی با اینترفیس رزرو آژانس',
    baseUrlLabel: 'آدرس پایه',
    formatLabel: 'قالب داده',
    formatVal: 'همه درخواست‌ها و پاسخ‌ها با فرمت JSON (UTF-8) هستند.',
    rateLabel: 'محدودیت نرخ درخواست',
    rateVal: '۶۰ درخواست در دقیقه به ازای هر کلید API. عبور از این حد، خطای HTTP 429 برمی‌گرداند.',
    authTitle: 'احراز هویت درخواست‌ها',
    authP1: 'کلید API آژانس خود را به‌صورت Bearer token در هدر Authorization هر درخواست ارسال کنید.',
    authP2: 'کلید API شما پس از تأیید و فعال‌شدن پلن، در تب «وب سرویس» در دسترس است.',
    endpointsHint: 'همه مسیرهای زیر نسبت به آدرس پایه ذکرشده در بخش «معرفی» هستند.',
    reqLabel: 'درخواست',
    resLabel: 'پاسخ',
    errorsHint: 'در صورت خطا، بدنه پاسخ شامل یک شیء "error" با همین کد است.',
    lockedHint: 'پس از فعال‌شدن وب‌سرویس در دسترس می‌شود',
    activePlanHint: 'پلن وب‌سرویس شما فعال است — همه متدها در دسترس‌اند.',
    loading: 'در حال بارگذاری…',
  },
  en: {
    title: 'Agency Booking API',
    subtitle: 'Integration guide for the agency booking API',
    baseUrlLabel: 'Base URL',
    formatLabel: 'Data format',
    formatVal: 'All requests and responses use JSON (UTF-8).',
    rateLabel: 'Rate limit',
    rateVal: '60 requests per minute per API key. Exceeding this returns HTTP 429.',
    authTitle: 'Authenticating requests',
    authP1: "Send your agency's API key in the X-API-Key header of every request.",
    authP2: 'Your API key is available in the Web Service tab once your plan is approved and active.',
    endpointsHint: 'All paths below are relative to the base URL shown in the Introduction section.',
    reqLabel: 'Request',
    resLabel: 'Response',
    errorsHint: 'On failure, the response body includes a matching "error" object with this code.',
    lockedHint: 'Available after your web service plan is activated',
    activePlanHint: 'Your web service plan is active — all endpoints are available.',
    loading: 'Loading…',
  },
  ar: {
    title: 'واجهة حجز الوكالة',
    subtitle: 'دليل التكامل مع واجهة حجز الوكالة',
    baseUrlLabel: 'العنوان الأساسي',
    formatLabel: 'تنسيق البيانات',
    formatVal: 'جميع الطلبات والاستجابات بصيغة JSON (UTF-8).',
    rateLabel: 'حد المعدل',
    rateVal: '٦٠ طلباً في الدقيقة لكل مفتاح API. تجاوز ذلك يُرجع HTTP 429.',
    authTitle: 'مصادقة الطلبات',
    authP1: 'أرسل مفتاح API الخاص بوكالتك كـ Bearer token في رأس Authorization لكل طلب.',
    authP2: 'مفتاح API متاح في تبويب خدمة الويب بعد الموافقة على خطتك وتفعيلها.',
    endpointsHint: 'جميع المسارات أدناه نسبةً للعنوان الأساسي في قسم المقدمة.',
    reqLabel: 'الطلب',
    resLabel: 'الاستجابة',
    errorsHint: 'عند الفشل، يتضمن جسم الاستجابة كائناً "error" بهذا الرمز.',
    lockedHint: 'متاح بعد تفعيل خطة خدمة الويب',
    activePlanHint: 'خطة خدمة الويب نشطة — جميع النقاط متاحة.',
    loading: 'جارٍ التحميل…',
  },
};
