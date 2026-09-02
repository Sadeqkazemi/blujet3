import {
  sanitizeFlightNoInput,
  flightNoError,
} from "../../../lib/flight-definition";

const inputClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none";

export default function FlightNumberInput({
  id = "af-no",
  value,
  onChange,
  showError,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  showError?: boolean;
}) {
  const error = showError ? flightNoError(value) : null;
  return (
    <div>
      <label
        className="mb-[7px] block text-[11.5px] text-[#9fb0c7]"
        htmlFor={id}
      >
        شماره پرواز *
      </label>
      <input
        id={id}
        data-testid="flight-no-input"
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        maxLength={8}
        placeholder="XY1234"
        value={value}
        onChange={(e) => onChange(sanitizeFlightNoInput(e.target.value))}
        aria-invalid={Boolean(error)}
        className={`${inputClass} text-left font-num tracking-wide ${
          error ? "border-[#f87171]" : ""
        }`}
      />
      {error && (
        <p
          role="alert"
          className="mt-1.5 text-[11px] font-semibold text-[#f87171]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
