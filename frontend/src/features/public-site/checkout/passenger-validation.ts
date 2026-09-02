import { latinDigits } from '../../../lib/fa-format';
import type { StoredLocale } from '../../../hooks/useLocale';
import type { PassengerFormDraft } from './checkout-types';

export type PassengerField =
  'firstNameLatin' | 'lastNameLatin' | 'gender' | 'nationalId' | 'passportNo' | 'birthDate';

export type PassengerFieldErrors = Partial<Record<PassengerField, string>>;

const MESSAGES: Record<StoredLocale, Record<PassengerField | 'invalidNationalId', string>> = {
  fa: {
    firstNameLatin: 'نام را وارد کنید.',
    lastNameLatin: 'نام خانوادگی را وارد کنید.',
    gender: 'جنسیت را انتخاب کنید.',
    nationalId: 'کد ملی را وارد کنید.',
    invalidNationalId: 'کد ملی اشتباه وارد شده است.',
    passportNo: 'شماره گذرنامه را وارد کنید.',
    birthDate: 'تاریخ تولد را کامل وارد کنید.',
  },
  en: {
    firstNameLatin: 'Enter the first name.',
    lastNameLatin: 'Enter the last name.',
    gender: 'Select gender.',
    nationalId: 'Enter the national ID.',
    invalidNationalId: 'The national ID is invalid.',
    passportNo: 'Enter the passport number.',
    birthDate: 'Enter the complete date of birth.',
  },
  ar: {
    firstNameLatin: 'أدخل الاسم.',
    lastNameLatin: 'أدخل اسم العائلة.',
    gender: 'اختر الجنس.',
    nationalId: 'أدخل الرقم الوطني.',
    invalidNationalId: 'الرقم الوطني المدخل غير صحيح.',
    passportNo: 'أدخل رقم جواز السفر.',
    birthDate: 'أدخل تاريخ الميلاد كاملاً.',
  },
};

export function isValidIranianNationalIdInput(value: string): boolean {
  const digits = latinDigits(value).replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits) || /^(\d)\1{9}$/.test(digits)) return false;
  const check = Number(digits[9]);
  const sum = digits
    .slice(0, 9)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return check === (remainder < 2 ? remainder : 11 - remainder);
}

export function validatePassengerFields(
  passenger: PassengerFormDraft,
  locale: StoredLocale,
): PassengerFieldErrors {
  const t = MESSAGES[locale];
  const errors: PassengerFieldErrors = {};
  if (!passenger.firstNameLatin.trim()) errors.firstNameLatin = t.firstNameLatin;
  if (!passenger.lastNameLatin.trim()) errors.lastNameLatin = t.lastNameLatin;
  if (!passenger.gender) errors.gender = t.gender;
  if (!passenger.birthDay || !passenger.birthMonth || !passenger.birthYear) {
    errors.birthDate = t.birthDate;
  }
  if (passenger.docType === 'NATIONAL_ID') {
    if (!passenger.nationalId.trim()) errors.nationalId = t.nationalId;
    else if (!isValidIranianNationalIdInput(passenger.nationalId)) {
      errors.nationalId = t.invalidNationalId;
    }
  } else if (passenger.passportNo.trim().length < 5) {
    errors.passportNo = t.passportNo;
  }
  return errors;
}

export function isPassengerValid(passenger: PassengerFormDraft): boolean {
  return Object.keys(validatePassengerFields(passenger, 'fa')).length === 0;
}
