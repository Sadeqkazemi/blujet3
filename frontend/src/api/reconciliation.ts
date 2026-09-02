import { apiGet, apiPatch } from './http';
import type { ReconciliationItem } from '../types/reconciliation';

// صف مغایرت‌های پرداخت (FINANCE_MANAGER) — پرداخت‌های موفق که صدور بلیط
// آن‌ها ناتمام مانده است.
export function fetchReconciliationQueue() {
  return apiGet<ReconciliationItem[]>('/reconciliation');
}

export function resolveReconciliation(id: string, resolutionNote: string) {
  return apiPatch<ReconciliationItem>(`/reconciliation/${id}/resolve`, {
    resolutionNote,
  });
}
