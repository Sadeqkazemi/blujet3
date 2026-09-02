import { CabinClass } from '../../database/enums';

export const STANDARD_CABIN_CLASS_CODE: Record<CabinClass, string> = {
  [CabinClass.FIRST]: 'F',
  [CabinClass.BUSINESS]: 'C',
  [CabinClass.COMFORT]: 'W',
  [CabinClass.ECONOMY]: 'Y',
};

export function standardClassCode(cabin: CabinClass): string {
  return STANDARD_CABIN_CLASS_CODE[cabin];
}

export function findDuplicateClassCode(
  classCodes: Iterable<string>,
): string | null {
  const seen = new Set<string>();
  for (const value of classCodes) {
    const normalized = value.trim().toUpperCase();
    if (seen.has(normalized)) return normalized;
    seen.add(normalized);
  }
  return null;
}
