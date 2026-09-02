export interface PersonNameParts {
  firstName: string;
  lastName: string;
}

export function splitPersonName(
  value: string | null | undefined,
  singlePart: 'first' | 'last' = 'first',
): PersonNameParts {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) {
    return singlePart === 'last'
      ? { firstName: '', lastName: parts[0]! }
      : { firstName: parts[0]!, lastName: '' };
  }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

export function joinPersonName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}
