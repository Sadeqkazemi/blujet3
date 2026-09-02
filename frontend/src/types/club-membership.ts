export interface ClubTierRules {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
}

export interface ClubCardRequestHistoryStep {
  step: string;
  labelFa: string;
  at: string;
}

export interface ClubCardRequestView {
  id: string;
  status: 'SUBMITTED' | 'REFERRED' | 'APPROVED' | 'REJECTED';
  history: ClubCardRequestHistoryStep[];
  cardNo: string | null;
  createdAt: string;
}

export interface ClubMembershipView {
  isMember: boolean;
  level: 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  balance: number;
  cardStatus: 'NONE' | 'REVIEW' | 'ISSUED' | null;
  cardNo: string | null;
  tierRules: ClubTierRules;
  cardRequest: ClubCardRequestView | null;
  canRequestCard: boolean;
  pointsNeededForCard: number;
}
