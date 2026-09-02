import { apiGet, apiGetBlob, apiPost, apiPostForm, apiRequest } from "./http";
import type { BookingDetail } from "../types/public-site";
import type {
  AgencyAllotmentRow,
  AgencyApiKeySummary,
  AgencyApiScope,
  AgencyCredit,
  AgencyCreditRequest,
  AgencyDashboard,
  AgencyDocument,
  AgencyDocumentType,
  AgencyInvoice,
  AgencyFinancialEvent,
  AgencyLedgerEntry,
  AgencyMessage,
  AgencyProfile,
  AgencySalesReport,
  AgencySeatRequestOption,
  AgencySeatInquiry,
  AgencySeatRequestHistoryRow,
  AgencySeatRequestResult,
  AgencyWebserviceRequest,
} from "../types/agency-portal";

export function fetchDashboard() {
  return apiGet<AgencyDashboard>("/agency-portal/dashboard");
}

export function fetchCredit() {
  return apiGet<AgencyCredit>("/agency-portal/credit");
}

export function fetchLedger() {
  return apiGet<AgencyLedgerEntry[]>("/agency-portal/ledger");
}

export function fetchFinancialEvents() {
  return apiGet<AgencyFinancialEvent[]>("/agency-portal/financial-events");
}

export function fetchInvoices() {
  return apiGet<AgencyInvoice[]>("/agency-portal/invoices");
}

export function payInvoice(invoiceId: string) {
  return apiPost<AgencyInvoice>(`/agency-portal/invoices/${invoiceId}/pay`);
}

export function requestCreditIncrease(
  requestedLimitIrr: number,
  note?: string,
) {
  return apiPost<AgencyCreditRequest>("/agency-portal/credit-requests", {
    requestedLimitIrr,
    note,
  });
}

export function fetchMyCreditRequests() {
  return apiGet<AgencyCreditRequest[]>("/agency-portal/credit-requests");
}

export function fetchSales() {
  return apiGet<AgencySalesReport>("/agency-portal/sales");
}

export function downloadSalesExport() {
  return apiGetBlob("/agency-portal/sales/export");
}

export function fetchInbox() {
  return apiGet<AgencyMessage[]>("/agency-portal/inbox");
}

export function postInboxMessage(body: string, attachmentIds?: string[]) {
  return apiPost<AgencyMessage>("/agency-portal/inbox", { body, attachmentIds });
}

export function fetchProfile() {
  return apiGet<AgencyProfile>("/agency-portal/profile");
}

export function fetchDocuments() {
  return apiGet<AgencyDocument[]>("/agency-portal/documents");
}

export function uploadDocument(file: File, docType: AgencyDocumentType) {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  return apiPostForm<AgencyDocument>("/agency-portal/documents", form);
}

export function fetchAllotments() {
  return apiGet<AgencyAllotmentRow[]>("/agency-portal/allotments");
}

export function fetchSeatRequestOptions() {
  return apiGet<AgencySeatRequestOption[]>(
    "/agency-portal/seat-request-options",
  );
}

export function inquireAgencySeats(dto: {
  flightInstanceId: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
  fareClassCode: string;
  seats: number;
}) {
  return apiPost<AgencySeatInquiry>("/agency-portal/seat-inquiry", dto);
}

export function fetchMySeatRequests() {
  return apiGet<AgencySeatRequestHistoryRow[]>("/agency-portal/seat-requests");
}

export function requestAgencySeats(dto: {
  flightInstanceId: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
  fareClassCode: string;
  seats: number;
  selectedFlightInstanceIds?: string[];
  preferredWeekdays?: number[];
  termMonths?: 0 | 1 | 3 | 6 | 12;
  payMethod?: "INVOICE" | "CREDIT";
}) {
  return apiPost<AgencySeatRequestResult>("/agency-portal/seat-requests", dto);
}

export function createAllotmentBooking(
  allotmentId: string,
  dto: {
    cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
    passengers: {
      fullName: string;
      nationalId?: string;
      mobile?: string;
      seatCode: string;
    }[];
  },
  idempotencyKey: string,
) {
  return apiRequest<BookingDetail>(
    `/agency-portal/allotments/${allotmentId}/bookings`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(dto),
    },
  );
}

export function requestWebservice(
  scope: AgencyApiScope,
  months: 1 | 3 | 12,
  note?: string,
) {
  return apiPost<AgencyWebserviceRequest>(
    "/agency-portal/webservice-requests",
    { scope, months, note },
  );
}

export function fetchMyWebserviceRequests() {
  return apiGet<AgencyWebserviceRequest[]>(
    "/agency-portal/webservice-requests",
  );
}

export function fetchAgencyPortalWebservicePlans() {
  return apiGet<{ plans: { months: 1 | 3 | 12; priceIrr: number }[] }>(
    "/agency-portal/webservice-plans",
  );
}

export function fetchApiKeys() {
  return apiGet<AgencyApiKeySummary[]>("/agency-portal/api-keys");
}
