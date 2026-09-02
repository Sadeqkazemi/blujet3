import {
  createSavedPassenger,
  fetchMyProfile,
  fetchSavedPassengers,
  updateMyProfile,
} from '../../../api/publicSite';
import type { StoredLocale } from '../../../hooks/useLocale';
import { parseLocaleDateToIso } from '../../../lib/locale-format';
import type { SavedPassenger, UserProfile } from '../../../types/public-site';
import { passengerFullName, type PassengerFormDraft } from './checkout-types';

type CreateSavedPassengerInput = Parameters<typeof createSavedPassenger>[0];
type UpdateProfileInput = Parameters<typeof updateMyProfile>[0];

interface GuestProfileDependencies {
  fetchProfile: () => Promise<UserProfile>;
  updateProfile: (input: UpdateProfileInput) => Promise<unknown>;
  fetchSavedPassengers: () => Promise<SavedPassenger[]>;
  createSavedPassenger: (input: CreateSavedPassengerInput) => Promise<unknown>;
}

const defaultDependencies: GuestProfileDependencies = {
  fetchProfile: fetchMyProfile,
  updateProfile: updateMyProfile,
  fetchSavedPassengers,
  createSavedPassenger,
};

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleUpperCase('en');
}

function isPlaceholderName(value: string): boolean {
  const compact = value.replace(/[\s()+-]/g, '');
  return !value.trim() || /^\d{10,15}$/.test(compact);
}

/**
 * After an OTP sign-in from checkout, complete only missing account identity
 * fields from the first adult and save that passenger once. Existing profile
 * values are never overwritten by a booking passenger.
 */
export async function syncGuestPrimaryProfile(
  passengers: PassengerFormDraft[],
  locale: StoredLocale,
  dependencies: GuestProfileDependencies = defaultDependencies,
): Promise<void> {
  const primary = passengers.find((passenger) => passenger.passengerType === 'ADULT');
  if (!primary) return;

  const fullName = passengerFullName(primary);
  const birthDate = parseLocaleDateToIso(
    `${primary.birthYear}/${primary.birthMonth}/${primary.birthDay}`,
    locale,
  )?.slice(0, 10);
  if (!fullName || !birthDate || !primary.gender) return;

  const [profile, savedPassengers] = await Promise.all([
    dependencies.fetchProfile(),
    dependencies.fetchSavedPassengers(),
  ]);

  const profilePatch: UpdateProfileInput = {};
  if (
    profile.missingProfileFields.includes('fullName') ||
    isPlaceholderName(profile.fullName)
  ) {
    profilePatch.fullName = fullName;
  }
  if (!profile.nationalId && primary.docType === 'NATIONAL_ID' && primary.nationalId) {
    profilePatch.nationalId = primary.nationalId;
  }
  if (!profile.passportNo && primary.docType === 'PASSPORT' && primary.passportNo) {
    profilePatch.passportNo = primary.passportNo;
  }
  if (!profile.birthDate) profilePatch.birthDate = birthDate;

  if (Object.keys(profilePatch).length > 0) {
    await dependencies.updateProfile(profilePatch);
  }

  const nationalId = primary.docType === 'NATIONAL_ID' ? primary.nationalId : undefined;
  const passportNo = primary.docType === 'PASSPORT' ? primary.passportNo : undefined;
  const alreadySaved = savedPassengers.some((saved) =>
    (nationalId && normalize(saved.nationalId) === normalize(nationalId)) ||
    (passportNo && normalize(saved.passportNo) === normalize(passportNo)) ||
    normalize(saved.latinName) === normalize(fullName),
  );
  if (alreadySaved) return;

  await dependencies.createSavedPassenger({
    fullName,
    latinName: fullName,
    gender: primary.gender,
    birthDate,
    nationalId,
    passportNo,
    isChild: false,
  });
}
