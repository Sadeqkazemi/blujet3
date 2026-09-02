import type { AgencyDocumentStatus, AgencyDocumentType, AgencyInvoiceStatus, AgencyTier } from '../../types/agencies';

/** Label/tone maps shared by the agencies pages — exact strings from the design. */

export const TIER_LABELS: Record<AgencyTier, string> = {
  GOLD: 'طلایی',
  SILVER: 'نقره‌ای',
  NORMAL: 'عادی',
};

export const INVOICE_STATUS: Record<AgencyInvoiceStatus, { label: string; className: string }> = {
  PAID: { label: 'تسویه شد', className: 'bg-[#34d39924] text-[#34d399]' },
  UNPAID: { label: 'در انتظار پرداخت', className: 'bg-[#f59e0b24] text-[#b45309]' },
  OVERDUE: { label: 'معوق', className: 'bg-danger/15 text-danger' },
};

export const DOCUMENT_TYPE_LABELS: Record<AgencyDocumentType, string> = {
  LICENSE: 'مجوز فعالیت',
  CONTRACT: 'قرارداد',
  OTHER: 'سایر',
};

export const DOCUMENT_STATUS: Record<AgencyDocumentStatus, { label: string; className: string }> = {
  PENDING: { label: 'در انتظار بررسی', className: 'bg-[#f59e0b24] text-[#b45309]' },
  APPROVED: { label: 'تأیید شد', className: 'bg-[#34d39924] text-[#34d399]' },
  REJECTED: { label: 'رد شد', className: 'bg-danger/15 text-danger' },
};

export const REQUEST_STATUS = DOCUMENT_STATUS;

export const ACTIVE_BADGE = { label: 'فعال', className: 'bg-[#34d39924] text-[#34d399]' };
export const SUSPENDED_BADGE = { label: 'تعلیق‌شده', className: 'bg-danger/15 text-danger' };

export function statusBadge(isActive: boolean) {
  return isActive ? ACTIVE_BADGE : SUSPENDED_BADGE;
}

export function seatRequestTermLabel(months: 0 | 1 | 3 | 6 | 12) {
  return months === 0 ? 'هفتگی' : `${months.toLocaleString('fa-IR')} ماهه`;
}
