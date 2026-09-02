import { useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { StoredLocale } from '../../../hooks/useLocale';
import PassengerStep from './PassengerStep';
import { CHECKOUT_COPY } from './checkout-copy';
import type { PassengerFormDraft } from './checkout-types';
import type { SavedPassenger } from '../../../types/public-site';

export default function ReviewPassengerEditModal({
  locale,
  passengers: initial,
  savedPassengers,
  departureAt,
  onSave,
  onClose,
}: {
  locale: StoredLocale;
  passengers: PassengerFormDraft[];
  savedPassengers: SavedPassenger[];
  departureAt: string;
  onSave: (passengers: PassengerFormDraft[]) => void;
  onClose: () => void;
}) {
  const t = CHECKOUT_COPY[locale];
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(initial);

  return (
    <div
      className={`fixed inset-0 z-[220] flex bg-[rgba(13,38,64,.55)] ${
        isMobile ? 'items-end justify-center p-0' : 'items-center justify-center p-5'
      }`}
      onClick={onClose}
      data-testid="checkout-edit-pax-modal"
    >
      <div
        className={`w-full overflow-y-auto bg-white shadow-[0_30px_70px_-20px_rgba(0,0,0,.45)] ${
          isMobile
            ? 'max-h-[92vh] rounded-t-[18px] p-4'
            : 'max-h-[90vh] max-w-[640px] rounded-[18px] p-5'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-black text-[#0d2640]">{t.editPaxPopupTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancelBtn}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e6eaf0] bg-[#f3f5f8] text-[#0d2640]"
          >
            ×
          </button>
        </div>
        <PassengerStep
          locale={locale}
          passengers={draft}
          onChange={setDraft}
          savedPassengers={savedPassengers}
          departureAt={departureAt}
          lockPassengerCount
        />
        <div className={`mt-4 flex gap-2.5 ${isMobile ? 'flex-col' : 'flex-wrap'}`}>
          <button
            type="button"
            data-testid="checkout-edit-pax-save"
            onClick={() => onSave(draft)}
            className={`rounded-[11px] bg-[#1668c4] px-5 py-2.5 text-[13px] font-extrabold text-white ${
              isMobile ? 'w-full' : ''
            }`}
          >
            {t.savePaxEdits}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-[11px] border border-[#e2e7ee] bg-white px-5 py-2.5 text-[13px] font-bold text-[#5a6678] ${
              isMobile ? 'w-full' : ''
            }`}
          >
            {t.cancelBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
