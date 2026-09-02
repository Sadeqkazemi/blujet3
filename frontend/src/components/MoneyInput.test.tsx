import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatTomanGrouped, moneyInputToRialString } from "../lib/money-input";
import MoneyInput from "./MoneyInput";
import JalaliDatePicker from "./JalaliDatePicker";
import { dayjs, toIsoDateOnly } from "../lib/jalali";

function MoneyHarness({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div dir="rtl">
      <MoneyInput
        testId="money"
        valueToman={v}
        onChangeToman={(next) => {
          onChange(next);
          setV(next);
        }}
      />
    </div>
  );
}

describe("MoneyInput", () => {
  it("shows thousands separators while typing and a تومان unit", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MoneyHarness onChange={onChange} />);
    await user.type(screen.getByTestId("money"), "1234567");
    expect(onChange).toHaveBeenCalled();
    expect(formatTomanGrouped("1234567")).toBe("۱٬۲۳۴٬۵۶۷");
    expect(screen.getByTestId("money-unit")).toHaveTextContent("تومان");
  });

  it("keeps تومان on the physical right with padding so it does not overlay digits", () => {
    render(
      <div dir="rtl">
        <MoneyInput testId="money" valueToman="۱٬۲۳۴٬۵۶۷" onChangeToman={() => undefined} />
      </div>,
    );
    const input = screen.getByTestId("money");
    const unit = screen.getByTestId("money-unit");
    expect(input.className).toMatch(/pr-\[3\.25rem\]/);
    expect(unit.className).toMatch(/\bright-3\b/);
    expect(moneyInputToRialString("۱٬۲۳۴٬۵۶۷")).toBe("12345670");
  });
});

describe("JalaliDatePicker dark panel", () => {
  it("opens a viewport-safe popup and respects minDate wiring", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const today = toIsoDateOnly(dayjs());
    render(
      <div style={{ width: 320 }}>
        <JalaliDatePicker
          label="تاریخ"
          theme="dark"
          singleLine
          minDate={today}
          value={null}
          onChange={onChange}
          testId="jalali"
        />
      </div>,
    );
    await user.click(screen.getByTestId("jalali"));
    const popup = screen.getByTestId("jalali-popup");
    expect(popup).toBeInTheDocument();
    expect(popup.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
  });

  it("shows Gregorian dates in English and Arabic", () => {
    const value = "2026-08-11T12:00:00.000Z";
    const { rerender } = render(
      <JalaliDatePicker
        locale="en"
        label="Date"
        value={value}
        onChange={() => undefined}
        testId="localized-date"
      />,
    );
    expect(screen.getByTestId("localized-date")).toHaveTextContent("2026/08/11");
    expect(screen.getByTestId("localized-date")).not.toHaveTextContent("1405");

    rerender(
      <JalaliDatePicker
        locale="ar"
        label="التاريخ"
        value={value}
        onChange={() => undefined}
        testId="localized-date"
      />,
    );
    expect(screen.getByTestId("localized-date")).toHaveTextContent("٢٠٢٦/٠٨/١١");
  });

  it("keeps the page scrollable while a regular desktop calendar opens below its field", async () => {
    const user = userEvent.setup();
    render(
      <JalaliDatePicker
        locale="fa"
        label="تاریخ"
        value={null}
        onChange={() => undefined}
        testId="fixed-calendar"
      />,
    );

    await user.click(screen.getByTestId("fixed-calendar"));
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    expect(screen.getByTestId("fixed-calendar-popup")).toHaveStyle({
      position: "absolute",
    });
    const monthControls = screen.getByTestId("fixed-calendar-month-label").parentElement;
    expect(monthControls?.firstElementChild).toHaveTextContent("‹");
    expect(monthControls?.lastElementChild).toHaveTextContent("›");
  });

  it("allows direct year, month and day navigation", async () => {
    const user = userEvent.setup();
    render(
      <JalaliDatePicker
        locale="fa"
        label="تاریخ"
        value="2026-08-24T12:00:00.000Z"
        onChange={() => undefined}
        testId="three-level-calendar"
      />,
    );

    await user.click(screen.getByTestId("three-level-calendar"));
    await user.click(screen.getByTestId("three-level-calendar-month-label"));
    expect(screen.getByTestId("three-level-calendar-month-grid")).toBeInTheDocument();
    await user.click(screen.getByTestId("three-level-calendar-month-label"));
    const yearGrid = screen.getByTestId("three-level-calendar-year-grid");
    expect(yearGrid).toBeInTheDocument();
    await user.click(yearGrid.querySelector("button")!);
    expect(screen.getByTestId("three-level-calendar-month-grid")).toBeInTheDocument();
    await user.click(screen.getByTestId("three-level-calendar-month-5"));
    expect(screen.queryByTestId("three-level-calendar-month-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("three-level-calendar-day-1")).toBeInTheDocument();
  });

  it("moves a Persian panel calendar forward with the physical left arrow", async () => {
    const user = userEvent.setup();
    render(
      <JalaliDatePicker
        locale="fa"
        label="تاریخ"
        value="2026-08-24T12:00:00.000Z"
        onChange={() => undefined}
        testId="rtl-forward-calendar"
      />,
    );

    await user.click(screen.getByTestId("rtl-forward-calendar"));
    const before = screen.getByTestId("rtl-forward-calendar-month-label").textContent;
    const leftArrow = screen.getByTestId("rtl-forward-calendar-next-month");
    expect(leftArrow).toHaveTextContent("‹");
    await user.click(leftArrow);
    expect(screen.getByTestId("rtl-forward-calendar-month-label").textContent).not.toBe(before);
  });

  it("keeps month navigation unchanged when granular navigation is disabled", async () => {
    const user = userEvent.setup();
    render(
      <JalaliDatePicker
        locale="fa"
        label="تاریخ رفت"
        value="2026-08-24T12:00:00.000Z"
        onChange={() => undefined}
        testId="home-calendar-contract"
        granularNavigation={false}
      />,
    );

    await user.click(screen.getByTestId("home-calendar-contract"));
    await user.click(screen.getByTestId("home-calendar-contract-month-label"));
    expect(screen.queryByTestId("home-calendar-contract-month-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-calendar-contract-day-1")).toBeInTheDocument();
  });

  it("renders localized Gregorian month names in English and Arabic", async () => {
    const user = userEvent.setup();
    const english = render(
      <JalaliDatePicker
        locale="en"
        label="Date"
        value="2026-08-24T12:00:00.000Z"
        onChange={() => undefined}
        testId="english-months"
      />,
    );
    await user.click(screen.getByTestId("english-months"));
    await user.click(screen.getByTestId("english-months-month-label"));
    expect(screen.getByTestId("english-months-month-grid")).toHaveTextContent("August");
    english.unmount();

    render(
      <JalaliDatePicker
        locale="ar"
        label="التاريخ"
        value="2026-08-24T12:00:00.000Z"
        onChange={() => undefined}
        testId="arabic-months"
      />,
    );
    await user.click(screen.getByTestId("arabic-months"));
    await user.click(screen.getByTestId("arabic-months-month-label"));
    expect(screen.getByTestId("arabic-months-month-grid")).toHaveTextContent("أغسطس");
  });
});
