/** Contract: unified flight commitments (charter + agency). */

export type CommitmentCabin = 'FIRST' | 'BUSINESS' | 'COMFORT' | 'ECONOMY';
export type CommitmentStatus = 'ACTIVE' | 'CANCELLED';
export type CommitmentType = 'CHARTER' | 'AGENCY';

export interface CommitmentRow {
  id: string;
  flightInstanceId: string;
  cabin: CommitmentCabin;
  seats: number;
  contractPriceIrr: string | null;
  startDate: string | null;
  releaseAt: string | null;
  status: CommitmentStatus;
  idempotencyKey: string | null;
  createdById: string;
  createdAt: string;
  cancelledById: string | null;
  cancelledAt: string | null;
  type: CommitmentType;
  agencyId?: string;
  agencyName?: string;
  agencyLicenseNo?: string;
}

export interface CreateCommitmentPayload {
  cabin: CommitmentCabin;
  seats: number;
  contractPriceIrr?: string;
  startDate?: string;
  releaseAt?: string;
  /** Alias for releaseAt — if both sent, releaseAt wins server-side. */
  endDate?: string;
  /** Present → agency commitment; omitted → charter. */
  agencyId?: string;
  idempotencyKey?: string;
}

export interface CabinCommitmentSummary {
  cabin: CommitmentCabin;
  totalCapacity: number;
  charterCommitted: number;
  agencyCommitted: number;
  sold: number;
  availableOnline: number;
}

export interface CommitmentsSummary {
  cabins: CabinCommitmentSummary[];
  totalCapacity: number;
  charterCommitted: number;
  agencyCommitted: number;
  sold: number;
  availableOnline: number;
}
