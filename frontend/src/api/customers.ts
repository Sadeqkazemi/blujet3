import { apiGet } from './http';
import type { CustomerDetail, CustomersListResult } from '../types/customers';

export function fetchCustomers(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  const qs = params.toString();
  return apiGet<CustomersListResult>(`/customers${qs ? `?${qs}` : ''}`);
}

export function fetchCustomersIncompleteCount() {
  return apiGet<{ count: number }>('/customers/incomplete-count');
}

export function fetchCustomer(id: string) {
  return apiGet<CustomerDetail>(`/customers/${id}`);
}
