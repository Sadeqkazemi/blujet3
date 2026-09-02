import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type {
  AncillaryServiceRow,
  PublicAncillaryService,
  SeatServiceRow,
} from '../types/ancillary-services';

interface AncillaryList {
  seatServices: SeatServiceRow[];
  otherServices: AncillaryServiceRow[];
}

function list() {
  return apiGet<AncillaryList>('/ancillary-services');
}

export async function fetchSeatServices(): Promise<SeatServiceRow[]> {
  return (await list()).seatServices;
}

export async function fetchOtherServices(): Promise<AncillaryServiceRow[]> {
  return (await list()).otherServices;
}

export async function setSeatServicePrice(key: string, priceIrr: string): Promise<SeatServiceRow[]> {
  return (await apiPatch<AncillaryList>(`/ancillary-services/${encodeURIComponent(key)}/price`, { priceIrr }))
    .seatServices;
}

export async function toggleSeatService(key: string): Promise<SeatServiceRow[]> {
  const current = (await fetchSeatServices()).find((row) => row.key === key);
  return (
    await apiPatch<AncillaryList>(`/ancillary-services/${encodeURIComponent(key)}/enabled`, {
      enabled: !(current?.enabled ?? false),
    })
  ).seatServices;
}

export async function setOtherServicePrice(key: string, priceIrr: string): Promise<AncillaryServiceRow[]> {
  return (await apiPatch<AncillaryList>(`/ancillary-services/${encodeURIComponent(key)}/price`, { priceIrr }))
    .otherServices;
}

export async function toggleOtherService(key: string): Promise<AncillaryServiceRow[]> {
  const current = (await fetchOtherServices()).find((row) => row.key === key);
  return (
    await apiPatch<AncillaryList>(`/ancillary-services/${encodeURIComponent(key)}/enabled`, {
      enabled: !(current?.enabled ?? false),
    })
  ).otherServices;
}

export async function addCustomService(input: {
  titleFa: string;
  descriptionFa: string;
  priceIrr: string;
}): Promise<AncillaryServiceRow[]> {
  return (await apiPost<AncillaryList>('/ancillary-services', input)).otherServices;
}

export async function deleteCustomService(key: string): Promise<AncillaryServiceRow[]> {
  return (await apiDelete<AncillaryList>(`/ancillary-services/${encodeURIComponent(key)}`)).otherServices;
}

export function fetchPublicAncillaryServices() {
  return apiGet<PublicAncillaryService[]>('/public/ancillary-services');
}

export function fetchPublicSeatServices() {
  return apiGet<PublicAncillaryService[]>('/public/ancillary-services/seat-types');
}
