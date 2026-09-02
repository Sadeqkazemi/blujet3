import { apiGet, apiGetBlob, apiPatch, apiPost, apiPostForm } from './http';
import type {
  ApplyJobInput,
  CareersSettings,
  CreateJobPostingInput,
  JobApplicationDetail,
  JobApplicationRow,
  JobDetail,
  JobPosting,
  JobSummary,
  UpdateJobPostingInput,
} from '../types/careers';

// ── Public ────────────────────────────────────────────────────────────
export function fetchCareersSettings() {
  return apiGet<CareersSettings>('/careers/settings');
}

export function fetchActiveJobs() {
  return apiGet<JobSummary[]>('/careers/jobs');
}

export function fetchJobDetail(id: string) {
  return apiGet<JobDetail>(`/careers/jobs/${id}`);
}

export function applyToJob(jobId: string, input: ApplyJobInput) {
  const form = new FormData();
  form.set('firstName', input.firstName);
  form.set('lastName', input.lastName);
  form.set('nationalId', input.nationalId);
  form.set('phone', input.phone);
  if (input.fatherName) form.set('fatherName', input.fatherName);
  if (input.birthDate) form.set('birthDate', input.birthDate);
  if (input.birthProvince) form.set('birthProvince', input.birthProvince);
  if (input.birthCity) form.set('birthCity', input.birthCity);
  if (input.gender) form.set('gender', input.gender);
  if (input.marital) form.set('marital', input.marital);
  if (input.military) form.set('military', input.military);
  if (input.exemptionType) form.set('exemptionType', input.exemptionType);
  if (input.email) form.set('email', input.email);
  if (input.residenceProvince) form.set('residenceProvince', input.residenceProvince);
  if (input.residenceAddress) form.set('residenceAddress', input.residenceAddress);
  if (input.skills) form.set('skills', input.skills);
  if (input.otherLangs) form.set('otherLangs', input.otherLangs);
  if (input.eduEntries?.length) form.set('eduEntries', JSON.stringify(input.eduEntries));
  if (input.workEntries?.length) form.set('workEntries', JSON.stringify(input.workEntries));
  if (input.langEntries?.length) form.set('langEntries', JSON.stringify(input.langEntries));
  if (input.resume) form.set('resume', input.resume);

  return apiPostForm<{ id: string }>(`/careers/jobs/${jobId}/apply`, form);
}

// ── SITE_ADMIN: job-posting CRUD ─────────────────────────────────────
export function fetchAllPostings() {
  return apiGet<JobPosting[]>('/careers/postings');
}

export function createPosting(input: CreateJobPostingInput) {
  return apiPost<JobPosting>('/careers/postings', input);
}

export function updatePosting(id: string, input: UpdateJobPostingInput) {
  return apiPatch<JobPosting>(`/careers/postings/${id}`, input);
}

// ── SITE_ADMIN: application review ───────────────────────────────────
export function fetchApplications(query?: { q?: string; jobTitle?: string }) {
  const params = new URLSearchParams();
  if (query?.q) params.set('q', query.q);
  if (query?.jobTitle) params.set('jobTitle', query.jobTitle);
  const qs = params.toString();
  return apiGet<JobApplicationRow[]>(`/careers/applications${qs ? `?${qs}` : ''}`);
}

export function fetchApplicationDetail(id: string) {
  return apiGet<JobApplicationDetail>(`/careers/applications/${id}`);
}

export function fetchApplicationResume(id: string) {
  return apiGetBlob(`/careers/applications/${id}/resume`);
}

export function referApplication(id: string, assigneeId: string) {
  return apiPatch<{ id: string; status: string }>(`/careers/applications/${id}/refer`, { assigneeId });
}

export function hireApplication(id: string) {
  return apiPatch<{ id: string; status: string }>(`/careers/applications/${id}/hire`);
}

export function rejectApplication(id: string) {
  return apiPatch<{ id: string; status: string }>(`/careers/applications/${id}/reject`);
}

// ── SITE_ADMIN: settings ─────────────────────────────────────────────
export function updateCareersSettings(enabled: boolean) {
  return apiPatch<CareersSettings>('/careers/settings', { enabled });
}
