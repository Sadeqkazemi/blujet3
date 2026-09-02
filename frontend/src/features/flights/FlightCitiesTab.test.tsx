import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FlightCitiesTab from "./FlightCitiesTab";
import * as flightsApi from "../../api/flights";
import type { AirportEntry } from "../../types/flights";

const AIRPORTS: AirportEntry[] = [
  {
    id: "a1",
    code: "THR",
    cityFa: "تهران",
    airportNameFa: "فرودگاه بین‌المللی مهرآباد",
    tz: "Asia/Tehran",
    isInternational: false,
  },
];

describe("FlightCitiesTab", () => {
  it("creates an airport from the real reference catalog", async () => {
    const created: AirportEntry = {
      id: "a2",
      code: "VAN",
      cityFa: "وان",
      airportNameFa: "فرودگاه فرید ملن",
      tz: "Europe/Istanbul",
      isInternational: true,
    };
    const createSpy = vi
      .spyOn(flightsApi, "createAirport")
      .mockResolvedValue(created);
    const onCreated = vi.fn();

    render(
      <FlightCitiesTab
        airports={AIRPORTS}
        onCreated={onCreated}
        onDeleted={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText("نام شهر و فرودگاه"),
      "VAN",
    );
    expect(screen.getByLabelText("کد فرودگاه")).toHaveValue("VAN");
    expect(screen.getByLabelText("نام فرودگاه")).toHaveValue(
      "فرودگاه فرید ملن",
    );
    await userEvent.click(screen.getByRole("button", { name: "افزودن شهر" }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        cityFa: "وان",
        code: "VAN",
        airportNameFa: "فرودگاه فرید ملن",
        tz: "Europe/Istanbul",
        isInternational: true,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("confirms deletion, removes the row, and shows a success notification", async () => {
    vi.spyOn(flightsApi, "deleteAirport").mockResolvedValue({ id: "a1" });
    const onDeleted = vi.fn();

    render(
      <FlightCitiesTab
        airports={AIRPORTS}
        onCreated={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "حذف تهران THR" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تأیید حذف" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("a1"));
    expect(
      screen.getByText(/از شهرهای قابل انتخاب حذف شد/),
    ).toBeInTheDocument();
  });

  it("supports two airports in the same city", () => {
    render(
      <FlightCitiesTab
        airports={AIRPORTS}
        onCreated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const picker = screen.getByLabelText("نام شهر و فرودگاه");
    expect(picker).toHaveTextContent("فرودگاه بین‌المللی امام خمینی (IKA)");
  });

  it("allows a city and airport code to be entered manually", async () => {
    const created: AirportEntry = {
      id: "a3",
      code: "GBT",
      cityFa: "گرگان",
      airportNameFa: "فرودگاه گرگان",
      tz: "Asia/Tehran",
      isInternational: false,
    };
    const createSpy = vi
      .spyOn(flightsApi, "createAirport")
      .mockResolvedValue(created);
    const onCreated = vi.fn();

    render(
      <FlightCitiesTab
        airports={AIRPORTS}
        onCreated={onCreated}
        onDeleted={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "ورود دستی" }));
    await userEvent.type(screen.getByLabelText("نام شهر"), "گرگان");
    await userEvent.type(screen.getByLabelText("کد فرودگاه"), "gbt");
    await userEvent.type(screen.getByLabelText("نام فرودگاه"), "فرودگاه گرگان");
    await userEvent.selectOptions(screen.getByLabelText("موقعیت فرودگاه"), "iran");
    await userEvent.click(screen.getByRole("button", { name: "افزودن شهر" }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        cityFa: "گرگان",
        code: "GBT",
        airportNameFa: "فرودگاه گرگان",
        tz: "Asia/Tehran",
        isInternational: false,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });
});
