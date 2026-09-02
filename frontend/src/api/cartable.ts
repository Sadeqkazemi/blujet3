import { apiGet, apiPatch, apiPost } from "./http";
import type {
  CartableCategory,
  CartableListResult,
  CartableStatus,
  CartableTask,
  ChairPermission,
  EmployeeManagerRecipient,
  ManagerMessageDept,
  MyReferralListResult,
  Referral,
  ReferralListResult,
  ReferralPriority,
  ReferralReport,
  SendMessageResult,
  SentEmployeeManagerMessage,
  StaffDirectoryEntry,
} from "../types/cartable";

export function fetchCartable(
  query: {
    category?: CartableCategory;
    date?: string;
    status?: CartableStatus;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.date) params.set("date", query.date);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet<CartableListResult>(`/cartable${qs ? `?${qs}` : ""}`);
}

export function fetchCartableUnreadCount() {
  return apiGet<{ count: number }>("/cartable/unread-count");
}

export function fetchCartableTask(id: string) {
  return apiGet<CartableTask>(`/cartable/${id}`);
}

export function approveCartableTask(id: string, note: string) {
  return apiPatch<CartableTask>(`/cartable/${id}/approve`, { note });
}

export function rejectCartableTask(id: string, note: string) {
  return apiPatch<CartableTask>(`/cartable/${id}/reject`, { note });
}

export function transferCartableTask(id: string, toId: string, note: string) {
  return apiPatch<CartableTask>(`/cartable/${id}/transfer`, { toId, note });
}

export function replyCartableMessage(
  id: string,
  body: string,
  attachmentIds?: string[],
) {
  return apiPost<CartableTask>(`/cartable/${id}/replies`, {
    body,
    attachmentIds,
  });
}

export function closeCartableConversation(id: string) {
  return apiPatch<CartableTask>(`/cartable/${id}/close`);
}

export function sendDirectStaffMessage(dto: {
  toId: string;
  subject: string;
  body: string;
  attachmentIds?: string[];
}) {
  return apiPost<CartableTask>("/cartable/direct-message", dto);
}

export function requestChairPermission() {
  return apiPost<ChairPermission>("/cartable/chair-permission");
}

export async function fetchChairPermission(): Promise<ChairPermission | null> {
  const { latest } = await apiGet<{ latest: ChairPermission | null }>(
    "/cartable/chair-permission",
  );
  return latest;
}

export function fetchStaffDirectory() {
  return apiGet<StaffDirectoryEntry[]>("/staff-directory");
}

export function fetchReferrals() {
  return apiGet<ReferralListResult>("/referrals");
}

export function createReferral(dto: {
  title: string;
  body: string;
  recipientIds: string[];
  priority?: ReferralPriority;
  dueAt?: string;
  attachmentIds?: string[];
}) {
  return apiPost<Referral>("/referrals", dto);
}

export function fetchReferralDetail(id: string) {
  return apiGet<Referral & { reports: ReferralReport[] }>(`/referrals/${id}`);
}

export function closeReferral(id: string) {
  return apiPatch<Referral>(`/referrals/${id}/close`);
}

export function requestReferralRevision(id: string) {
  return apiPatch<Referral>(`/referrals/${id}/request-revision`);
}

export function remindReferral(id: string) {
  return apiPost<Referral>(`/referrals/${id}/remind`);
}

export function fetchMyReferrals() {
  return apiGet<MyReferralListResult>("/referrals/mine");
}

export function submitReferralReport(
  id: string,
  body: string,
  attachmentIds?: string[],
) {
  return apiPost<Referral>(`/referrals/${id}/reports`, { body, attachmentIds });
}

export function sendManagerMessage(dto: {
  toDept: ManagerMessageDept;
  subject: string;
  body: string;
  attachmentIds?: string[];
}) {
  return apiPost<SendMessageResult>("/manager-messages", dto);
}

export function fetchManagerRecipients() {
  return apiGet<EmployeeManagerRecipient[]>("/cartable/manager-recipients");
}

export function sendEmployeeManagerMessage(dto: {
  toId: string;
  body: string;
  attachmentIds?: string[];
}) {
  return apiPost<{ id: string }>("/cartable/manager-message", dto);
}

export function fetchSentManagerMessages() {
  return apiGet<SentEmployeeManagerMessage[]>("/cartable/manager-message/sent");
}
