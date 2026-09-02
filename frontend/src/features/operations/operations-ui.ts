import type { OperationsFlightStatus } from "../../types/flights";

export const OPERATIONS_STATUS_META: Record<
  OperationsFlightStatus,
  { label: string; className: string }
> = {
  PENDING_OPERATIONS: {
    label: "در انتظار بررسی من",
    className: "bg-amber-400/15 text-amber-300",
  },
  OPERATIONS_REJECTED: {
    label: "رد شده — نزد بازرگانی",
    className: "bg-rose-400/15 text-rose-300",
  },
  REJECTED: {
    label: "رد شده توسط مدیر عامل — نزد بازرگانی",
    className: "bg-rose-400/15 text-rose-300",
  },
  PENDING_CEO: {
    label: "ارسال‌شده به مدیر عامل",
    className: "bg-blue-400/15 text-blue-300",
  },
  PUBLISHED: {
    label: "تأیید نهایی شده",
    className: "bg-emerald-400/15 text-emerald-300",
  },
};

export function operationsRouteLabel(originCode: string, destCode: string) {
  return `${originCode} ← ${destCode}`;
}
