import { apiDelete, apiGetBlob, apiPostForm } from './http';

export interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
}

export function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm<UploadedFile>('/files', form);
}

/** Owner-only delete — staff roles. Idempotent end-state (repeat → 404). */
export function deleteFile(id: string) {
  return apiDelete<{ id: string }>(`/files/${id}`);
}

/** Downloads a file the caller may read (owner, or a participant of the
 * referral/report/message it's attached to — enforced server-side) and
 * saves it via a client-side blob link. */
export async function downloadFile(id: string, fileName: string) {
  const blob = await apiGetBlob(`/files/${id}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads an authorized file for an inline preview without bypassing the
 * shared authenticated request/refresh path. */
export function fetchFileBlob(id: string) {
  return apiGetBlob(`/files/${id}`);
}
