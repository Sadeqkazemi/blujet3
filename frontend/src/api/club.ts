import { apiGet, apiPatch, apiPost } from './http';
import type {
  ClubCardRequest,
  ClubMember,
  ClubMembersResult,
  ClubSubmittedCardRequest,
  ClubTier,
  ClubTierRules,
} from '../types/club';

export function fetchClubMembers(query: { level?: ClubTier; q?: string } = {}) {
  const params = new URLSearchParams();
  if (query.level) params.set('level', query.level);
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return apiGet<ClubMembersResult>(`/club/members${qs ? `?${qs}` : ''}`);
}

export function createClubMember(dto: {
  fullName: string;
  email: string;
  birthDate?: string;
  nationalId: string;
  level: ClubTier;
}) {
  return apiPost<ClubMember>('/club/members', dto);
}

export function deactivateClubMember(id: string) {
  return apiPatch<{ id: string; isActive: false; deactivatedAt: string }>(
    `/club/members/${id}/deactivate`,
    {},
  );
}

export function updateClubMemberLevel(id: string, level: ClubTier) {
  return apiPatch<ClubMember>(`/club/members/${id}/level`, { level });
}

export function issueClubCard(id: string) {
  return apiPost<ClubMember>(`/club/members/${id}/issue-card`);
}

export function fetchCardRequests() {
  return apiGet<ClubCardRequest[]>('/club/card-requests');
}

export function fetchSubmittedCardRequests() {
  return apiGet<ClubSubmittedCardRequest[]>('/club/submitted-card-requests');
}

export function referCardRequest(id: string, assignedTo: 'SENIOR' | 'CHAIR') {
  return apiPatch<ClubCardRequest>(`/club/card-requests/${id}/refer`, { assignedTo });
}

export function approveCardRequest(id: string) {
  return apiPatch<ClubCardRequest>(`/club/card-requests/${id}/approve`);
}

export function rejectCardRequest(id: string) {
  return apiPatch<ClubCardRequest>(`/club/card-requests/${id}/reject`);
}

export function fetchClubTierRules() {
  return apiGet<ClubTierRules>('/club/tier-rules');
}

export function updateClubTierRules(dto: {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
}) {
  return apiPatch<ClubTierRules>('/club/tier-rules', dto);
}
