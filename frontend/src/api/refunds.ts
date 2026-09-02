import { apiGet, apiPatch } from './http';
import type { RefundDetail, RefundListRow, RefundsResult } from '../types/refunds';

export function fetchRefunds() {
  return apiGet<RefundsResult>('/refunds');
}

export function fetchRefundDetail(id: string) {
  return apiGet<RefundDetail>(`/refunds/${id}`);
}

export function referRefund(id: string, assigneeId: string) {
  return apiPatch<RefundListRow>(`/refunds/${id}/refer`, { assigneeId });
}

export function payRefund(id: string, stepUp: { stepUpChallengeId: string; stepUpCode: string }) {
  return apiPatch<RefundListRow>(`/refunds/${id}/pay`, stepUp);
}
