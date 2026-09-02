import { apiGet, apiPatch, apiPost } from './http';
import type {
  AgencyApiKey,
  AgencyApiScope,
  AgencyCredit,
  AgencyDetail,
  AgencyDocument,
  AgencyInvoice,
  AgencyListResult,
  AgencyMembershipRequest,
  AgencyMembershipStatus,
  AgencyMessage,
  AgencyAggregateInvoiceRow,
  AgencySeatRequestRow,
  AggregateInvoiceStatus,
} from '../types/agencies';

export function requestAgencySignupOtp(phone: string) {
  return apiPost<{ challengeId: string }>('/agencies/requests/otp', { phone });
}

export function submitAgencyRequest(dto: {
  applicantName: string;
  managerName: string;
  licenseNo: string;
  phone: string;
  challengeId: string;
  code: string;
}) {
  return apiPost<{ id: string }>('/agencies/requests', dto);
}

export function fetchAgencies(query: { q?: string; debtorsOnly?: boolean }) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.debtorsOnly) params.set('debtorsOnly', 'true');
  const qs = params.toString();
  return apiGet<AgencyListResult>(`/agencies${qs ? `?${qs}` : ''}`);
}

export function fetchAgencyDetail(id: string) {
  return apiGet<AgencyDetail>(`/agencies/${id}`);
}

export function suspendAgency(id: string, reason: string) {
  return apiPatch<AgencyDetail>(`/agencies/${id}/suspend`, { reason });
}

export function reactivateAgency(id: string) {
  return apiPatch<AgencyDetail>(`/agencies/${id}/reactivate`);
}

export function updateAgencyCredit(id: string, limitIrr: number) {
  return apiPatch<AgencyCredit>(`/agencies/${id}/credit`, { limitIrr });
}

export function settleAgency(id: string) {
  // settledIrr is a decimal STRING on the wire (BigInt.prototype.toJSON).
  return apiPost<{ settledIrr: string; ledgerEntryId: string }>(`/agencies/${id}/settle`);
}

export function fetchAgencyRequests(status?: AgencyMembershipStatus) {
  return apiGet<AgencyMembershipRequest[]>(`/agencies/requests${status ? `?status=${status}` : ''}`);
}

export function fetchAgencyRequest(id: string) {
  return apiGet<AgencyMembershipRequest & { history: unknown[] }>(`/agencies/requests/${id}`);
}

export function approveAgencyRequest(id: string) {
  return apiPatch<
    | { stage: 'AWAITING_FINANCE'; request: AgencyMembershipRequest }
    | { stage: 'APPROVED'; agencyId: string; tempPassword: string }
  >(`/agencies/requests/${id}/approve`);
}

export function rejectAgencyRequest(id: string, reviewNote?: string) {
  return apiPatch<AgencyMembershipRequest>(`/agencies/requests/${id}/reject`, {
    reviewNote,
  });
}

export function referAgencyRequest(id: string, referredToId: string, note?: string) {
  return apiPatch<AgencyMembershipRequest>(`/agencies/requests/${id}/refer`, {
    referredToId,
    note,
  });
}

export function fetchAgencyApiKeys(id: string) {
  return apiGet<AgencyApiKey[]>(`/agencies/${id}/api-key`);
}

export function issueAgencyApiKey(
  id: string,
  scope: AgencyApiScope,
  stepUp: { stepUpChallengeId: string; stepUpCode: string },
) {
  return apiPost<AgencyApiKey>(`/agencies/${id}/api-key`, { scope, ...stepUp });
}

export function updateAgencyApiKey(
  id: string,
  keyId: string,
  dto: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    regenerate?: boolean;
    stepUpChallengeId?: string;
    stepUpCode?: string;
  },
) {
  return apiPatch<AgencyApiKey>(`/agencies/${id}/api-key/${keyId}`, dto);
}

export function fetchAgencyInvoices(id: string) {
  return apiGet<AgencyInvoice[]>(`/agencies/${id}/invoices`);
}

export function issueAgencyInvoice(id: string, amountIrr: number, dueAt: string) {
  return apiPost<AgencyInvoice>(`/agencies/${id}/invoices`, {
    amountIrr,
    dueAt,
  });
}

export function payAgencyInvoice(id: string, invoiceId: string) {
  return apiPatch<AgencyInvoice>(`/agencies/${id}/invoices/${invoiceId}/pay`);
}

export function remindAgencyInvoice(id: string, invoiceId: string) {
  return apiPost<{ queued: boolean }>(`/agencies/${id}/invoices/${invoiceId}/remind`);
}

export function fetchAgencyMessages(id: string) {
  return apiGet<AgencyMessage[]>(`/agencies/${id}/messages`);
}

export function postAgencyMessage(id: string, body: string) {
  return apiPost<AgencyMessage>(`/agencies/${id}/messages`, { body });
}

export function fetchAgencyDocuments(id: string) {
  return apiGet<AgencyDocument[]>(`/agencies/${id}/documents`);
}

export function decideAgencyDocument(id: string, docId: string, approve: boolean) {
  return apiPatch<AgencyDocument>(`/agencies/${id}/documents/${docId}/decide`, {
    approve,
  });
}

export function notifyAllDebtors() {
  return apiPost<{ notifiedCount: number }>('/agencies/debtors/notify-all');
}

export function fetchAgencyCreditRequests(id: string) {
  return apiGet<import('../types/agency-portal').AgencyCreditRequest[]>(`/agencies/${id}/credit-requests`);
}

export function decideAgencyCreditRequest(id: string, reqId: string, approve: boolean) {
  return apiPatch<import('../types/agency-portal').AgencyCreditRequest>(
    `/agencies/${id}/credit-requests/${reqId}/decide`,
    { approve },
  );
}

export function fetchAgencyWebserviceRequests(id: string) {
  return apiGet<import('../types/agency-portal').AgencyWebserviceRequest[]>(`/agencies/${id}/webservice-requests`);
}

/** SITE_ADMIN / commercial — all agencies' webservice purchase requests */
export function fetchAllWebserviceRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiGet<import('../types/agency-portal').AgencyWebserviceQueueRow[]>(`/agencies/webservice-requests${qs}`);
}

export function decideAgencyWebserviceRequest(
  id: string,
  reqId: string,
  dto: { approve: boolean; stepUpChallengeId?: string; stepUpCode?: string },
) {
  return apiPatch<{
    request: import('../types/agency-portal').AgencyWebserviceRequest;
    apiKey?: AgencyApiKey;
  }>(
    `/agencies/${id}/webservice-requests/${reqId}/decide`,
    dto,
  );
}

export function fetchAggregateInvoices(status?: AggregateInvoiceStatus) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiGet<AgencyAggregateInvoiceRow[]>(`/agencies/invoices${qs}`);
}

export function fetchAggregateSeatRequests() {
  return apiGet<AgencySeatRequestRow[]>('/agencies/seat-requests');
}

export function decideAggregateSeatRequest(
  id: string,
  approve: boolean,
  dueAt?: string,
) {
  return apiPatch<{ id: string; status: 'APPROVED' | 'REJECTED' }>(
    `/agencies/seat-requests/${id}/decide`,
    { approve, ...(dueAt ? { dueAt } : {}) },
  );
}
