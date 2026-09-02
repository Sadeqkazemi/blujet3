import type { StoredLocale } from '../../../hooks/useLocale';
import { localeDigits } from '../../../lib/locale-format';
import type { CheckoutWizardStep } from './checkout-types';
import { CHECKOUT_COPY } from './checkout-copy';

export type CheckoutProgressStep = CheckoutWizardStep | 'payment';

const STEP_ORDER: CheckoutProgressStep[] = ['pax', 'extras', 'review', 'payment'];

function StepIcon({ step, done }: { step: CheckoutProgressStep; done: boolean }) {
  if (done) return <span aria-hidden="true">✓</span>;
  if (step === 'pax') {
    return (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-4 3.2-6 7-6s7 2 7 6" />
      </svg>
    );
  }
  if (step === 'extras') {
    return (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="7" width="16" height="13" rx="2" />
        <path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7M4 12h16" />
      </svg>
    );
  }
  if (step === 'review') {
    return (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export default function CheckoutStepBar({
  current,
  locale,
}: {
  current: CheckoutProgressStep;
  locale: StoredLocale;
}) {
  const t = CHECKOUT_COPY[locale];
  const currentIdx = STEP_ORDER.indexOf(current);
  const progressPct = `${(currentIdx / (STEP_ORDER.length - 1)) * 100}%`;

  return (
    <div className="hidden border-b border-[#e8eef6] bg-[#f6f9fd] md:block" data-testid="checkout-desktop-stepper">
      <div className="relative mx-auto max-w-[900px] px-10 py-7">
        <div className="absolute left-[76px] right-[76px] top-[48px] h-[3px] rounded-sm bg-[#e2e7ee]">
          <div
            className="h-full rounded-sm bg-[#1668c4] transition-all duration-300"
            style={{ width: progressPct }}
          />
        </div>
        <div className="relative flex items-start justify-between">
          {STEP_ORDER.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const bg = done || active ? '#1668c4' : '#fff';
            const color = done || active ? '#fff' : '#9aa4b2';
            const border = done || active ? '#1668c4' : '#e2e7ee';
            const labelColor = active ? '#1668c4' : done ? '#1668c4' : '#9aa4b2';
            return (
              <div key={step} className="flex min-w-[74px] flex-col items-center gap-2">
                <div
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-full border-[2.5px] text-[13px] font-extrabold shadow-sm transition-all"
                  style={{ background: bg, color, borderColor: border }}
                  data-testid={`checkout-step-${step}`}
                >
                  <StepIcon step={step} done={done} />
                </div>
                <span
                  className="whitespace-nowrap text-[11.5px]"
                  style={{ fontWeight: active ? 800 : 600, color: labelColor }}
                >
                  {step === 'payment'
                    ? locale === 'en'
                      ? 'Payment'
                      : locale === 'ar'
                        ? 'الدفع'
                        : 'پرداخت'
                    : t.steps[step]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function stepNumberLabel(step: CheckoutProgressStep, locale: StoredLocale): string {
  const idx = STEP_ORDER.indexOf(step) + 1;
  return localeDigits(idx, locale);
}
