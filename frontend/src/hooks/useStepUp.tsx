import { useRef, useState } from 'react';
import Modal from '../components/Modal';
import { requestStepUp, type StepUpScope } from '../api/auth';
import { ApiRequestError } from '../api/envelope';

export interface StepUpFields {
  stepUpChallengeId: string;
  stepUpCode: string;
}

/** Phase 15 — before a high-risk write (admin creation, API key rotation,
 * refund payout, price/capacity change, site-wide logout), the caller must
 * await confirm() to get a fresh step-up challenge id + code, then send
 * those two fields on the actual mutation. Rejects with an Error whose
 * message is 'CANCELLED' if the user closes the modal. */
export function useStepUp(scope: StepUpScope) {
  const [open, setOpen] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const resolver = useRef<((fields: StepUpFields) => void) | null>(null);
  const rejecter = useRef<((err: unknown) => void) | null>(null);

  async function confirm(): Promise<StepUpFields> {
    setError(null);
    setCode('');
    setOpen(true);
    setRequesting(true);
    try {
      const { challengeId: id } = await requestStepUp(scope);
      setChallengeId(id);
    } catch (err) {
      setOpen(false);
      throw err instanceof ApiRequestError ? err : new Error('خطا در ارسال کد تأیید.');
    } finally {
      setRequesting(false);
    }
    return new Promise<StepUpFields>((resolve, reject) => {
      resolver.current = resolve;
      rejecter.current = reject;
    });
  }

  function submit() {
    if (!challengeId || code.trim().length !== 6) {
      setError('کد ۶ رقمی را کامل وارد کنید.');
      return;
    }
    resolver.current?.({ stepUpChallengeId: challengeId, stepUpCode: code.trim() });
    resolver.current = null;
    rejecter.current = null;
    setOpen(false);
    setChallengeId(null);
    setCode('');
  }

  function cancel() {
    rejecter.current?.(new Error('CANCELLED'));
    resolver.current = null;
    rejecter.current = null;
    setOpen(false);
    setChallengeId(null);
    setCode('');
  }

  const modal = open ? (
    <Modal title="تأیید مجدد هویت" onClose={cancel}>
      <p className="mb-4 text-[11.5px] leading-[1.9] text-muted">
        برای انجام این عملیات حساس، کد تأیید ارسال‌شده را وارد کنید.
      </p>
      {requesting && !challengeId ? (
        <p className="text-[11.5px] text-muted">در حال ارسال کد…</p>
      ) : (
        <>
          <input
            dir="ltr"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            className="font-num mb-3 h-[46px] w-full rounded-xl border border-border bg-[#f8fafc] px-3.5 text-center text-lg tracking-[0.4em] text-ink outline-none focus:border-accent"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[11.5px] text-red-600"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-br from-accent to-navy-2 text-[13px] font-extrabold text-white shadow-lg transition hover:brightness-110"
          >
            تأیید
          </button>
        </>
      )}
    </Modal>
  ) : null;

  return { confirm, modal };
}
