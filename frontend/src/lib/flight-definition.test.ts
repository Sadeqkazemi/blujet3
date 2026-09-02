import { describe, expect, it } from "vitest";
import {
  computeArrivalHhMm,
  flightNoError,
  formatDurationFa,
  isValidFlightNo,
  isValidHhMm,
  minutesFromDuration,
  previewChargeTotalIrr,
  previewChargeTotalsByCabin,
  sanitizeFlightNoInput,
  sumCabinSeats,
} from "./flight-definition";
import { formatTomanGrouped, tomanDigitsOnly } from "./money-input";
import { parseTomanToRial, parseTomanToRialString } from "./fa-format";

describe("flight number", () => {
  it("uppercases pure alnum input and caps at 6 chars", () => {
    expect(sanitizeFlightNoInput("xy1234")).toBe("XY1234");
    expect(sanitizeFlightNoInput("ab99999")).toBe("AB9999");
  });

  it("does not strip spaces or hyphens (paste stays invalid)", () => {
    expect(sanitizeFlightNoInput(" XY1234 ")).toBe(" XY1234 ");
    expect(sanitizeFlightNoInput("xy-12 34")).toBe("XY-12 34");
    expect(isValidFlightNo(" XY1234 ")).toBe(false);
    expect(isValidFlightNo("XY-1234")).toBe(false);
  });

  it("validates ^[A-Z]{2}\\d{4}$ and rejects untrimmed values", () => {
    expect(isValidFlightNo("XY1234")).toBe(true);
    expect(isValidFlightNo("EP905")).toBe(false);
    expect(isValidFlightNo("XY1234 ")).toBe(false);
    expect(flightNoError("AB12")).toMatch(/دو حرف/);
    expect(flightNoError(" XY1234 ")).toMatch(/دو حرف/);
  });
});

describe("duration", () => {
  it("rejects zero and builds minutes", () => {
    expect(minutesFromDuration(0, 0)).toBeNull();
    expect(minutesFromDuration(2, 15)).toBe(135);
    expect(formatDurationFa(135)).toBe("۲ ساعت و ۱۵ دقیقه");
  });

  it("computes arrival HH:mm", () => {
    expect(computeArrivalHhMm("08:30", 135)).toBe("10:45");
    expect(isValidHhMm("08:30")).toBe(true);
    expect(isValidHhMm("8:30")).toBe(false);
  });
});

describe("cabin capacities", () => {
  it("sums seats and supports three cabin kinds in preview math", () => {
    expect(sumCabinSeats([{ seats: 12 }, { seats: 20 }, { seats: 148 }])).toBe(
      180,
    );
  });
});

describe("money grouping", () => {
  it("formats separators and converts toman to rial without float", () => {
    expect(formatTomanGrouped("۱۲۳۴۵۶۷")).toBe("۱٬۲۳۴٬۵۶۷");
    expect(formatTomanGrouped("1,234,567")).toBe("۱٬۲۳۴٬۵۶۷");
    expect(tomanDigitsOnly("۱٬۲۳۴٬۵۶۷")).toBe("1234567");
    expect(parseTomanToRial(tomanDigitsOnly("۱٬۲۳۴٬۵۶۷"))).toBe(12_345_670);
    expect(parseTomanToRialString(tomanDigitsOnly("۱٬۲۳۴٬۵۶۷"))).toBe(
      "12345670",
    );
  });
});

describe("charge preview", () => {
  const mixedRules = [
    {
      kind: "TAX" as const,
      method: "FIXED" as const,
      amount: 100_000,
      cabin: "ALL" as const,
      active: true,
    },
    {
      kind: "FEE" as const,
      method: "PERCENT" as const,
      amount: 10,
      cabin: "ECONOMY" as const,
      active: true,
    },
  ];

  it("adds fixed and percent lines for a specific cabin", () => {
    const preview = previewChargeTotalIrr(
      "10000000",
      mixedRules,
      "ECONOMY",
    );
    expect(preview.lines).toHaveLength(2);
    expect(preview.totalIrr).toBe("11100000");
  });

  it("returns per-cabin summaries via previewChargeTotalsByCabin", () => {
    const byCabin = previewChargeTotalsByCabin("10000000", mixedRules);
    expect(byCabin.ECONOMY.totalIrr).toBe("11100000");
    expect(byCabin.COMFORT.totalIrr).toBe("10100000");
    expect(byCabin.BUSINESS.totalIrr).toBe("10100000");
  });

  it("does not include BUSINESS tax in ECONOMY total", () => {
    const rules = [
      {
        kind: "TAX" as const,
        method: "FIXED" as const,
        amount: "500000",
        cabin: "BUSINESS" as const,
        active: true,
        title: "مالیات بیزینس",
      },
      {
        kind: "TAX" as const,
        method: "FIXED" as const,
        amount: "100000",
        cabin: "ECONOMY" as const,
        active: true,
        title: "مالیات اکونومی",
      },
    ];
    const economy = previewChargeTotalIrr("10000000", rules, "ECONOMY");
    const business = previewChargeTotalIrr("10000000", rules, "BUSINESS");

    expect(economy.lines).toHaveLength(1);
    expect(economy.lines[0]?.title).toBe("مالیات اکونومی");
    expect(economy.totalIrr).toBe("10100000");
    expect(business.lines).toHaveLength(1);
    expect(business.lines[0]?.title).toBe("مالیات بیزینس");
    expect(business.totalIrr).toBe("10500000");
  });
});
