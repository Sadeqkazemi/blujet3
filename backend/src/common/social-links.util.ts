/** Predefined social networks editable from the IT Manager settings tab. */

export const SOCIAL_LINK_IDS = [
  'instagram',
  'telegram',
  'whatsapp',
  'linkedin',
  'x',
] as const;

export type SocialLinkId = (typeof SOCIAL_LINK_IDS)[number];

export interface SocialLinkEntry {
  id: SocialLinkId;
  name: string;
  url: string;
  enabled: boolean;
}

export const DEFAULT_SOCIAL_LINKS: SocialLinkEntry[] = [
  { id: 'instagram', name: 'اینستاگرام', url: '', enabled: false },
  { id: 'telegram', name: 'تلگرام', url: '', enabled: false },
  { id: 'whatsapp', name: 'واتساپ', url: '', enabled: false },
  { id: 'linkedin', name: 'لینکدین', url: '', enabled: false },
  { id: 'x', name: 'ایکس (توییتر)', url: '', enabled: false },
];

const URL_MAX_LEN = 500;
const NAME_MAX_LEN = 80;

export function normalizeSocialUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Validates and merges a patch against defaults — unknown ids rejected. */
export function parseSocialLinks(input: unknown): SocialLinkEntry[] {
  if (!Array.isArray(input)) {
    throw new Error('socialLinks must be an array');
  }
  const byId = new Map<SocialLinkId, SocialLinkEntry>();
  for (const def of DEFAULT_SOCIAL_LINKS) {
    byId.set(def.id, { ...def });
  }

  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = r.id;
    if (
      typeof id !== 'string' ||
      !SOCIAL_LINK_IDS.includes(id as SocialLinkId)
    ) {
      throw new Error(`invalid social link id: ${String(id)}`);
    }
    const current = byId.get(id as SocialLinkId)!;
    if (typeof r.name === 'string') {
      const name = r.name.trim();
      if (name.length === 0 || name.length > NAME_MAX_LEN) {
        throw new Error(`invalid name for ${id}`);
      }
      current.name = name;
    }
    if (typeof r.url === 'string') {
      const url = r.url.trim();
      if (url.length > URL_MAX_LEN) {
        throw new Error(`url too long for ${id}`);
      }
      current.url = url;
    }
    if (typeof r.enabled === 'boolean') {
      current.enabled = r.enabled;
    }
  }

  const result = SOCIAL_LINK_IDS.map((id) => byId.get(id)!);
  for (const entry of result) {
    if (entry.enabled && !entry.url.trim()) {
      throw new Error(`enabled link ${entry.id} requires a url`);
    }
  }
  return result;
}

/** Public footer: only enabled links with a non-empty url. */
export function publicSocialLinks(links: SocialLinkEntry[]) {
  return links
    .filter((l) => l.enabled && l.url.trim())
    .map((l) => ({
      id: l.id,
      name: l.name,
      url: normalizeSocialUrl(l.url),
    }));
}
