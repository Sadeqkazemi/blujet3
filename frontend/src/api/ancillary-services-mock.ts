/**
 * TEMP/DEV ONLY — fixture adapter. Production pages import
 * `api/ancillary-services.ts`. LocalStorage is not used by production.
 */
import type { AncillaryServiceRow, SeatServiceRow } from '../types/ancillary-services';

const STORAGE_KEY = 'blujet_temp_mock_ancillary_services_v1';

interface MockState {
  seatServices: SeatServiceRow[];
  otherServices: AncillaryServiceRow[];
}

function seed(): MockState {
  return {
    seatServices: [
      { key: 'seat-normal', titleFa: 'صندلی عادی', descriptionFa: 'صندلی استاندارد بدون هزینه اضافه', priceIrr: '0', enabled: true },
      { key: 'seat-legroom', titleFa: 'صندلی با فضای پای بیشتر', descriptionFa: 'ردیف خروج اضطراری یا ردیف اول', priceIrr: '3500000', enabled: true },
      { key: 'seat-window-aisle', titleFa: 'صندلی کنار پنجره یا راهرو', descriptionFa: 'انتخاب موقعیت دلخواه صندلی', priceIrr: '1500000', enabled: true },
    ],
    otherServices: [
      { key: 'baggage', titleFa: 'بار اضافه', descriptionFa: 'هر ۵ کیلوگرم بار اضافه بر مجاز', priceIrr: '2000000', enabled: true, isCustom: false },
      { key: 'meal', titleFa: 'وعده غذایی ویژه', descriptionFa: 'وعده غذایی گرم در پروازهای بلندمدت', priceIrr: '1200000', enabled: true, isCustom: false },
      { key: 'insurance', titleFa: 'بیمه مسافرتی', descriptionFa: 'پوشش بیمه سفر برای هر مسافر', priceIrr: '900000', enabled: true, isCustom: false },
      { key: 'cip', titleFa: 'خدمات CIP فرودگاهی', descriptionFa: 'ترانزیت اختصاصی و سالن ویژه فرودگاه', priceIrr: '15000000', enabled: false, isCustom: false },
      { key: 'refund-fee', titleFa: 'هزینه استرداد بلیط', descriptionFa: 'کسر از مبلغ استرداد طبق قوانین بلیط', priceIrr: '500000', enabled: true, isCustom: false },
      { key: 'pet', titleFa: 'حمل حیوان خانگی', descriptionFa: 'حمل حیوان خانگی در کابین یا انبار', priceIrr: '2500000', enabled: false, isCustom: false },
      { key: 'wheelchair', titleFa: 'خدمات ویلچر', descriptionFa: 'درخواست ویلچر در فرودگاه مبدأ و مقصد', priceIrr: '0', enabled: true, isCustom: false },
      { key: 'seat-selection', titleFa: 'انتخاب صندلی از پیش', descriptionFa: 'انتخاب شماره صندلی هنگام رزرو', priceIrr: '800000', enabled: true, isCustom: false },
    ],
  };
}

function load(): MockState {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    return JSON.parse(raw) as MockState;
  } catch {
    return seed();
  }
}

function persist(state: MockState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode/quota) — edits just won't survive reload.
  }
}

export async function fetchSeatServices(): Promise<SeatServiceRow[]> {
  return load().seatServices;
}

export async function fetchOtherServices(): Promise<AncillaryServiceRow[]> {
  return load().otherServices;
}

export async function setSeatServicePrice(key: string, priceIrr: string): Promise<SeatServiceRow[]> {
  const state = load();
  state.seatServices = state.seatServices.map((s) => (s.key === key ? { ...s, priceIrr } : s));
  persist(state);
  return state.seatServices;
}

export async function toggleSeatService(key: string): Promise<SeatServiceRow[]> {
  const state = load();
  state.seatServices = state.seatServices.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s));
  persist(state);
  return state.seatServices;
}

export async function setOtherServicePrice(key: string, priceIrr: string): Promise<AncillaryServiceRow[]> {
  const state = load();
  state.otherServices = state.otherServices.map((s) => (s.key === key ? { ...s, priceIrr } : s));
  persist(state);
  return state.otherServices;
}

export async function toggleOtherService(key: string): Promise<AncillaryServiceRow[]> {
  const state = load();
  state.otherServices = state.otherServices.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s));
  persist(state);
  return state.otherServices;
}

export async function addCustomService(input: {
  titleFa: string;
  descriptionFa: string;
  priceIrr: string;
}): Promise<AncillaryServiceRow[]> {
  const state = load();
  const key = `custom-${Date.now()}`;
  state.otherServices = [
    ...state.otherServices,
    { key, titleFa: input.titleFa, descriptionFa: input.descriptionFa, priceIrr: input.priceIrr, enabled: true, isCustom: true },
  ];
  persist(state);
  return state.otherServices;
}

export async function deleteCustomService(key: string): Promise<AncillaryServiceRow[]> {
  const state = load();
  state.otherServices = state.otherServices.filter((s) => s.key !== key);
  persist(state);
  return state.otherServices;
}
