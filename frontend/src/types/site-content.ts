export type SiteContentBlockKey =
  | 'HERO_BANNER'
  | 'ANNOUNCEMENT_BAR'
  | 'PROMO_BANNER';

export type ContentBlockRow = {
  key: SiteContentBlockKey;
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  badgeText: string;
  imageFileId: string | null;
  imageUrl: string | null;
};

export type LibraryAssetRow = {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileId: string;
  url: string;
  createdAt: string;
};

export type DestinationRow = {
  id: string;
  airportCode: string;
  priceIrr: string;
  imageFileId: string | null;
  imageUrl?: string | null;
  sortOrder: number;
};

export type RouteRow = {
  id: string;
  fromAirportCode: string;
  toAirportCode: string;
  priceIrr: string;
  sortOrder: number;
};

export type PublicHomeContent = {
  blocks: ContentBlockRow[];
  destinations: {
    airportCode: string;
    cityFa: string;
    priceIrr: string;
    imageUrl: string | null;
  }[];
  routes: {
    fromAirportCode: string;
    toAirportCode: string;
    fromCityFa: string;
    toCityFa: string;
    priceIrr: string;
  }[];
};

export type UpdateContentBlockInput = Partial<
  Pick<
    ContentBlockRow,
    'enabled' | 'title' | 'subtitle' | 'buttonText' | 'badgeText' | 'imageFileId'
  >
>;

export type CreateDestinationInput = {
  airportCode: string;
  priceIrr: number;
  imageFileId?: string;
  sortOrder?: number;
};

export type UpdateDestinationInput = Partial<
  Omit<CreateDestinationInput, 'imageFileId'>
> & {
  imageFileId?: string | null;
};

export type CreateRouteInput = {
  fromAirportCode: string;
  toAirportCode: string;
  priceIrr: number;
  sortOrder?: number;
};

export type UpdateRouteInput = Partial<CreateRouteInput>;
