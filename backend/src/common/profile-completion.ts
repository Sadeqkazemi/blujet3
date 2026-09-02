export const PROFILE_COMPLETION_FIELDS = [
  'fullName',
  'nationalId',
  'birthDate',
  'passportNo',
  'address',
  'verifiedEmail',
] as const;

export type ProfileCompletionField = (typeof PROFILE_COMPLETION_FIELDS)[number];

interface ProfileCompletionSource {
  fullName?: string | null;
  nationalIdEnc?: string | null;
  birthDate?: Date | string | null;
  passportNoEnc?: string | null;
  addressEnc?: string | null;
  emailVerifiedAt?: Date | string | null;
}

export function assessProfileCompletion(source: ProfileCompletionSource) {
  const present: Record<ProfileCompletionField, boolean> = {
    fullName: Boolean(source.fullName?.trim()),
    nationalId: Boolean(source.nationalIdEnc),
    birthDate: Boolean(source.birthDate),
    passportNo: Boolean(source.passportNoEnc),
    address: Boolean(source.addressEnc),
    verifiedEmail: Boolean(source.emailVerifiedAt),
  };
  const missingProfileFields = PROFILE_COMPLETION_FIELDS.filter(
    (field) => !present[field],
  );
  const completionPct = Math.round(
    ((PROFILE_COMPLETION_FIELDS.length - missingProfileFields.length) * 100) /
      PROFILE_COMPLETION_FIELDS.length,
  );
  return {
    completionPct,
    profileIncomplete: missingProfileFields.length > 0,
    missingProfileFields,
  };
}

export function profileIncompleteSql(alias: string): string {
  return `(
    TRIM(COALESCE(${alias}.fullName, '')) = '' OR
    ${alias}.nationalIdEnc IS NULL OR
    ${alias}.birthDate IS NULL OR
    ${alias}.passportNoEnc IS NULL OR
    ${alias}.addressEnc IS NULL OR
    ${alias}.emailVerifiedAt IS NULL
  )`;
}

export function maskIdentityValue(value: string | null): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(value.length - visible.length, 4))}${visible}`;
}
