export type IdentityReviewStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface IdentityVerificationRow {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  birthDate: string | null;
  status: IdentityReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  idCardFileName: string | null;
}
