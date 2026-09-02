import { useState } from 'react';
import Modal from '../../components/Modal';
import { decideAgencyWebserviceRequest } from '../../api/agencies';
import { ApiRequestError } from '../../api/envelope';
import { faDigits, faMoney } from '../../lib/fa-format';
import { useStepUp } from '../../hooks/useStepUp';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';

const SCOPE_LABEL: Record<string, string> = {
  FULL: 'دسترسی کامل',
  SEARCH_BOOK: 'جستجو و رزرو',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید و فعال شد',
  REJECTED: 'رد شد',
};

interface WebserviceRequestDetailModalProps {
  request: AgencyWebserviceQueueRow;
  onClose: () => void;
  onDecided: () => void;
}

/** Design: WEB SERVICE REQUEST DETAIL MODAL. Real data via GET /agencies/webservice-requests. */
export default function WebserviceRequestDetailModal({
  request,
  onClose,
  onDecided,
}: WebserviceRequestDetailModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const stepUp = useStepUp('API_KEY_ROTATE');

  async function decide(approve: boolean) {
    setError(null);
    setBusy(approve ? 'approve' : 'reject');
    try {
      let dto: { approve: boolean; stepUpChallengeId?: string; stepUpCode?: string } = { approve };
      if (approve) {
        const fields = await stepUp.confirm();
        dto = { approve: true, ...fields };
      }
      await decideAgencyWebserviceRequest(request.agencyId, request.id, dto);
      onDecided();
    } catch (e) {
      if (e instanceof Error && e.message === 'CANCELLED') return;
      setError(e instanceof ApiRequestError ? e.message : 'خطا در ثبت تصمیم.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <Modal title="جزئیات درخواست خرید وب‌سرویس" onClose={onClose} maxWidthClass="max-w-[520px]">
      <p className="mb-4 text-[11.5px] text-[#9fb0c7]">{request.agencyName}</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">نوع وب‌سرویس</div>
          <div className="text-[13.5px] font-extrabold text-[#e7ecf3]">{SCOPE_LABEL[request.scope] ?? request.scope}</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">پلن</div>
          <div className="text-[13.5px] font-extrabold text-[#e7ecf3]">{faDigits(request.months)} ماهه</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">قیمت</div>
          <div className="font-num text-[13.5px] font-extrabold text-[#34d399]">{faMoney(request.priceIrr)} تومان</div>
        </div>
        <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3">
          <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">وضعیت</div>
          <div className="text-[13.5px] font-extrabold text-[#f59e0b]">{STATUS_LABEL[request.status] ?? request.status}</div>
        </div>
      </div>

      {request.note && (
        <div className="mb-4 rounded-[11px] border border-[#22304a] bg-[#0f1623] p-3 text-xs leading-relaxed text-[#cdd7e5]">
          {request.note}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-[#f87171]">{error}</p>}

      {request.status === 'PENDING' && (
        <div className="flex gap-2.5">
          <button
            disabled={busy !== null}
            onClick={() => void decide(true)}
            className="flex h-[46px] flex-1 items-center justify-center rounded-[11px] bg-[#1f8a5b] text-[13px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy === 'approve' ? 'در حال ثبت…' : 'تأیید و فعال‌سازی'}
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
    </Modal>
    {stepUp.modal}
    </>
  );
}
