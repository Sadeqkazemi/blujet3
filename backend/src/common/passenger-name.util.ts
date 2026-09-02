/** Normalizes a name token for comparison — trims and lowercases so Latin
 * family names match case-insensitively while Persian tokens stay stable. */
export function normalizeNameToken(token: string): string {
  return token.trim().toLocaleLowerCase('fa');
}

/** Matches an anonymous "last name" input against the last
 * whitespace-separated token of a passenger's stored full name — the
 * credential standard airline "manage my booking" self-service uses
 * alongside the PNR. */
export function matchesLastName(fullName: string, lastName: string): boolean {
  const parts = fullName.trim().split(/\s+/);
  const familyName = parts[parts.length - 1] ?? '';
  return normalizeNameToken(familyName) === normalizeNameToken(lastName);
}
