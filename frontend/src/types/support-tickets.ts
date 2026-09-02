export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';
export type SupportTicketDept = 'SITE' | 'AGENCY';

export interface MySupportTicketRow {
  id: string;
  trackingCode: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  history: { step: string; labelFa: string; at: string }[];
  createdAt: string;
  updatedAt: string;
  attachments?: SupportTicketAttachment[];
  conversation?: SupportTicketConversationMessage[];
}

export interface SupportTicketConversationMessage {
  id: string;
  body: string;
  senderType: 'REQUESTER' | 'STAFF';
  senderLabel: string;
  createdAt: string;
  attachments: SupportTicketAttachment[];
}

export interface SupportTicketAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SupportTicketRow {
  id: string;
  trackingCode: string;
  subject: string;
  body: string;
  requesterName: string;
  requesterPhone: string;
  dept: SupportTicketDept;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: SupportTicketStatus;
  forwardedTo: { id: string; fullName: string; role: string } | null;
  history: { step: string; labelFa: string; at: string }[];
  createdAt: string;
  updatedAt: string;
  attachments?: SupportTicketAttachment[];
  conversation?: SupportTicketConversationMessage[];
}

export interface ForwardTarget {
  id: string;
  fullName: string;
  role: string;
  roleLabelFa: string;
}

export interface ContactMessageRow {
  id: string;
  name: string;
  phone: string;
  subject: string;
  body: string;
  createdAt: string;
}
