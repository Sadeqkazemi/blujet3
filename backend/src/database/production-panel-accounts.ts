import { randomBytes } from 'node:crypto';
import { normalizeIranPhone } from '../common/normalize-iran-phone';
import type { Role } from './enums';

export const PANEL_ACCOUNT_ROLES = [
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
] as const satisfies readonly Role[];

export interface PanelAccountInput {
  fullName: string;
  username: string;
  role: (typeof PANEL_ACCOUNT_ROLES)[number];
  phone: string;
  email: string | null;
}

export interface PanelAccountDryRun {
  username: string;
  role: PanelAccountInput['role'];
}

const roleSet = new Set<string>(PANEL_ACCOUNT_ROLES);
const usernamePattern = /^[a-z][a-z0-9._-]{2,63}$/;
const iranMobilePattern = /^\+989\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireString(
  record: Record<string, unknown>,
  field: string,
  index: number,
): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Account ${index + 1}: ${field} is required.`);
  }
  return value.trim();
}

function assertUnique(
  accounts: PanelAccountInput[],
  field: 'username' | 'phone' | 'email',
): void {
  const seen = new Set<string>();
  for (const account of accounts) {
    const value = account[field];
    if (value === null) continue;
    if (seen.has(value)) {
      throw new Error(`Duplicate ${field} in input: ${value}`);
    }
    seen.add(value);
  }
}

export function parsePanelAccountsJson(raw: string): PanelAccountInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Input must be valid JSON.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Input must be a non-empty JSON array.');
  }
  if (parsed.length > 50) {
    throw new Error('At most 50 panel accounts may be bootstrapped at once.');
  }

  const accounts = parsed.map((value, index): PanelAccountInput => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Account ${index + 1}: expected a JSON object.`);
    }
    const record = value as Record<string, unknown>;
    const fullName = requireString(record, 'fullName', index);
    const username = requireString(record, 'username', index).toLowerCase();
    const role = requireString(record, 'role', index);
    const phone = normalizeIranPhone(requireString(record, 'phone', index));
    const rawEmail = record.email;
    const email =
      rawEmail === undefined || rawEmail === null || rawEmail === ''
        ? null
        : typeof rawEmail === 'string'
          ? rawEmail.trim().toLowerCase()
          : (() => {
              throw new Error(`Account ${index + 1}: email must be a string.`);
            })();

    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error(
        `Account ${index + 1}: fullName must contain 2 to 120 characters.`,
      );
    }
    if (!usernamePattern.test(username)) {
      throw new Error(
        `Account ${index + 1}: username must be 3-64 lowercase Latin characters and may include digits, dot, underscore, or hyphen.`,
      );
    }
    if (!roleSet.has(role)) {
      throw new Error(`Account ${index + 1}: unsupported panel role ${role}.`);
    }
    if (!iranMobilePattern.test(phone)) {
      throw new Error(
        `Account ${index + 1}: phone must be a valid Iranian mobile number.`,
      );
    }
    if (email !== null && !emailPattern.test(email)) {
      throw new Error(`Account ${index + 1}: email is invalid.`);
    }

    return {
      fullName,
      username,
      role: role as PanelAccountInput['role'],
      phone,
      email,
    };
  });

  assertUnique(accounts, 'username');
  assertUnique(accounts, 'phone');
  assertUnique(accounts, 'email');
  return accounts;
}

export function toPanelAccountDryRun(
  accounts: PanelAccountInput[],
): PanelAccountDryRun[] {
  return accounts.map(({ username, role }) => ({ username, role }));
}

export function generatePanelTemporaryPassword(): string {
  // The fixed prefix guarantees every generated value contains uppercase,
  // lowercase, number, and symbol classes. The random suffix carries 144 bits.
  return `Bj!7-${randomBytes(18).toString('base64url')}`;
}
