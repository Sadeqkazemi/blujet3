import { apiPost } from './http';
import type { ContactMessageRow } from '../types/support-tickets';

// تماس با ما — public inbound message, no login required.
export function submitContactMessage(dto: {
  name: string;
  phone: string;
  subject: string;
  body: string;
}) {
  return apiPost<ContactMessageRow>('/contact', dto);
}
