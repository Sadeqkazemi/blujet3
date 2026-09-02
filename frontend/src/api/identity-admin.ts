import { apiGet, apiGetBlob, apiPatch } from './http';
import type { IdentityVerificationRow } from '../types/identity-admin';

export function fetchIdentityVerifications() {
  return apiGet<IdentityVerificationRow[]>('/identity-verifications');
}

export function fetchIdentityIdCard(id: string) {
  return apiGetBlob(`/identity-verifications/${id}/id-card`);
}

export function approveIdentityVerification(id: string) {
  return apiPatch<{ id: string; status: string }>(
    `/identity-verifications/${id}/approve`,
  );
}

export function rejectIdentityVerification(id: string, rejectReason: string) {
  return apiPatch<{ id: string; status: string }>(
    `/identity-verifications/${id}/reject`,
    { rejectReason },
  );
}
