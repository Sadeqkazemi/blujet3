export type CartableCategory = "ADMIN" | "AGENCY" | "MANAGER";
export type CartableStatus = "OPEN" | "APPROVED" | "REJECTED" | "TRANSFERRED";
export type CartableSourceType =
  | "MANAGER_MESSAGE"
  | "MANAGER_REFERRAL"
  | "AGENCY_REQUEST"
  | "CHAIR_PERMISSION"
  | "EMPLOYEE_MESSAGE";

export interface CartableHistoryEntry {
  id: string;
  action: string;
  detail: string;
  actorLabel: string | null;
  actorRole: string | null;
  attachments?: ReferralAttachment[];
  createdAt: string;
}

export interface CartableTask {
  id: string;
  category: CartableCategory;
  title: string;
  description: string;
  senderLabelFa: string | null;
  sender: { fullName: string; role: string } | null;
  sourceType: CartableSourceType | null;
  sourceId: string | null;
  conversationId?: string | null;
  status: CartableStatus;
  resolutionNote: string | null;
  createdAt: string;
  attachments?: ReferralAttachment[];
  history?: CartableHistoryEntry[];
  readAt?: string | null;
}

export interface CartableListResult {
  tasks: CartableTask[];
  counts: { ADMIN: number; AGENCY: number; MANAGER: number };
  statusCounts?: Record<CartableStatus, number>;
  totalOpen: number;
}

export type ChairPermissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ChairPermission {
  id: string;
  status: ChairPermissionStatus;
  createdAt: string;
}

export interface StaffDirectoryEntry {
  id: string;
  fullName: string;
  role: string;
  roleLabelFa: string;
}

export type ReferralPriority = "HIGH" | "MEDIUM" | "LOW";
export type ReferralStatus = "SENT" | "REVIEWING" | "REPORTED" | "CLOSED";

export interface ReferralRecipient {
  recipientId: string;
  recipient: { id: string; fullName: string; role: string };
}

export interface ReferralAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ReferralReport {
  id: string;
  body: string;
  createdAt: string;
  from: { id: string; fullName: string; role: string };
  attachments: ReferralAttachment[];
}

export interface Referral {
  id: string;
  title: string;
  body: string;
  priority: ReferralPriority;
  dueAt: string | null;
  status: ReferralStatus;
  createdAt: string;
  recipients: ReferralRecipient[];
  attachments: ReferralAttachment[];
  reports?: ReferralReport[];
  _count?: { reports: number };
}

export interface ReferralListResult {
  referrals: Referral[];
  kpis: {
    total: number;
    awaitingReport: number;
    reported: number;
    closed: number;
  };
}

export interface MyReferral {
  id: string;
  title: string;
  body: string;
  priority: ReferralPriority;
  status: ReferralStatus;
  dueAt: string | null;
  createdAt: string;
  from: { id: string; fullName: string; role: string };
  attachments: ReferralAttachment[];
  hasMyReport: boolean;
}

export interface MyReferralListResult {
  referrals: MyReferral[];
  counts: { total: number; awaitingMyReport: number };
}

export type ManagerMessageDept =
  "FINANCE" | "COMMERCIAL" | "SUPPORT" | "AGENCIES" | "CEO" | "ALL_MANAGERS";

export interface SendMessageResult {
  message: { id: string; subject: string };
  deliveredCount: number;
  warning?: "PARTIAL_DELIVERY";
}

export interface EmployeeManagerRecipient {
  id: string;
  fullName: string;
  role: string;
  roleLabelFa: string;
  isOwnManager: boolean;
}

export interface SentEmployeeManagerMessage {
  id: string;
  toName: string;
  body: string;
  attachments?: ReferralAttachment[];
  createdAt: string;
}
