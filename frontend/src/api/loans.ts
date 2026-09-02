import { apiGet, apiPost } from "./http";
import type {
  LoanApplication,
  LoanApplicationList,
  LoanCustomerProfile,
} from "../types/loans";

export function fetchLoanProfile() {
  return apiGet<LoanCustomerProfile>("/me/loan-profile");
}

export function startLoanAccountOpening(idempotencyKey: string) {
  return apiPost<LoanCustomerProfile>("/me/loan-profile/account-opening", {
    idempotencyKey,
  });
}

export function syncLoanAccountOpening() {
  return apiPost<LoanCustomerProfile>("/me/loan-profile/account-opening/sync");
}

export function startLoanEligibility(
  customerNumber: string,
  idempotencyKey: string,
) {
  return apiPost<LoanCustomerProfile>("/me/loan-profile/eligibility", {
    customerNumber,
    idempotencyKey,
  });
}

export function syncLoanEligibility() {
  return apiPost<LoanCustomerProfile>("/me/loan-profile/eligibility/sync");
}

export function createLoanApplication(
  requestedAmountIrr: string,
  idempotencyKey: string,
) {
  return apiPost<LoanApplication>("/me/loan-applications", {
    requestedAmountIrr,
    idempotencyKey,
  });
}

export function fetchMyLoanApplications(page = 1, pageSize = 20) {
  return apiGet<LoanApplicationList>(
    `/me/loan-applications?page=${page}&pageSize=${pageSize}`,
  );
}

export function syncMyLoanApplication(id: string) {
  return apiPost<LoanApplication>(`/me/loan-applications/${id}/sync`);
}

export function fetchAdminLoanApplications(page = 1, pageSize = 20) {
  return apiGet<LoanApplicationList>(
    `/admin/loan-applications?page=${page}&pageSize=${pageSize}`,
  );
}

export function fetchAdminLoanApplication(id: string) {
  return apiGet<LoanApplication>(`/admin/loan-applications/${id}`);
}
