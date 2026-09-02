import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { StoredLocale } from '../hooks/useLocale';
import type {
  ContentBlockRow,
  CreateDestinationInput,
  CreateRouteInput,
  DestinationRow,
  LibraryAssetRow,
  PublicHomeContent,
  RouteRow,
  SiteContentBlockKey,
  UpdateContentBlockInput,
  UpdateDestinationInput,
  UpdateRouteInput,
} from '../types/site-content';

export function fetchPublicHomeContent(locale?: StoredLocale) {
  const q = locale ? `?locale=${locale}` : '';
  return apiGet<PublicHomeContent>(`/site-content/home${q}`);
}

export function fetchLibraryAssets() {
  return apiGet<LibraryAssetRow[]>('/site-content/admin/library');
}

export function addLibraryAsset(storedFileId: string, label?: string) {
  return apiPost<LibraryAssetRow>('/site-content/admin/library', {
    storedFileId,
    label,
  });
}

export function deleteLibraryAsset(id: string) {
  return apiDelete<{ id: string }>(`/site-content/admin/library/${id}`);
}

export function fetchContentBlocks() {
  return apiGet<ContentBlockRow[]>('/site-content/admin/blocks');
}

export function updateContentBlock(key: SiteContentBlockKey, input: UpdateContentBlockInput) {
  return apiPatch<ContentBlockRow>(`/site-content/admin/blocks/${key}`, input);
}

export function fetchDestinations() {
  return apiGet<DestinationRow[]>('/site-content/admin/destinations');
}

export function createDestination(input: CreateDestinationInput) {
  return apiPost<DestinationRow>('/site-content/admin/destinations', input);
}

export function updateDestination(id: string, input: UpdateDestinationInput) {
  return apiPatch<DestinationRow>(`/site-content/admin/destinations/${id}`, input);
}

export function deleteDestination(id: string) {
  return apiDelete<{ id: string }>(`/site-content/admin/destinations/${id}`);
}

export function fetchRoutes() {
  return apiGet<RouteRow[]>('/site-content/admin/routes');
}

export function createRoute(input: CreateRouteInput) {
  return apiPost<RouteRow>('/site-content/admin/routes', input);
}

export function updateRoute(id: string, input: UpdateRouteInput) {
  return apiPatch<RouteRow>(`/site-content/admin/routes/${id}`, input);
}

export function deleteRoute(id: string) {
  return apiDelete<{ id: string }>(`/site-content/admin/routes/${id}`);
}
