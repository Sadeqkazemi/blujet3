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

export interface PublicSocialLink {
  id: SocialLinkId;
  name: string;
  url: string;
}

export interface PublicSocialLinksResult {
  links: PublicSocialLink[];
}
