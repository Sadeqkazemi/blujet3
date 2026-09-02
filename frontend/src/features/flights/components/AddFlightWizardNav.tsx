const STEPS = [
  "مشخصات رخداد",
  "کلاس‌های نرخی",
  "قیمت و ارسال",
] as const;

export default function AddFlightWizardNav({
  activeStep,
  onStep,
}: {
  activeStep: number;
  onStep: (step: number) => void;
}) {
  return (
    <nav
      aria-label="مراحل افزودن پرواز"
      className="mb-4 grid grid-cols-1 gap-2 rounded-2xl border border-[#1f2a3d] bg-[#111a2b] p-2 sm:grid-cols-3"
      data-testid="add-flight-wizard"
    >
      {STEPS.map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => onStep(index)}
          aria-current={activeStep === index ? "step" : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-extrabold transition ${
            activeStep === index
              ? "bg-[#3b82f6] text-white"
              : index < activeStep
                ? "bg-[rgba(52,211,153,.1)] text-[#6ee7b7]"
                : "bg-[#18223a] text-[#8ea0b8]"
          }`}
        >
          <span className="font-num">{index + 1}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
