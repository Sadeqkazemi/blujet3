import type {
  TravelExtraBillingUnit,
  TravelExtraCode,
} from '../../database/entities/travel-extra-setting.entity';
import { AncillaryServiceCategory } from '../../database/enums';

export interface AncillaryBuiltInSeed {
  key: string;
  category: AncillaryServiceCategory;
  titleFa: string;
  descriptionFa: string;
  priceIrr: bigint;
  enabled: boolean;
  travelExtra?: {
    code: TravelExtraCode;
    billingUnit: TravelExtraBillingUnit;
  };
}

/** Exact Persian copy from frontend/src/api/ancillary-services-mock.ts. */
export const ANCILLARY_BUILT_IN_SERVICES: readonly AncillaryBuiltInSeed[] = [
  {
    key: 'seat-normal',
    category: AncillaryServiceCategory.SEAT,
    titleFa: 'صندلی عادی',
    descriptionFa: 'صندلی استاندارد بدون هزینه اضافه',
    priceIrr: 0n,
    enabled: true,
  },
  {
    key: 'seat-legroom',
    category: AncillaryServiceCategory.SEAT,
    titleFa: 'صندلی با فضای پای بیشتر',
    descriptionFa: 'ردیف خروج اضطراری یا ردیف اول',
    priceIrr: 3_500_000n,
    enabled: true,
  },
  {
    key: 'seat-window-aisle',
    category: AncillaryServiceCategory.SEAT,
    titleFa: 'صندلی کنار پنجره یا راهرو',
    descriptionFa: 'انتخاب موقعیت دلخواه صندلی',
    priceIrr: 1_500_000n,
    enabled: true,
  },
  {
    key: 'baggage',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'بار اضافه',
    descriptionFa: 'هر ۵ کیلوگرم بار اضافه بر مجاز',
    priceIrr: 2_000_000n,
    enabled: true,
    travelExtra: { code: 'EXTRA_BAGGAGE', billingUnit: 'PER_KG' },
  },
  {
    key: 'meal',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'وعده غذایی ویژه',
    descriptionFa: 'وعده غذایی گرم در پروازهای بلندمدت',
    priceIrr: 1_200_000n,
    enabled: true,
    travelExtra: { code: 'SPECIAL_MEAL', billingUnit: 'PER_PASSENGER' },
  },
  {
    key: 'insurance',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'بیمه مسافرتی',
    descriptionFa: 'پوشش بیمه سفر برای هر مسافر',
    priceIrr: 900_000n,
    enabled: true,
    travelExtra: { code: 'TRAVEL_INSURANCE', billingUnit: 'PER_PASSENGER' },
  },
  {
    key: 'cip',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'خدمات CIP فرودگاهی',
    descriptionFa: 'ترانزیت اختصاصی و سالن ویژه فرودگاه',
    priceIrr: 15_000_000n,
    enabled: false,
    travelExtra: { code: 'CIP', billingUnit: 'PER_BOOKING' },
  },
  {
    key: 'refund-fee',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'هزینه استرداد بلیط',
    descriptionFa: 'کسر از مبلغ استرداد طبق قوانین بلیط',
    priceIrr: 500_000n,
    enabled: true,
    travelExtra: { code: 'REFUND_FEE', billingUnit: 'PER_BOOKING' },
  },
  {
    key: 'pet',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'حمل حیوان خانگی',
    descriptionFa: 'حمل حیوان خانگی در کابین یا انبار',
    priceIrr: 2_500_000n,
    enabled: true,
    travelExtra: { code: 'PET', billingUnit: 'PER_BOOKING' },
  },
  {
    key: 'wheelchair',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'خدمات ویلچر',
    descriptionFa: 'درخواست ویلچر در فرودگاه مبدأ و مقصد',
    priceIrr: 0n,
    enabled: true,
  },
  {
    key: 'seat-selection',
    category: AncillaryServiceCategory.OTHER,
    titleFa: 'انتخاب صندلی از پیش',
    descriptionFa: 'انتخاب شماره صندلی هنگام رزرو',
    priceIrr: 800_000n,
    enabled: true,
    travelExtra: { code: 'SEAT_SELECTION', billingUnit: 'PER_PASSENGER' },
  },
];

export const ANCILLARY_TRAVEL_EXTRA_BY_KEY: ReadonlyMap<
  string,
  NonNullable<AncillaryBuiltInSeed['travelExtra']>
> = new Map(
  ANCILLARY_BUILT_IN_SERVICES.filter((row) => row.travelExtra).map((row) => [
    row.key,
    row.travelExtra!,
  ]),
);

export const ANCILLARY_KEY_BY_TRAVEL_EXTRA: ReadonlyMap<
  TravelExtraCode,
  string
> = new Map(
  ANCILLARY_BUILT_IN_SERVICES.filter((row) => row.travelExtra).map((row) => [
    row.travelExtra!.code,
    row.key,
  ]),
);
