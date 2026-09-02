export const APP_LINK_IDS = ['app_store', 'google_play', 'bazaar_myket'] as const;

export type AppLinkId = (typeof APP_LINK_IDS)[number];

export type AppDownloadLinkEntry = {
  id: AppLinkId;
  name: string;
  url: string;
};

export type PublicAppLinksResult = {
  links: { id: AppLinkId; name: string; url: string }[];
};

export type PublicSupportContact = {
  phone: string;
  email: string;
};
