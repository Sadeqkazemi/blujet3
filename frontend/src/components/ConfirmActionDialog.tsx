import Modal from './Modal';

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  variant?: 'dark' | 'light';
  tone?: 'danger' | 'primary';
  testId?: string;
}

/** Shared confirmation surface for destructive and session-ending actions. */
export default function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  busyLabel,
  error,
  variant = 'dark',
  tone = 'danger',
  testId = 'confirm-action-dialog',
}: ConfirmActionDialogProps) {
  if (!open) return null;

  const dark = variant === 'dark';
  const confirmClass =
    tone === 'danger'
      ? 'bg-[#e5484d] text-white hover:bg-[#cf3e43]'
      : 'bg-[#1668c4] text-white hover:bg-[#125aa8]';

  return (
    <Modal title={title} onClose={busy ? () => undefined : onCancel} variant={variant}>
      <div data-testid={testId} className="space-y-5">
        <p className={`m-0 text-[13px] leading-7 ${dark ? 'text-[#c7d2e3]' : 'text-[#526071]'}`}>
          {message}
        </p>

        {error ? (
          <p
            role="alert"
            data-testid={`${testId}-error`}
            className="m-0 rounded-xl border border-[#ef444455] bg-[#ef444414] px-3 py-2.5 text-xs font-semibold text-[#ef4444]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            disabled={busy}
            onClick={onCancel}
            className={`rounded-[10px] border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              dark
                ? 'border-[#33415c] text-[#c7d2e3] hover:bg-white/5'
                : 'border-[#d9e1eb] text-[#526071] hover:bg-[#f6f8fb]'
            }`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`rounded-[10px] px-4 py-2.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
