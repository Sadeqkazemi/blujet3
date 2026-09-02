/** Normalize Iranian IBAN (شبا) to `IR` + 24 digits. */
export function normalizeSheba(input: string): string {
  const digits = input
    .trim()
    .toUpperCase()
    .replace(/^IR/i, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '');
  return `IR${digits}`;
}

export function isValidSheba(input: string): boolean {
  const iban = normalizeSheba(input);
  if (!/^IR\d{24}$/.test(iban)) return false;
  // ISO 13616 mod-97 check
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(`${remainder}${numeric.slice(i, i + 7)}`) % 97;
  }
  return remainder === 1;
}

export function normalizeCardPan(input: string): string {
  return input
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '');
}

export function maskCardPan(pan: string): string {
  if (pan.length !== 16) return '•••• •••• •••• ••••';
  return `${pan.slice(0, 4)} ${pan.slice(4, 8)} •••• ${pan.slice(-4)}`;
}

export function maskSheba(iban: string): string {
  const digits = iban.replace(/^IR/i, '');
  if (digits.length !== 24) return '••••';
  return `${digits.slice(0, 6)}•••${digits.slice(-4)}`;
}

const BANK_BY_BIN: Record<
  string,
  { name: string; short: string; color: string }
> = {
  '6104': { name: 'بانک ملت', short: 'ملت', color: '#d6336c' },
  '6219': { name: 'بانک سامان', short: 'سامان', color: '#1c7ed6' },
  '6037': { name: 'بانک ملی', short: 'ملی', color: '#0d6efd' },
  '5022': { name: 'بانک پاسارگاد', short: 'پاسارگاد', color: '#b8860b' },
  '6274': { name: 'بانک پارسیان', short: 'پارسیان', color: '#6f42c1' },
};

export function guessBankFromPan(pan: string): {
  bankName: string;
  bankShort: string;
  brandColor: string;
} {
  const bin = pan.slice(0, 4);
  const hit = BANK_BY_BIN[bin];
  if (hit)
    return { bankName: hit.name, bankShort: hit.short, brandColor: hit.color };
  return { bankName: 'بانک', bankShort: bin, brandColor: '#1668c4' };
}
