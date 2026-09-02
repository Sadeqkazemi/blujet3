export type ClubTier = 'SILVER' | 'GOLD' | 'PLATINUM';
export type ClubCardStatus = 'NONE' | 'REVIEW' | 'ISSUED';
export type ClubCardRequestStatus = 'SUBMITTED' | 'REFERRED' | 'APPROVED' | 'REJECTED';

export interface ClubMember {
  id: string;
  fullName: string;
  email: string;
  birthDate: string | null;
  joinDate: string;
  points: number;
  level: ClubTier;
  cardStatus: ClubCardStatus;
  cardNo: string | null;
  issuedByLabelFa: string | null;
  /** Decrypted for SITE_ADMIN only (profiles + VIP Excel export). */
  nationalId?: string;
}

export interface ClubMembersResult {
  members: ClubMember[];
  kpis: {
    totalMembers: number;
    issuedCards: number;
    pendingRequests: number;
    submittedRequests: number;
    tierCounts: Record<ClubTier, number>;
  };
}

export interface ClubSubmittedCardRequest extends ClubCardRequest {
  status: ClubCardRequestStatus;
  member: ClubCardRequest['member'] & {
    birthDate: string | null;
    joinDate: string;
    nationalId: string;
  };
}

export interface ClubCardRequest {
  id: string;
  memberId: string;
  member: { id: string; fullName: string; email: string; points: number; level: ClubTier };
  level: ClubTier;
  points: number;
  status: ClubCardRequestStatus;
  assignedTo: 'SENIOR' | 'CHAIR' | null;
  cardNo: string | null;
  history: { step: string; labelFa: string; at: string }[];
  createdAt: string;
}

export interface ClubTierRulePreviewRow {
  tier: ClubTier;
  minPoints: number;
  maxPoints: number | null;
}

export interface ClubTierRules {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
  updatedAt: string;
  updatedByLabelFa: string | null;
  preview: ClubTierRulePreviewRow[];
}
