import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import CabinCapacityEditor, {
  type CabinCapacityRow,
} from "./CabinCapacityEditor";
import DurationFields from "./DurationFields";
import FlightNumberInput from "./FlightNumberInput";
import type { DraftChargeRule } from "../../../lib/charge-rules-adapter";
import ChargeRulesEditor from "./ChargeRulesEditor";
import { useState } from "react";

describe("FlightNumberInput", () => {
  it("uppercases pure alnum typing", async () => {
    const user = userEvent.setup();
    function H() {
      const [v, setV] = useState("");
      return <FlightNumberInput value={v} onChange={setV} showError />;
    }
    render(<H />);
    await user.type(screen.getByTestId("flight-no-input"), "xy12ab");
    expect(screen.getByTestId("flight-no-input")).toHaveValue("XY12AB");
  });

  it("keeps pasted spaces so validation rejects them", async () => {
    const user = userEvent.setup();
    function H() {
      const [v, setV] = useState("");
      return <FlightNumberInput value={v} onChange={setV} showError />;
    }
    render(<H />);
    const input = screen.getByTestId("flight-no-input");
    await user.click(input);
    await user.paste(" XY1234 ");
    expect(input).toHaveValue(" XY1234 ");
    expect(screen.getByRole("alert")).toHaveTextContent(/دو حرف/);
  });
});

describe("DurationFields", () => {
  it("shows Persian duration summary", async () => {
    const user = userEvent.setup();
    function H() {
      const [h, setH] = useState(0);
      const [m, setM] = useState(0);
      return (
        <DurationFields
          hours={h}
          minutes={m}
          onHours={setH}
          onMinutes={setM}
          showError
        />
      );
    }
    render(<H />);
    await user.selectOptions(screen.getByTestId("duration-hours"), "2");
    await user.selectOptions(screen.getByTestId("duration-minutes"), "15");
    expect(screen.getByTestId("duration-summary")).toHaveTextContent(
      "۲ ساعت و ۱۵ دقیقه",
    );
  });
});

describe("CabinCapacityEditor", () => {
  it("prevents duplicate cabin kinds and shows live total", async () => {
    const user = userEvent.setup();
    function H() {
      const [rows, setRows] = useState<CabinCapacityRow[]>([
        { key: "1", cabin: "ECONOMY", seats: "100" },
        { key: "2", cabin: "BUSINESS", seats: "20" },
      ]);
      return <CabinCapacityEditor rows={rows} onChange={setRows} />;
    }
    render(<H />);
    expect(screen.getByText(/جمع صندلی‌ها/)).toBeInTheDocument();
    expect(screen.getByText("۱۲۰")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "افزودن کابین" }));
    expect(screen.getAllByTestId("cabin-row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "افزودن کابین" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "افزودن کابین" }));
    expect(screen.getAllByTestId("cabin-row")).toHaveLength(4);
    // FIRST, BUSINESS, COMFORT and ECONOMY are all used.
    expect(screen.getByRole("button", { name: "افزودن کابین" })).toBeDisabled();
  });
});

describe("ChargeRulesEditor", () => {
  it("adds a fixed tax rule and shows breakdown preview", async () => {
    const user = userEvent.setup();
    function H() {
      const [rules, setRules] = useState<DraftChargeRule[]>([]);
      return (
        <ChargeRulesEditor
          rules={rules}
          onChange={setRules}
          basePriceIrr={10_000_000}
        />
      );
    }
    render(<H />);
    await user.click(screen.getByRole("button", { name: "افزودن قانون" }));
    await user.type(screen.getByLabelText("عنوان"), "مالیات فرودگاهی");
    await user.type(screen.getByTestId("charge-amount-money"), "10000");
    await user.click(screen.getByRole("button", { name: "ذخیره قانون" }));
    expect(await screen.findByTestId("charge-rule-row")).toBeInTheDocument();
    expect(screen.getByTestId("charge-breakdown-preview")).toHaveTextContent(
      "قیمت پایه",
    );
  });
});
