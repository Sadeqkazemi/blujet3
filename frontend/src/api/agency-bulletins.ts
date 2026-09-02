import { apiGet, apiPost } from './http';
import type {
  AgencyBulletinDispatch,
  AgencyBulletinRecipient,
  CreateAgencyBulletinPayload,
} from '../types/agency-bulletins';

export function fetchAgencyBulletinRecipients() {
  return apiGet<AgencyBulletinRecipient[]>('/agency-bulletins/recipients');
}

export function fetchAgencyBulletinHistory() {
  return apiGet<AgencyBulletinDispatch[]>('/agency-bulletins/admin');
}

export function createAgencyBulletin(payload: CreateAgencyBulletinPayload) {
  return apiPost<AgencyBulletinDispatch>('/agency-bulletins/admin', payload);
}
