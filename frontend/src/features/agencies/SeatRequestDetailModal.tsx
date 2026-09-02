import { useState } from 'react';
import Modal from '../../components/Modal';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import { decideAggregateSeatRequest } from '../../api/agencies';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDate, formatJalaliDateTime } from '../../lib/jalali';
import type { AgencySeatRequestRow } from '../../types/agencies';
import { seatRequestTermLabel } from './agency-labels';

const PAY_METHOD_LABEL: Record<AgencySeatRequestRow['payMethod'], string> = {
  CREDIT: 'اعتباری',
  INVOICE: 'فاکتوری',
};

const STATUS_LABEL: Record<AgencySeatRequestRow['status'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'در انتظار بررسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  PENDING_FINANCE: { label: 'در انتظار تأیید مالی', color: '#a78bfa', bg: 'rgba(167,139,250,.14)' },
  APPROVED: { label: 'تأیید شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  REJECTED: { label: 'رد شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
};

interface SeatRequestDetailModalProps {
  request: AgencySeatRequestRow;
  onClose: () => void;
  onDecided: () => void;
}

/**
 * Design: SEAT REQUEST DETAIL MODAL.
 */
export default function SeatRequestDetailModal({ request, onClose, onDecided }: SeatRequestDetailModalProps) {
  const [dueDraft, setDueDraft] = useState(request.dueAt ?? '');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const status = STATUS_LABEL[request.status];

  async function decide(approve: boolean) {
    setBusy(approve ? 'approve' : 'reject');
    try {
      await decideAggregateSeatRequest(request.id, approve, approve ? dueDraft || undefined : undefined);
      onDecided();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="جزئیات درخواست خرید صندلی" onClose={onClose} maxWidthClass="max-w-[560px]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-[11.5px] text-[#9fb0c7]">
          {request.agencyName} · {request.routeFa}
        </p>
        <span className="rounded-[14px] bg-[#18223a] px-2.5 py-1 text-[11px] font-bold text-[#9fb0c7]">
          روش پرداخت: {PAY_METHOD_LABEL[request.payMethod]}
        </span>
        {request.invoiceNo && (
          <span className="ltr font-num rounded-[14px] bg-[rgba(59,130,246,.14)] px-2.5 py-1 text-[11px] font-bold text-[#60a5fa]">
            {request.invoiceNo}
          </span>
        )}
        <span
          className="mr-auto rounded-[14px] px-2.5 py-1 text-[10px] font-bold"
          style={{ color: status.color, background: status.bg }}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-2.5 text-[11.5px] font-extrabold text-[#e7ecf3]">اطلاعات آژانس</div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">مدیر مسئول</div>
          <div className="text-[13px] font-extrabold text-[#e7ecf3]">{request.managerName}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">تلفن</div>
          <div className="ltr font-num text-[13px] font-extrabold text-[#e7ecf3]">{request.phone}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">شهر</div>
          <div className="text-[13px] font-extrabold text-[#e7ecf3]">{request.city}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">مجوز بند ب</div>
          <div className="ltr font-num text-[13px] font-extrabold text-[#e7ecf3]">{request.licenseNo}</div>
        </div>
      </div>

      <div className="mb-2.5 text-[11.5px] font-extrabold text-[#e7ecf3]">جزئیات درخواست</div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">تعداد صندلی درخواستی</div>
          <div className="font-num text-sm font-extrabold text-[#f59e0b]">{faDigits(request.seats)}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">دورهٔ خرید</div>
          <div className="text-sm font-extrabold text-[#e7ecf3]">{seatRequestTermLabel(request.months)}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">نوع هواپیما</div>
          <div className="text-sm font-extrabold text-[#e7ecf3]">{request.aircraftType}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">قیمت هر صندلی</div>
          <div className="font-num text-sm font-extrabold text-[#60a5fa]">{faMoney(request.unitPriceIrr)} تومان</div>
        </div>
        <div className="col-span-2 rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">مبلغ کل فاکتور</div>
          <div className="font-num text-sm font-extrabold text-[#34d399]">{faMoney(request.totalIrr)} تومان</div>
        </div>
      </div>

      <div className="mb-4 rounded-[11px] border border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.08)] p-3">
        {request.status === 'PENDING' ? (
          <>
            <p className="mb-2 text-[11.5px] text-[#cbb38a]">
              مهلت پرداخت فاکتور — یک هفته پس از تأیید درخواست؛ در صورت نیاز قابل تغییر است
            </p>
            <div className="h-[42px] overflow-hidden rounded-[9px] border border-[rgba(245,158,11,.4)] bg-[#0f1623]">
              <JalaliDatePicker
                label="مهلت پرداخت"
                value={dueDraft || null}
                onChange={setDueDraft}
                theme="dark"
                singleLine
                placeholder="تعیین تاریخ"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[11.5px] text-[#cbb38a]">مهلت پرداخت فاکتور (تعیین‌شده توسط مدیر بازرگانی)</span>
            <span className="text-[12.5px] font-extrabold text-[#f59e0b]">
              {request.dueAt ? formatJalaliDate(request.dueAt) : '—'}
            </span>
          </div>
        )}
      </div>

      <div className="mb-2.5 text-[11.5px] font-extrabold text-[#e7ecf3]">
        پروازهای درخواستی ({faDigits(request.flights.length)})
      </div>
      <div className="mb-1 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
        {request.flights.length === 0 ? (
          <p className="py-3.5 text-center text-[11.5px] text-[#6b7b94]">مسیر مربوطه یافت نشد یا حذف شده است.</p>
        ) : (
          request.flights.map((fl, i) => (
            <div
              key={`${fl.flightNo}-${i}`}
              className="flex items-center justify-between rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 py-2.5"
            >
              <span className="ltr font-num rounded-[7px] bg-[rgba(59,130,246,.14)] px-2.5 py-1 text-[11px] font-extrabold text-[#60a5fa]">
                {fl.flightNo}
              </span>
              <span className="text-[11.5px] text-[#e7ecf3]">{formatJalaliDate(fl.date)}</span>
              <span className="ltr font-num text-[11px] text-[#8494ac]">{fl.time}</span>
            </div>
          ))
        )}
      </div>

      {request.status === 'PENDING_FINANCE' && (
        <div className="mt-3.5 flex items-center gap-1.5 rounded-[11px] border border-[rgba(167,139,250,.3)] bg-[rgba(167,139,250,.1)] px-3.5 py-2.5 text-[11.5px] font-bold text-[#a78bfa]">
          این درخواست خرید اعتباری برای تأیید نهایی نزد مدیر مالی است.
        </div>
      )}

      {request.status === 'PENDING' && (
        <div className="mt-4 flex gap-2.5">
          <button
            disabled={busy !== null}
            onClick={() => void decide(true)}
            className="flex h-[46px] flex-1 items-center justify-center rounded-[11px] bg-[#1f8a5b] text-[13px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy === 'approve' ? 'در حال ثبت…' : 'تأیید و صدور فاکتور'}
          </button>
          <button
            disabled={busy !== null}
            onClick={() => void decide(false)}
            className="flex h-[46px] items-center justify-center rounded-[11px] bg-[rgba(248,113,113,.1)] px-5 text-[12.5px] font-bold text-[#f87171] transition hover:bg-[rgba(248,113,113,.18)] disabled:opacity-60"
          >
            رد درخواست
          </button>
        </div>
      )}
      <p className="mt-3 text-[10px] text-[#5a6678]">
        ثبت‌شده: {formatJalaliDateTime(request.createdAt)}
      </p>
    </Modal>
  );
}
