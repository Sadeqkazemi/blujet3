import type { StoredLocale } from '../../../hooks/useLocale';

export type ResultsCopy = {
  searchResultsLabel: string;
  selectDepartureLabel: string;
  editShortLabel: string;
  editSearchLabel: string;
  routeArrow: string;
  onePassengerEconomy: string;
  aiRadarTitle: string;
  aiRadarSub: string;
  aiAnalyze: string;
  aiAnalyzing: string;
  aiReanalyze: string;
  aiPredictedLabel: string;
  aiBuyNowLabel: string;
  aiWaitLabel: string;
  aiProbLabel: string;
  aiCheaperDayLabel: string;
  aiBestPickLabel: string;
  aiUnavailable: string;
  aiRecommendationBuy: string;
  aiRecommendationWait: string;
  aiPredictedPrice: string;
  sortRecommended: string;
  sortClosest: string;
  sortCheap: string;
  filterLabel: string;
  nonstopLabel: string;
  all: string;
  direct: string;
  oneStop: string;
  timeLabel: string;
  morning: string;
  noon: string;
  evening: string;
  airlineLabel: string;
  flightsCount: (n: number, page: number, pages: number) => string;
  searching: string;
  noResultsTitle: string;
  noResultsSub: string;
  noFlightsForFilters: string;
  clearFilters: string;
  changeSearch: string;
  searchError: string;
  emptyTitle: string;
  emptySub: string;
  goToSearch: string;
  aiRecoLabel: string;
  specialOfferLabel: string;
  detailsBookLabel: string;
  flightDetailsLabel: string;
  automatedLabel: string;
  outboundLabel: string;
  originAirportLabel: string;
  destAirportLabel: string;
  flightNoLabel: string;
  aircraftLabel: string;
  baggageLabel: string;
  cabinLabel: string;
  economyLabel: string;
  comfortLabel: string;
  priceDetailsLabel: string;
  adultPaxLabel: string;
  childPaxLabel: string;
  infantPaxLabel: string;
  selectReturnLabel: string;
  selectOutboundActionLabel: string;
  buyModalTitle: string;
  buyModalContinue: string;
  buyModalSkipSeats: string;
  seatSelectionHint: string;
  yourSelectionLabel: string;
  basePriceLabel: string;
  taxesFeesLabel: string;
  totalLabel: string;
  seatsRemainingLabel: string;
  buyTicketLabel: string;
  aiFareLockGoldLabel: string;
  lowSeatsLabel: string;
  prevLabel: string;
  nextLabel: string;
  toman: string;
  priceLock: string;
  saveFlight: string;
  savedFlight: string;
  smartFareLock: string;
  learnAboutClub: string;
  close: string;
  fareLockGoldOnly: string;
  yourPriceLocked: string;
  lockRateUntil: (price: string, until: string) => string;
  fee: string;
  gotIt: string;
  lockFailedTitle: string;
  fromLabel: string;
  toLabel: string;
  departureDateLabel: string;
  returnDateLabel: string;
  paxCountLabel: string;
  flightClassLabel: string;
  tripOneWay: string;
  tripRoundTrip: string;
  cityQueryPlaceholder: string;
  citiesWithAirportLabel: string;
  noCityFoundLabel: string;
  updatingLabel: string;
  searchFlightsLabel: string;
  applySearchLabel: string;
};

export const RESULTS_COPY: Record<StoredLocale, ResultsCopy> = {
  fa: {
    searchResultsLabel: 'نتایج جستجو',
    selectDepartureLabel: 'انتخاب پرواز رفت',
    editShortLabel: 'ویرایش',
    editSearchLabel: 'ویرایش جستجو',
    routeArrow: '←',
    onePassengerEconomy: '۱ مسافر · اکونومی',
    aiRadarTitle: 'رادار هوشمند قیمت',
    aiRadarSub: 'همین حالا بخرم یا صبر کنم؟',
    aiAnalyze: 'تحلیل قیمت',
    aiAnalyzing: 'در حال تحلیل…',
    aiReanalyze: 'تحلیل مجدد',
    aiPredictedLabel: 'قیمت پیش‌بینی‌شده',
    aiBuyNowLabel: 'همین حالا بخرید',
    aiWaitLabel: 'بهتر است صبر کنید',
    aiProbLabel: 'احتمال افزایش قیمت:',
    aiCheaperDayLabel: 'ارزان‌ترین روز:',
    aiBestPickLabel: 'بهترین گزینه:',
    aiUnavailable: 'برای این مسیر و تاریخ، دادهٔ کافی برای تحلیل وجود ندارد.',
    aiRecommendationBuy: 'همین حالا بخرید',
    aiRecommendationWait: 'بهتر است صبر کنید',
    aiPredictedPrice: 'قیمت پیش‌بینی‌شده',
    sortRecommended: 'پیشنهاد بلوجت',
    sortClosest: 'نزدیک‌ترین',
    sortCheap: 'ارزان‌ترین',
    filterLabel: 'فیلتر',
    nonstopLabel: 'بدون توقف',
    all: 'همه',
    direct: 'مستقیم',
    oneStop: 'یک توقف',
    timeLabel: 'ساعت حرکت',
    morning: 'صبح',
    noon: 'بعدازظهر',
    evening: 'عصر و شب',
    airlineLabel: 'ایرلاین',
    flightsCount: (n, page, pages) => `${n} پرواز · صفحه ${page} از ${pages}`,
    searching: 'در حال جستجو…',
    noResultsTitle: 'پروازی یافت نشد',
    noResultsSub: 'برای این مسیر و تاریخ پروازی موجود نیست — تاریخ یا مقصد را تغییر دهید.',
    noFlightsForFilters: 'پروازی برای این مسیر، تاریخ یا فیلترهای انتخابی موجود نیست. فیلترها را پاک کنید یا تاریخ سفر را تغییر دهید.',
    clearFilters: 'پاک کردن فیلترها',
    changeSearch: 'تغییر جستجو',
    searchError: 'خطا در جستجو — لطفاً دوباره تلاش کنید.',
    emptyTitle: 'جستجوی پرواز',
    emptySub: 'برای دیدن نتایج، ابتدا مبدأ، مقصد و تاریخ سفر را انتخاب کنید.',
    goToSearch: 'رفتن به جستجو',
    aiRecoLabel: 'پیشنهاد هوش مصنوعی',
    specialOfferLabel: 'پیشنهاد ویژه',
    detailsBookLabel: 'جزئیات و رزرو',
    flightDetailsLabel: 'جزئیات پرواز',
    automatedLabel: 'خودکار',
    outboundLabel: 'پرواز رفت',
    originAirportLabel: 'فرودگاه مبدأ',
    destAirportLabel: 'فرودگاه مقصد',
    flightNoLabel: 'شماره پرواز',
    aircraftLabel: 'نوع هواپیما',
    baggageLabel: 'بار مجاز',
    cabinLabel: 'کلاس پروازی',
    economyLabel: 'اکونومی',
    comfortLabel: 'کامفورت',
    priceDetailsLabel: 'جزئیات قیمت',
    adultPaxLabel: 'مسافر بزرگسال (۱)',
    childPaxLabel: 'کودک',
    infantPaxLabel: 'نوزاد',
    selectReturnLabel: 'انتخاب پرواز برگشت',
    selectOutboundActionLabel: 'انتخاب پرواز رفت',
    buyModalTitle: 'انتخاب صندلی',
    buyModalContinue: 'ادامه به تکمیل خرید',
    buyModalSkipSeats: 'ادامه بدون انتخاب صندلی',
    seatSelectionHint: 'انتخاب صندلی اختیاری است؛ می‌توانید بعداً در مرحله خدمات جانبی هم صندلی انتخاب کنید.',
    yourSelectionLabel: 'انتخاب شما',
    basePriceLabel: 'قیمت پایه',
    taxesFeesLabel: 'مالیات و عوارض',
    totalLabel: 'مجموع',
    seatsRemainingLabel: 'صندلی باقیمانده',
    buyTicketLabel: 'خرید بلیط',
    aiFareLockGoldLabel: 'قفل قیمت هوشمند (ویژه اعضای طلایی)',
    lowSeatsLabel: 'تعداد صندلی محدود',
    prevLabel: 'قبلی',
    nextLabel: 'بعدی',
    toman: 'تومان',
    priceLock: 'قفل قیمت',
    saveFlight: 'ذخیره',
    savedFlight: 'ذخیره شد',
    smartFareLock: 'قفل قیمت هوشمند',
    learnAboutClub: 'آشنایی با باشگاه',
    close: 'بستن',
    fareLockGoldOnly: 'قفل قیمت تا ۷۲ ساعت مخصوص اعضای سطح طلایی و بالاتر باشگاه مشتریان است.',
    yourPriceLocked: 'قیمت شما قفل شد',
    lockRateUntil: (price, until) => `نرخ ${price} تومان تا ${until} برای شما ثابت می‌ماند.`,
    fee: 'کارمزد',
    gotIt: 'متوجه شدم',
    lockFailedTitle: 'قفل قیمت ثبت نشد',
    fromLabel: 'مبدا',
    toLabel: 'مقصد',
    departureDateLabel: 'تاریخ رفت',
    returnDateLabel: 'تاریخ برگشت',
    paxCountLabel: 'تعداد مسافر',
    flightClassLabel: 'کلاس پروازی',
    tripOneWay: 'یک‌طرفه',
    tripRoundTrip: 'رفت و برگشت',
    cityQueryPlaceholder: 'شهر یا کد فرودگاه را وارد کنید…',
    citiesWithAirportLabel: 'شهرهای دارای فرودگاه',
    noCityFoundLabel: 'شهری با این نام یافت نشد',
    updatingLabel: 'در حال به‌روزرسانی…',
    searchFlightsLabel: 'جستجوی پرواز',
    applySearchLabel: 'جستجوی پرواز',
  },
  en: {
    searchResultsLabel: 'Search Results',
    selectDepartureLabel: 'Select departure flight',
    editShortLabel: 'Edit',
    editSearchLabel: 'Edit search',
    routeArrow: '→',
    onePassengerEconomy: '1 passenger · Economy',
    aiRadarTitle: 'Smart Price Radar',
    aiRadarSub: 'Buy now or wait?',
    aiAnalyze: 'Analyze price',
    aiAnalyzing: 'Analyzing…',
    aiReanalyze: 'Re-analyze',
    aiPredictedLabel: 'Predicted price',
    aiBuyNowLabel: 'Buy now',
    aiWaitLabel: 'Better to wait',
    aiProbLabel: 'Chance of price increase:',
    aiCheaperDayLabel: 'Cheapest day:',
    aiBestPickLabel: 'Best pick:',
    aiUnavailable: 'Not enough data to analyze this route and date.',
    aiRecommendationBuy: 'Buy now',
    aiRecommendationWait: 'Better to wait',
    aiPredictedPrice: 'Predicted price',
    sortRecommended: 'Blujet recommendation',
    sortClosest: 'Closest',
    sortCheap: 'Cheapest',
    filterLabel: 'Filter',
    nonstopLabel: 'Nonstop',
    all: 'All',
    direct: 'Direct',
    oneStop: '1 stop',
    timeLabel: 'Departure Time',
    morning: 'Morning',
    noon: 'Afternoon',
    evening: 'Evening & night',
    airlineLabel: 'Airline',
    flightsCount: (n, page, pages) => `${n} flights · page ${page} of ${pages}`,
    searching: 'Searching…',
    noResultsTitle: 'No flights found',
    noResultsSub: 'No flights are available for this route and date — try a different date or destination.',
    noFlightsForFilters: 'No flights are available for this route, date, or the selected filters. Clear the filters or change the travel date.',
    clearFilters: 'Clear filters',
    changeSearch: 'Change search',
    searchError: 'Search failed — please try again.',
    emptyTitle: 'Search Flights',
    emptySub: 'Select an origin, destination, and travel date first to see results.',
    goToSearch: 'Go to Search',
    aiRecoLabel: 'AI recommendation',
    specialOfferLabel: 'Special offer',
    detailsBookLabel: 'Details & book',
    flightDetailsLabel: 'Flight details',
    automatedLabel: 'Automated',
    outboundLabel: 'Outbound flight',
    originAirportLabel: 'Origin airport',
    destAirportLabel: 'Destination airport',
    flightNoLabel: 'Flight number',
    aircraftLabel: 'Aircraft type',
    baggageLabel: 'Baggage allowance',
    cabinLabel: 'Cabin',
    economyLabel: 'Economy',
    comfortLabel: 'Comfort',
    priceDetailsLabel: 'Price details',
    adultPaxLabel: 'Adult passenger (1)',
    childPaxLabel: 'Child',
    infantPaxLabel: 'Infant',
    selectReturnLabel: 'Select return flight',
    selectOutboundActionLabel: 'Select outbound flight',
    buyModalTitle: 'Seat selection',
    buyModalContinue: 'Continue to checkout',
    buyModalSkipSeats: 'Continue without seats',
    seatSelectionHint: 'Seat selection is optional; you can also pick seats later during checkout extras.',
    yourSelectionLabel: 'Your selection',
    basePriceLabel: 'Base price',
    taxesFeesLabel: 'Taxes & fees',
    totalLabel: 'Total',
    seatsRemainingLabel: 'Seats remaining',
    buyTicketLabel: 'Buy ticket',
    aiFareLockGoldLabel: 'AI Fare Lock (Gold members only)',
    lowSeatsLabel: 'Limited seats left',
    prevLabel: 'Previous',
    nextLabel: 'Next',
    toman: 'Toman',
    priceLock: 'Price Lock',
    saveFlight: 'Save',
    savedFlight: 'Saved',
    smartFareLock: 'AI Fare Lock',
    learnAboutClub: 'Learn about the Club',
    close: 'Close',
    fareLockGoldOnly: 'Price Lock for up to 72 hours is exclusive to Gold-tier and above loyalty club members.',
    yourPriceLocked: 'Your price is locked',
    lockRateUntil: (price, until) => `Your fare of ${price} Toman is fixed until ${until}.`,
    fee: 'Fee',
    gotIt: 'Got it',
    lockFailedTitle: 'Price Lock failed',
    fromLabel: 'From',
    toLabel: 'To',
    departureDateLabel: 'Departure date',
    returnDateLabel: 'Return date',
    paxCountLabel: 'Passenger count',
    flightClassLabel: 'Flight class',
    tripOneWay: 'One-way',
    tripRoundTrip: 'Round trip',
    cityQueryPlaceholder: 'Type a city or airport code…',
    citiesWithAirportLabel: 'Cities with an airport',
    noCityFoundLabel: 'No city found with that name',
    updatingLabel: 'Updating…',
    searchFlightsLabel: 'Search Flights',
    applySearchLabel: 'Search Flights',
  },
  ar: {
    searchResultsLabel: 'نتائج البحث',
    selectDepartureLabel: 'اختر رحلة الذهاب',
    editShortLabel: 'تعديل',
    editSearchLabel: 'تعديل البحث',
    routeArrow: '←',
    onePassengerEconomy: '1 مسافر · اقتصادية',
    aiRadarTitle: 'رادار الأسعار الذكي',
    aiRadarSub: 'هل أشتري الآن أم أنتظر؟',
    aiAnalyze: 'تحليل السعر',
    aiAnalyzing: 'جارٍ التحليل…',
    aiReanalyze: 'إعادة التحليل',
    aiPredictedLabel: 'السعر المتوقع',
    aiBuyNowLabel: 'اشترِ الآن',
    aiWaitLabel: 'من الأفضل الانتظار',
    aiProbLabel: 'احتمال زيادة السعر:',
    aiCheaperDayLabel: 'أرخص يوم:',
    aiBestPickLabel: 'أفضل خيار:',
    aiUnavailable: 'لا توجد بيانات كافية لتحليل هذا المسار والتاريخ.',
    aiRecommendationBuy: 'اشترِ الآن',
    aiRecommendationWait: 'من الأفضل الانتظار',
    aiPredictedPrice: 'السعر المتوقع',
    sortRecommended: 'اقتراح بلوجت',
    sortClosest: 'الأقرب',
    sortCheap: 'الأرخص',
    filterLabel: 'تصفية',
    nonstopLabel: 'مباشر',
    all: 'الكل',
    direct: 'مباشر',
    oneStop: 'توقف واحد',
    timeLabel: 'وقت المغادرة',
    morning: 'صباحًا',
    noon: 'بعد الظهر',
    evening: 'مساءً وليلاً',
    airlineLabel: 'شركة الطيران',
    flightsCount: (n, page, pages) => `${n} رحلة · صفحة ${page} من ${pages}`,
    searching: 'جارٍ البحث…',
    noResultsTitle: 'لم يتم العثور على رحلات',
    noResultsSub: 'لا توجد رحلات متاحة لهذا المسار والتاريخ — جرّب تاريخًا أو وجهة مختلفة.',
    noFlightsForFilters: 'لا توجد رحلات لهذا المسار أو التاريخ أو الفلاتر المحددة. امسح الفلاتر أو غيّر تاريخ السفر.',
    clearFilters: 'مسح الفلاتر',
    changeSearch: 'تغيير البحث',
    searchError: 'فشل البحث — يرجى المحاولة مرة أخرى.',
    emptyTitle: 'البحث عن رحلات',
    emptySub: 'اختر المبدأ والمقصد وتاريخ السفر أولاً لعرض النتائج.',
    goToSearch: 'الذهاب إلى البحث',
    aiRecoLabel: 'توصية الذكاء الاصطناعي',
    specialOfferLabel: 'عرض خاص',
    detailsBookLabel: 'التفاصيل والحجز',
    flightDetailsLabel: 'تفاصيل الرحلة',
    automatedLabel: 'آلي',
    outboundLabel: 'رحلة الذهاب',
    originAirportLabel: 'مطار المغادرة',
    destAirportLabel: 'مطار الوصول',
    flightNoLabel: 'رقم الرحلة',
    aircraftLabel: 'نوع الطائرة',
    baggageLabel: 'حد الأمتعة',
    cabinLabel: 'الدرجة',
    economyLabel: 'اقتصادية',
    comfortLabel: 'كومفورت',
    priceDetailsLabel: 'تفاصيل السعر',
    adultPaxLabel: 'مسافر بالغ (١)',
    childPaxLabel: 'طفل',
    infantPaxLabel: 'رضيع',
    selectReturnLabel: 'اختر رحلة العودة',
    selectOutboundActionLabel: 'اختر رحلة الذهاب',
    buyModalTitle: 'اختيار المقعد',
    buyModalContinue: 'المتابعة إلى إتمام الشراء',
    buyModalSkipSeats: 'المتابعة دون اختيار مقعد',
    seatSelectionHint: 'اختيار المقعد اختياري؛ يمكنك أيضاً اختيار المقاعد لاحقاً في خطوة الخدمات الإضافية.',
    yourSelectionLabel: 'اختيارك',
    basePriceLabel: 'السعر الأساسي',
    taxesFeesLabel: 'الضرائب والرسوم',
    totalLabel: 'المجموع',
    seatsRemainingLabel: 'المقاعد المتبقية',
    buyTicketLabel: 'شراء التذكرة',
    aiFareLockGoldLabel: 'قفل السعر الذكي (للأعضاء الذهبيين فقط)',
    lowSeatsLabel: 'مقاعد محدودة',
    prevLabel: 'السابق',
    nextLabel: 'التالي',
    toman: 'تومان',
    priceLock: 'قفل السعر',
    saveFlight: 'حفظ',
    savedFlight: 'محفوظ',
    smartFareLock: 'قفل السعر الذكي',
    learnAboutClub: 'تعرف على النادي',
    close: 'إغلاق',
    fareLockGoldOnly: 'قفل السعر حتى ٧٢ ساعة حصري لأعضاء الفئة الذهبية فما فوق في نادي العملاء.',
    yourPriceLocked: 'تم قفل سعرك',
    lockRateUntil: (price, until) => `سعرك ${price} تومان ثابت حتى ${until}.`,
    fee: 'رسوم',
    gotIt: 'حسنًا',
    lockFailedTitle: 'تعذّر تسجيل قفل السعر',
    fromLabel: 'من',
    toLabel: 'إلى',
    departureDateLabel: 'تاريخ المغادرة',
    returnDateLabel: 'تاريخ العودة',
    paxCountLabel: 'عدد المسافرين',
    flightClassLabel: 'درجة الرحلة',
    tripOneWay: 'ذهاب فقط',
    tripRoundTrip: 'ذهاب وعودة',
    cityQueryPlaceholder: 'اكتب اسم المدينة أو رمز المطار…',
    citiesWithAirportLabel: 'مدن بها مطار',
    noCityFoundLabel: 'لم يتم العثور على مدينة بهذا الاسم',
    updatingLabel: 'جارٍ التحديث…',
    searchFlightsLabel: 'البحث عن رحلات',
    applySearchLabel: 'البحث عن رحلات',
  },
};

export const ADVISORY_REASON: Record<string, Record<StoredLocale, string>> = {
  wait_nearby_cheaper: {
    fa: 'قیمت این مسیر در روزهای نزدیک پایین‌تر است — اگر انعطاف دارید کمی صبر کنید.',
    en: 'Prices on this route are lower on nearby days — if you are flexible, wait a bit.',
    ar: 'أسعار هذا المسار أقل في الأيام القريبة — إذا كان لديك مرونة، انتظر قليلاً.',
  },
  buy_good_price: {
    fa: 'قیمت امروز در محدوده مناسب است — برای سفر قطعی همین حالا بخرید.',
    en: "Today's price is in a good range — buy now if your travel dates are fixed.",
    ar: 'سعر اليوم في نطاق جيد — اشترِ الآن إذا كانت تواريخ سفرك ثابتة.',
  },
};

export function translateAdvisoryReason(
  reasonFa: string | undefined,
  locale: StoredLocale,
  recommendation: 'buy' | 'wait' = 'buy',
): string {
  if (!reasonFa) return '';
  if (locale === 'fa') return reasonFa;
  if (reasonFa.includes('روزهای نزدیک پایین‌تر')) return ADVISORY_REASON.wait_nearby_cheaper[locale];
  if (reasonFa.includes('محدوده مناسب')) return ADVISORY_REASON.buy_good_price[locale];
  return ADVISORY_REASON[
    recommendation === 'wait' ? 'wait_nearby_cheaper' : 'buy_good_price'
  ][locale];
}
