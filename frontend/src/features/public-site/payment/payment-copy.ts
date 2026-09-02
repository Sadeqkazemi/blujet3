import type { StoredLocale } from '../../../hooks/useLocale';

/** Strings aligned with design-reference-v2/تکمیل خرید.dc.html payment step. */
export const PAYMENT_COPY: Record<
  StoredLocale,
  {
    title: string;
    payment: string;
    gatewayTitle: string;
    gatewaySub: string;
    gatewayTag: string;
    walletTitle: string;
    walletBalance: (amount: string) => string;
    pointsTitle: string;
    pointsBalance: (amount: string) => string;
    discountPlaceholder: string;
    applyCode: string;
    pointsHint: string;
    paymentDetails: string;
    description: string;
    amountToman: string;
    ticketPrice: (count: number) => string;
    taxesFees: string;
    total: string;
    securePayment: string;
    payWithAmount: (amount: string) => string;
    payFinal: string;
    holdRemaining: string;
    clubCalc: string;
    currentPoints: string;
    earnPoints: string;
    pointsAfter: string;
    pointsUnit: string;
    payTerms: string;
    loading: string;
    notFound: string;
    expired: string;
    searchAgain: string;
    paying: string;
    payError: string;
    priceChanged: string;
    newPrice: (amount: string) => string;
    confirmNewPrice: string;
    toman: string;
  }
> = {
  fa: {
    title: 'تکمیل خرید',
    payment: 'پرداخت',
    gatewayTitle: 'درگاه بانکی (شتاب)',
    gatewaySub: 'پرداخت آنلاین با هر کارت شتابی',
    gatewayTag: 'پیشنهادی',
    walletTitle: 'کیف پول blujet',
    walletBalance: (amount) => `موجودی: ${amount} تومان`,
    pointsTitle: 'پرداخت با امتیاز باشگاه',
    pointsBalance: (amount) => `موجودی: ${amount} امتیاز`,
    discountPlaceholder: 'کد تخفیف',
    applyCode: 'اعمال کد',
    pointsHint: 'پرداخت با امتیاز باشگاه با انتخاب همان روش در بالا محاسبه می‌شود.',
    paymentDetails: 'جزئیات پرداخت',
    description: 'شرح',
    amountToman: 'مبلغ (تومان)',
    ticketPrice: (n) => `قیمت بلیط (بزرگسال × ${n})`,
    taxesFees: 'مالیات و عوارض',
    total: 'مجموع',
    securePayment: 'پرداخت امن و رمزگذاری‌شده',
    payWithAmount: (amount) => `پرداخت ${amount} تومان`,
    payFinal: 'پرداخت نهایی',
    holdRemaining: '⏱ زمان باقی‌مانده رزرو',
    clubCalc: '🏅 محاسبه امتیاز باشگاه',
    currentPoints: 'موجودی فعلی',
    earnPoints: 'امتیاز قابل کسب از این خرید',
    pointsAfter: 'موجودی بعد از خرید',
    pointsUnit: 'امتیاز',
    payTerms: 'با کلیک روی پرداخت، قوانین و مقررات blujet را می‌پذیرید.',
    loading: 'در حال بارگذاری…',
    notFound: 'رزرو یافت نشد.',
    expired: 'مهلت نگهداری این رزرو به پایان رسیده است.',
    searchAgain: 'جستجوی مجدد',
    paying: 'در حال پرداخت…',
    payError: 'خطا در پرداخت.',
    priceChanged: 'قیمت این پرواز تغییر کرده است.',
    newPrice: (amount) => `قیمت جدید: ${amount} تومان`,
    confirmNewPrice: 'تأیید قیمت جدید و پرداخت',
    toman: 'تومان',
  },
  en: {
    title: 'Complete purchase',
    payment: 'Payment',
    gatewayTitle: 'Bank gateway (Shetab)',
    gatewaySub: 'Pay online with any Shetab card',
    gatewayTag: 'Recommended',
    walletTitle: 'blujet wallet',
    walletBalance: (amount) => `Balance: ${amount} Toman`,
    pointsTitle: 'Pay with club points',
    pointsBalance: (amount) => `Balance: ${amount} points`,
    discountPlaceholder: 'Discount code',
    applyCode: 'Apply code',
    pointsHint: 'Paying with club points is calculated by selecting that method above.',
    paymentDetails: 'Payment details',
    description: 'Description',
    amountToman: 'Amount (Toman)',
    ticketPrice: (n) => `Ticket price (Adult × ${n})`,
    taxesFees: 'Taxes & fees',
    total: 'Total',
    securePayment: 'Secure, encrypted payment',
    payWithAmount: (amount) => `Pay ${amount} Toman`,
    payFinal: 'Pay now',
    holdRemaining: '⏱ Hold time remaining',
    clubCalc: '🏅 Club points calculation',
    currentPoints: 'Current balance',
    earnPoints: 'Points earned from this purchase',
    pointsAfter: 'Balance after purchase',
    pointsUnit: 'points',
    payTerms: 'By clicking pay, you accept blujet terms and conditions.',
    loading: 'Loading…',
    notFound: 'Booking not found.',
    expired: 'The hold on this booking has expired.',
    searchAgain: 'Search again',
    paying: 'Processing payment…',
    payError: 'Payment failed.',
    priceChanged: 'The price for this flight has changed.',
    newPrice: (amount) => `New price: ${amount} Toman`,
    confirmNewPrice: 'Confirm new price and pay',
    toman: 'Toman',
  },
  ar: {
    title: 'إتمام الشراء',
    payment: 'الدفع',
    gatewayTitle: 'بوابة بنكية (شتاب)',
    gatewaySub: 'الدفع عبر الإنترنت بأي بطاقة شتاب',
    gatewayTag: 'موصى به',
    walletTitle: 'محفظة blujet',
    walletBalance: (amount) => `الرصيد: ${amount} تومان`,
    pointsTitle: 'الدفع بنقاط النادي',
    pointsBalance: (amount) => `الرصيد: ${amount} نقطة`,
    discountPlaceholder: 'رمز الخصم',
    applyCode: 'تطبيق الرمز',
    pointsHint: 'يُحتسب الدفع بنقاط الولاء عند اختيار تلك الطريقة أعلاه.',
    paymentDetails: 'تفاصيل الدفع',
    description: 'الوصف',
    amountToman: 'المبلغ (تومان)',
    ticketPrice: (n) => `سعر التذكرة (بالغ × ${n})`,
    taxesFees: 'الضرائب والرسوم',
    total: 'المجموع',
    securePayment: 'دفع آمن ومشفّر',
    payWithAmount: (amount) => `دفع ${amount} تومان`,
    payFinal: 'الدفع النهائي',
    holdRemaining: '⏱ الوقت المتبقي للحجز',
    clubCalc: '🏅 حساب نقاط النادي',
    currentPoints: 'الرصيد الحالي',
    earnPoints: 'النقاط المكتسبة من هذا الشراء',
    pointsAfter: 'الرصيد بعد الشراء',
    pointsUnit: 'نقطة',
    payTerms: 'بالنقر على الدفع، فإنك تقبل شروط وأحكام blujet.',
    loading: 'جارٍ التحميل…',
    notFound: 'لم يُعثر على الحجز.',
    expired: 'انتهت مهلة الاحتفاظ بهذا الحجز.',
    searchAgain: 'بحث مجدداً',
    paying: 'جارٍ الدفع…',
    payError: 'فشل الدفع.',
    priceChanged: 'تغیّر سعر هذه الرحلة.',
    newPrice: (amount) => `السعر الجديد: ${amount} تومان`,
    confirmNewPrice: 'تأكيد السعر الجديد والدفع',
    toman: 'تومان',
  },
};
