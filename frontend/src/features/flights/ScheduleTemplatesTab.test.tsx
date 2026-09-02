import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleTemplatesTab from "./ScheduleTemplatesTab";
import * as flightsApi from "../../api/flights";
import * as aircraftApi from "../../api/aircraft";

afterEach(() => vi.restoreAllMocks());

describe("ScheduleTemplatesTab", () => {
  it("shows the selected aircraft cabins and allows per-route activation", async () => {
    vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue([]);
    vi.spyOn(aircraftApi, "fetchAircraftDefinitions").mockResolvedValue([
      {
        id: "md80-1",
        code: "MD80",
        model: "MD-80",
        title: "MD-80",
        status: "ACTIVE",
        totalCapacity: 144,
        version: 1,
        cabins: [
          { cabinType: "BUSINESS", capacity: 12 },
          { cabinType: "COMFORT", capacity: 18 },
          { cabinType: "ECONOMY", capacity: 114 },
        ],
      },
    ]);
    vi.spyOn(flightsApi, "fetchScheduleTemplates").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const user = userEvent.setup();

    render(<ScheduleTemplatesTab />);
    await user.click(await screen.findByRole("button", { name: "افزودن مسیر جدید" }));
    await user.selectOptions(screen.getByLabelText("نوع هواپیما *"), "md80-1");

    const business = (await screen.findByTestId("available-cabin-BUSINESS")).querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    const comfort = screen
      .getByTestId("available-cabin-COMFORT")
      .querySelector("input[type=checkbox]") as HTMLInputElement;
    const economy = screen
      .getByTestId("available-cabin-ECONOMY")
      .querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(business).toBeChecked();
    expect(comfort).toBeChecked();
    expect(economy).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "فعال‌سازی فرست" })).not.toBeInTheDocument();

    await user.click(comfort);
    expect(comfort).not.toBeChecked();
    expect(screen.queryByLabelText("تعداد صندلی کامفورت")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("available-cabin-BUSINESS").querySelector('input[inputmode="numeric"]'),
    ).toHaveValue("12");
    expect(screen.getByLabelText(/قیمت پایه.*بیز/)).toBeInTheDocument();
  });

  it("applies an advisory route distance and keeps it editable", async () => {
    vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue([
      { id: "ika", code: "IKA", cityFa: "تهران", tz: "Asia/Tehran" },
      { id: "mct", code: "MCT", cityFa: "مسقط", tz: "Asia/Muscat" },
    ]);
    vi.spyOn(aircraftApi, "fetchAircraftDefinitions").mockResolvedValue([]);
    vi.spyOn(flightsApi, "fetchScheduleTemplates").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const suggest = vi.spyOn(flightsApi, "suggestRouteDistance").mockResolvedValue({
      distanceKm: 1492,
      confidence: 0.94,
      source: "ANTHROPIC",
      generatedAt: "2026-09-01T00:00:00.000Z",
    });
    const user = userEvent.setup();

    render(<ScheduleTemplatesTab />);
    await user.click(await screen.findByRole("button", { name: "افزودن مسیر جدید" }));
    await user.selectOptions(screen.getByLabelText("مبدأ *"), "ika");
    await user.selectOptions(screen.getByLabelText("مقصد *"), "mct");
    await user.click(screen.getByRole("button", { name: "پیشنهاد هوشمند مسافت" }));

    expect(suggest).toHaveBeenCalledWith("ika", "mct");
    expect(await screen.findByLabelText("مسافت مسیر به کیلومتر")).toHaveValue("1492");
    await user.clear(screen.getByLabelText("مسافت مسیر به کیلومتر"));
    await user.type(screen.getByLabelText("مسافت مسیر به کیلومتر"), "1500");
    expect(screen.getByLabelText("مسافت مسیر به کیلومتر")).toHaveValue("1500");

    await user.selectOptions(screen.getByLabelText("مبدأ *"), "mct");
    expect(screen.getByLabelText("مسافت مسیر به کیلومتر")).toHaveValue("");
  });

  it("loads route templates from real APIs and renders an empty state without filler rows", async () => {
    vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue([]);
    vi.spyOn(aircraftApi, "fetchAircraftDefinitions").mockResolvedValue([]);
    vi.spyOn(flightsApi, "fetchScheduleTemplates").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    render(<ScheduleTemplatesTab />);

    expect(await screen.findByText('هنوز مسیر پروازی فعالی تعریف نشده است.')).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "تعریف مسیر پروازی جدید" }),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزودن مسیر جدید' }));
    expect(
      screen.getByRole("heading", { name: "تعریف مسیر پروازی جدید" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'افزودن مسیر جدید' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('schedule-route-form')).toHaveClass('md:grid-cols-2');
    await user.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(
      screen.queryByRole("heading", { name: "تعریف مسیر پروازی جدید" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/تهران.*مشهد/)).not.toBeInTheDocument();
  });

  it("formats both toman inputs in Persian and spells the value while typing", async () => {
    vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue([]);
    vi.spyOn(aircraftApi, "fetchAircraftDefinitions").mockResolvedValue([]);
    vi.spyOn(flightsApi, "fetchScheduleTemplates").mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const user = userEvent.setup();

    render(<ScheduleTemplatesTab />);
    await user.click(screen.getByRole('button', { name: 'افزودن مسیر جدید' }));
    await screen.findByRole("heading", { name: "تعریف مسیر پروازی جدید" });

    const agencyPrice = screen.getByLabelText("قیمت آژانس (تومان)");
    expect(document.querySelector('input[type="time"]')).toBeNull();
    await user.click(screen.getByTestId("schedule-departure-time-trigger"));
    await user.selectOptions(screen.getByTestId("schedule-departure-time-hour"), "9");
    await user.selectOptions(screen.getByTestId("schedule-departure-time-minute"), "30");
    await user.click(screen.getByTestId("schedule-departure-time-done"));
    expect(screen.getByTestId("schedule-departure-time-trigger")).toHaveTextContent("۰۹:۳۰");
    await user.click(screen.getByRole("button", { name: "پیش‌نمایش" }));
    expect(agencyPrice).toHaveAttribute("aria-invalid", "true");
    await user.type(agencyPrice, "50");
    expect(agencyPrice).toHaveValue("۵۰");
    expect(agencyPrice).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("پنجاه تومان")).toBeInTheDocument();

    await user.type(agencyPrice, "0");
    expect(agencyPrice).toHaveValue("۵۰۰");
    expect(screen.getByText("پانصد تومان")).toBeInTheDocument();

    const legalCeiling = screen.getByLabelText("قیمت قانونی (تومان)");
    await user.type(legalCeiling, "1250000");
    expect(legalCeiling).toHaveValue("۱٬۲۵۰٬۰۰۰");
    expect(
      screen.getByText("یک میلیون و دویست و پنجاه هزار تومان"),
    ).toBeInTheDocument();
  });
});
