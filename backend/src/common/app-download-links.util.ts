/** App store links editable from the SITE_ADMIN settings tab. */

export const APP_LINK_IDS = [
  'app_store',
  'google_play',
  'bazaar_myket',
] as const;

export type AppLinkId = (typeof APP_LINK_IDS)[number];

export interface AppDownloadLinkEntry {
  id: AppLinkId;
  name: string;
  url: string;
}

export const DEFAULT_APP_DOWNLOAD_LINKS: AppDownloadLinkEntry[] = [
  { id: 'app_store', name: 'App Store', url: '' },
  { id: 'google_play', name: 'Google Play', url: '' },
  { id: 'bazaar_myket', name: 'بازار / مایکت', url: '' },
];

const URL_MAX_LEN = 500;
const NAME_MAX_LEN = 80;

export function normalizeAppLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseAppDownloadLinks(input: unknown): AppDownloadLinkEntry[] {
  if (!Array.isArray(input)) {
    throw new Error('appDownloadLinks must be an array');
  }
  const byId = new Map<AppLinkId, AppDownloadLinkEntry>();
  for (const def of DEFAULT_APP_DOWNLOAD_LINKS) {
    byId.set(def.id, { ...def });
  }

  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'string' || !APP_LINK_IDS.includes(id as AppLinkId)) {
      throw new Error(`invalid app link id: ${String(id)}`);
    }
    const current = byId.get(id as AppLinkId)!;
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
  }

  return APP_LINK_IDS.map((id) => byId.get(id)!);
}

export function publicAppDownloadLinks(links: AppDownloadLinkEntry[]) {
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({
      id: l.id,
      name: l.name,
      url: normalizeAppLinkUrl(l.url),
    }));
}
