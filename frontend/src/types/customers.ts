export type CustomerClubLevel = 'SILVER' | 'GOLD' | 'PLATINUM';
export type ProfileCompletionField = 'fullName' | 'nationalId' | 'birthDate' | 'passportNo' | 'address' | 'verifiedEmail';

export interface CustomerListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  profileIncomplete: boolean;
  completionPct: number;
  missingProfileFields: ProfileCompletionField[];
  createdAt: string;
  club: {
    isMember: boolean;
    level: CustomerClubLevel | null;
    points: number;
  };
}

export interface CustomersListResult {
  customers: CustomerListItem[];
  incompleteCount: number;
  total: number;
}

export interface CustomerDoc {
  type: string;
  file: string;
  status: 'verified' | 'pending' | 'rejected';
}

export interface CustomerPurchase {
  id: string;
  route: string;
  pnr: string;
  date: string;
  priceIrr: string;
  status: string;
}

export interface CustomerContact {
  id: string;
  channel: string;
  subject: string;
  date: string;
  status: string;
}

export interface CustomerRefund {
  id: string;
  trackingCode: string;
  passengerName: string;
  route: string;
  pnr: string;
  status: string;
  totalPaidIrr: string;
  penaltyPct: number;
  penaltyAmountIrr: string;
  refundableIrr: string;
  createdAt: string;
  paidAt: string | null;
}

export interface CustomerDetail {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  profileIncomplete: boolean;
  completionPct: number;
  missingProfileFields: ProfileCompletionField[];
  registeredAt: string;
  club: {
    isMember: boolean;
    level: CustomerClubLevel | null;
    points: number;
    cardStatus: string | null;
    cardNo: string | null;
  };
  docs: CustomerDoc[];
  purchases: CustomerPurchase[];
  contacts: CustomerContact[];
  refunds: CustomerRefund[];
}
