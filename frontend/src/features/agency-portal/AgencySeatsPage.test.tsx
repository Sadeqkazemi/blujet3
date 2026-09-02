import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgencySeatsPage from "./AgencySeatsPage";
import * as portalApi from "../../api/agency-portal";
import * as publicApi from "../../api/publicSite";
import * as useLocaleModule from "../../hooks/useLocale";
import type {
  AgencyAllotmentRow,
  AgencySeatInquiry,
  AgencySeatRequestOption,
} from "../../types/agency-portal";

const ROWS: AgencyAllotmentRow[] = [
  {
    id: "al1",
    flightInstanceId: "fi1",
    route: "تهران → دبی",
    flightNo: "BJ-100",
    departureAt: "2026-08-01T05:00:00.000Z",
    aircraftType: "Airbus A320",
    cabin: "ECONOMY",
    fareClassCode: "Y",
    seatsAllocated: 20,
    seatsUsed: 12,
    type: "HARD",
    releaseAt: null,
    contractPriceIrr: null,
    active: true,
  },
];

function mockLocale(locale: "fa" | "en" | "ar") {
  vi.spyOn(useLocaleModule, "useLocale").mockReturnValue({
    locale,
    setLocale: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(portalApi, "fetchCredit").mockResolvedValue({
    limitIrr: "10000000000",
    usedIrr: "0",
    remainingIrr: "10000000000",
  });
  vi.spyOn(portalApi, "fetchSeatRequestOptions").mockResolvedValue([]);
  vi.spyOn(portalApi, "fetchMySeatRequests").mockResolvedValue([]);
  vi.spyOn(portalApi, "inquireAgencySeats").mockImplementation(
    async (dto): Promise<AgencySeatInquiry> => ({
      flightInstanceId: dto.flightInstanceId,
      cabin: dto.cabin,
      fareClassCode: dto.fareClassCode,
      requestedSeats: dto.seats,
      suggestedSeats: dto.seats,
      canFulfillRequested: true,
      capacity: 180,
      soldSeats: 20,
      heldSeats: 2,
      agencyAllocated: 30,
      agencySoldSeats: 4,
      reservedAgencySeats: 3,
      availableSeats: 158,
      availableToRequest: 150,
      totalAgencies: 4,
      agenciesWithDemand: 2,
      historicalAgencyBookings: 5,
      historicalAgencySeatsSold: 18,
      season: "تابستان",
      occasion: null,
      demandLevel: "MEDIUM",
      recommendation: "ظرفیت برای این درخواست کافی است.",
      pricePerSeatIrr: "30000000",
      totalPriceIrr: String(dto.seats * 30000000),
    }),
  );
});

describe("AgencySeatsPage", () => {
  it("derives XY1235 month/day choices only from its approved active occurrences", async () => {
    const makeOption = (
      flightInstanceId: string,
      flightNo: string,
      departureAt: string,
    ): AgencySeatRequestOption => ({
      flightInstanceId,
      flightNo,
      originCode: "THR",
      destCode: "KIH",
      departureAt,
      aircraftType: "MD-80",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 140,
      agencySeatsReleased: 40,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 40,
      pricePerSeatIrr: "25000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    });
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([
      makeOption("fi-xy-sep", "XY1235", "2026-09-03T05:00:00.000Z"),
      makeOption("fi-xy-oct", "XY1235", "2026-10-08T05:00:00.000Z"),
      makeOption("fi-other", "AB9999", "2026-09-10T05:00:00.000Z"),
    ]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);

    render(<AgencySeatsPage />);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "THR",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "KIH",
    );

    expect(screen.getAllByText(/XY1235/)).toHaveLength(1);
    await user.click(screen.getByTestId("agency-request-route-fi-xy-sep"));
    await user.type(screen.getByTestId("agency-request-seat-count"), "1");
    await screen.findByTestId("agency-seat-inquiry-result");
    await user.click(screen.getByTestId("agency-seat-inquiry-confirm"));

    expect(screen.getByTestId("agency-month-2026-09")).toBeInTheDocument();
    expect(screen.getByTestId("agency-month-2026-10")).toBeInTheDocument();
    expect(screen.getByTestId("agency-flight-date-fi-xy-sep")).toBeInTheDocument();
    expect(screen.getByTestId("agency-flight-date-fi-xy-oct")).toBeInTheDocument();
    expect(screen.queryByTestId("agency-flight-date-fi-other")).not.toBeInTheDocument();
    expect(screen.getByTestId("agency-weekday-4")).toBeEnabled();
    expect(screen.getByTestId("agency-weekday-3")).toBeDisabled();
    expect(screen.getByTestId("agency-term-3")).toHaveClass("border-[#1668c4]");

    await user.click(screen.getByTestId("agency-term-0"));
    expect(screen.getByTestId("agency-month-2026-09")).toBeInTheDocument();
    expect(screen.queryByTestId("agency-month-2026-10")).not.toBeInTheDocument();
    expect(screen.getByTestId("agency-flight-date-fi-xy-sep")).toBeInTheDocument();
    expect(screen.queryByTestId("agency-flight-date-fi-xy-oct")).not.toBeInTheDocument();
  });

  it("loads commercial routes and sends the selected seat request to the commercial manager", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-request-1",
      flightNo: "BJ-210",
      originCode: "THR",
      destCode: "DXB",
      departureAt: "2026-09-01T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 150,
      agencyAllocated: 30,
      ownAllocated: 10,
      availableToRequest: 150,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    const request = vi
      .spyOn(portalApi, "requestAgencySeats")
      .mockResolvedValue({
        id: "request-1",
        status: "SUBMITTED",
        recipientCount: 1,
        flightInstanceId: option.flightInstanceId,
        cabin: option.cabin,
        fareClassCode: option.fareClassCode,
        seats: 12,
        preferredWeekdays: [],
        termMonths: 3,
      });
    render(<AgencySeatsPage />);

    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "THR",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "DXB",
    );
    await user.click(screen.getByTestId("agency-request-route-fi-request-1"));
    expect(
      await screen.findByTestId("agency-request-flight-detail"),
    ).toBeInTheDocument();
    const seats = screen.getByTestId("agency-request-seat-count");
    expect(seats).toHaveValue(null);
    await user.click(seats);
    await user.keyboard("{Control>}a{/Control}12");
    expect(screen.getByTestId("agency-submit-seat-request")).toBeDisabled();
    const inquiry = vi.mocked(portalApi.inquireAgencySeats);
    await waitFor(() => {
      expect(inquiry).toHaveBeenLastCalledWith({
        flightInstanceId: option.flightInstanceId,
        cabin: option.cabin,
        fareClassCode: option.fareClassCode,
        seats: 12,
      });
    });
    expect(
      await screen.findByTestId("agency-seat-inquiry-result"),
    ).toHaveTextContent("۱۲ صندلی موجود است");
    expect(screen.getByTestId("agency-seat-inquiry-result")).not.toHaveTextContent(
      "ظرفیت آزاد واقعی",
    );
    expect(screen.getByTestId("agency-seat-inquiry-result")).not.toHaveTextContent(
      "قابل درخواست",
    );
    expect(
      screen.getByText("وب‌سرویس مسیر (یک کلید برای تمام پروازهای این مسیر)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agency-seat-count-box")).toHaveClass(
      "self-start",
    );
    expect(screen.getByTestId("agency-seat-inquiry-box")).toHaveClass(
      "self-start",
    );
    await user.click(screen.getByTestId("agency-seat-inquiry-confirm"));
    await user.click(screen.getByTestId("agency-flight-date-fi-request-1"));
    await user.click(screen.getByTestId("agency-submit-seat-request"));

    expect(request).toHaveBeenCalledWith({
      flightInstanceId: option.flightInstanceId,
      cabin: "ECONOMY",
      fareClassCode: "Y",
      seats: 12,
      selectedFlightInstanceIds: ["fi-request-1"],
      preferredWeekdays: [],
      termMonths: 3,
      payMethod: "INVOICE",
    });
    expect(
      await screen.findByText(
        "درخواست صندلی با موفقیت برای مدیر بازرگانی ارسال شد.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an over-capacity suggestion in red and blocks confirmation", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-limited",
      flightNo: "BJ-212",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-02T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 7,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 7,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    vi.mocked(portalApi.inquireAgencySeats).mockResolvedValue({
      flightInstanceId: option.flightInstanceId,
      cabin: option.cabin,
      fareClassCode: option.fareClassCode,
      requestedSeats: 24,
      suggestedSeats: 7,
      canFulfillRequested: false,
      capacity: 180,
      soldSeats: 0,
      heldSeats: 0,
      agencyAllocated: 0,
      agencySoldSeats: 0,
      reservedAgencySeats: 0,
      availableSeats: 180,
      availableToRequest: 7,
      totalAgencies: 0,
      agenciesWithDemand: 0,
      historicalAgencyBookings: 0,
      historicalAgencySeatsSold: 0,
      season: "تابستان",
      occasion: null,
      demandLevel: "LOW",
      recommendation: "7 صندلی در حال حاضر قابل ارائه است.",
      pricePerSeatIrr: "30000000",
      totalPriceIrr: "210000000",
    });
    const request = vi.spyOn(portalApi, "requestAgencySeats");

    render(<AgencySeatsPage />);
    await user.selectOptions(await screen.findByTestId("agency-request-origin"), "THR");
    await user.selectOptions(screen.getByTestId("agency-request-destination"), "MHD");
    await user.click(screen.getByTestId("agency-request-route-fi-limited"));
    await user.type(screen.getByTestId("agency-request-seat-count"), "24");

    const result = await screen.findByTestId("agency-seat-inquiry-result");
    expect(result).toHaveClass("border-red-300");
    expect(result).toHaveTextContent("۷ صندلی در حال حاضر قابل ارائه است");
    expect(screen.getByTestId("agency-seat-inquiry-confirm")).toBeDisabled();
    expect(screen.getByTestId("agency-submit-seat-request")).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it("asks the reservation service even when the catalogue preview is zero", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-zero-preview",
      flightNo: "KL2550",
      originCode: "IKA",
      destCode: "FRA",
      departureAt: "2026-09-02T05:00:00.000Z",
      aircraftType: "MD-80",
      cabin: "BUSINESS",
      fareClassCode: "C",
      capacity: 20,
      agencySeatsReleased: 0,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 0,
      pricePerSeatIrr: "80000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    const inquiry = vi.mocked(portalApi.inquireAgencySeats);

    render(<AgencySeatsPage />);
    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "IKA",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "FRA",
    );
    await user.click(
      screen.getByTestId("agency-request-route-fi-zero-preview"),
    );
    await user.type(screen.getByTestId("agency-request-seat-count"), "2");

    await waitFor(() => {
      expect(inquiry).toHaveBeenLastCalledWith({
        flightInstanceId: "fi-zero-preview",
        cabin: "BUSINESS",
        fareClassCode: "C",
        seats: 2,
      });
    });
    expect(
      await screen.findByTestId("agency-seat-inquiry-result"),
    ).toHaveTextContent("۲ صندلی موجود است");
    await user.click(screen.getByTestId("agency-seat-inquiry-confirm"));
    expect(
      screen.getByTestId("agency-flight-date-fi-zero-preview"),
    ).toBeEnabled();
  });

  it("keeps each route in its own card and opens inquiry controls inside only the selected card", async () => {
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-economy",
      flightNo: "CX1155",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-05T05:00:00.000Z",
      aircraftType: "MD-80",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 120,
      agencySeatsReleased: 40,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 40,
      pricePerSeatIrr: "58000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([
      option,
      {
        ...option,
        flightInstanceId: "fi-business",
        cabin: "BUSINESS",
        fareClassCode: "C",
        capacity: 20,
        agencySeatsReleased: 10,
        availableToRequest: 10,
        pricePerSeatIrr: "80000000",
      },
    ]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);

    render(<AgencySeatsPage />);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "THR",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "MHD",
    );
    await user.click(screen.getByTestId("agency-request-route-fi-economy"));

    const economyCard = screen.getByTestId("agency-request-card-fi-economy");
    const businessCard = screen.getByTestId("agency-request-card-fi-business");
    expect(economyCard).toContainElement(screen.getByTestId("agency-request-flight-fi-economy-expanded"));
    expect(screen.queryByTestId("agency-request-flight-fi-business-expanded")).not.toBeInTheDocument();
    expect(economyCard).not.toContainElement(businessCard);
  });

  it("ignores a slower response for an older seat count", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-live-inquiry",
      flightNo: "BJ-211",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-01T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 150,
      agencyAllocated: 30,
      ownAllocated: 10,
      availableToRequest: 150,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    const resultFor = (seats: number): AgencySeatInquiry => ({
      flightInstanceId: option.flightInstanceId,
      cabin: option.cabin,
      fareClassCode: option.fareClassCode,
      requestedSeats: seats,
      suggestedSeats: seats,
      canFulfillRequested: true,
      capacity: 180,
      soldSeats: 20,
      heldSeats: 2,
      agencyAllocated: 30,
      agencySoldSeats: 4,
      reservedAgencySeats: 3,
      availableSeats: 158,
      availableToRequest: 150,
      totalAgencies: 4,
      agenciesWithDemand: 2,
      historicalAgencyBookings: 5,
      historicalAgencySeatsSold: 18,
      season: "تابستان",
      occasion: null,
      demandLevel: "MEDIUM",
      recommendation: "ظرفیت برای این درخواست کافی است.",
      pricePerSeatIrr: "30000000",
      totalPriceIrr: String(seats * 30000000),
    });
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);

    let resolveTwo!: (value: AgencySeatInquiry) => void;
    let resolveThree!: (value: AgencySeatInquiry) => void;
    const inquiry = vi
      .mocked(portalApi.inquireAgencySeats)
      .mockImplementation((dto) => {
        if (dto.seats === 2) {
          return new Promise((resolve) => {
            resolveTwo = resolve;
          });
        }
        if (dto.seats === 3) {
          return new Promise((resolve) => {
            resolveThree = resolve;
          });
        }
        return Promise.resolve(resultFor(dto.seats));
      });

    render(<AgencySeatsPage />);
    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "THR",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "MHD",
    );
    await user.click(
      screen.getByTestId("agency-request-route-fi-live-inquiry"),
    );

    const seats = screen.getByTestId("agency-request-seat-count");
    await user.click(seats);
    await user.keyboard("{Control>}a{/Control}2");
    await waitFor(() =>
      expect(inquiry).toHaveBeenCalledWith(
        expect.objectContaining({ seats: 2 }),
      ),
    );

    await user.click(seats);
    await user.keyboard("{Control>}a{/Control}3");
    await waitFor(() =>
      expect(inquiry).toHaveBeenCalledWith(
        expect.objectContaining({ seats: 3 }),
      ),
    );

    resolveThree(resultFor(3));
    expect(
      await screen.findByTestId("agency-seat-inquiry-result"),
    ).toHaveTextContent("۳ صندلی درخواستی");

    resolveTwo(resultFor(2));
    await waitFor(() =>
      expect(
        screen.getByTestId("agency-seat-inquiry-result"),
      ).toHaveTextContent("۳ صندلی درخواستی"),
    );
  });

  it("keeps commercial route options usable when allotment history fails to load", async () => {
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-request-independent",
      flightNo: "BJ-310",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-02T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 180,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 180,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.spyOn(portalApi, "fetchAllotments").mockRejectedValue(
      new Error("allotments unavailable"),
    );
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);

    render(<AgencySeatsPage />);

    expect(
      await screen.findByRole("option", { name: /تهران/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agency-request-origin")).not.toBeDisabled();
  });

  it("recovers active flights after a transient refresh failure without reloading the portal", async () => {
    const user = userEvent.setup();
    const allotments = vi
      .spyOn(portalApi, "fetchAllotments")
      .mockRejectedValueOnce(new Error("temporary gateway error"))
      .mockResolvedValue(ROWS);

    render(<AgencySeatsPage />);

    expect(await screen.findByText("خطا در دریافت سهمیه‌های صندلی.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await user.click(await screen.findByRole("button", { name: /پروازهای فعال/ }));

    expect(await screen.findByTestId("alloc-card")).toBeInTheDocument();
    expect(allotments).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("خطا در دریافت سهمیه‌های صندلی.")).not.toBeInTheDocument();
  });

  it("keeps a published route visible while commercial allocation is still zero", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-awaiting-release",
      flightNo: "BJ-320",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-03T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 0,
      agencyAllocated: 0,
      ownAllocated: 0,
      availableToRequest: 180,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);

    render(<AgencySeatsPage />);

    await user.selectOptions(
      await screen.findByTestId("agency-request-origin"),
      "THR",
    );
    await user.selectOptions(
      screen.getByTestId("agency-request-destination"),
      "MHD",
    );
    await user.click(
      screen.getByTestId("agency-request-route-fi-awaiting-release"),
    );

    expect(screen.getByText("قابل درخواست از بازرگانی")).toBeInTheDocument();
    expect(
      screen.getByText(/پرواز فعال و قابل درخواست است/),
    ).toBeInTheDocument();
    const seats = screen.getByTestId("agency-request-seat-count");
    await user.type(seats, "10");
    expect(
      await screen.findByTestId("agency-seat-inquiry-result"),
    ).toHaveTextContent("۱۰ صندلی موجود است");
    expect(screen.getByTestId("agency-seat-inquiry-confirm")).toBeEnabled();
  });

  it("renders real per-flight allotment cards with allocated/sold/remaining counts", async () => {
    const user = userEvent.setup();
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue(ROWS);
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /پروازهای فعال/ }),
    );
    expect(await screen.findByTestId("alloc-card")).toBeInTheDocument();
    expect(screen.getByText("تخصیص‌یافته")).toBeInTheDocument();
    expect(screen.getByText("فعال")).toBeInTheDocument();
    expect(screen.getByText("۸")).toBeInTheDocument();
  });

  it("lists every published sellable cabin as active before an agency allotment exists", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi-active-without-allotment",
      flightNo: "BJ-330",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-09-04T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 40,
      agencyAllocated: 10,
      ownAllocated: 0,
      availableToRequest: 30,
      sellableSeats: 24,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([
      option,
      {
        ...option,
        cabin: "BUSINESS",
        fareClassCode: "J",
        agencySeatsReleased: 12,
        availableToRequest: 12,
      },
    ]);

    render(<AgencySeatsPage />);

    const activeTab = await screen.findByRole("button", {
      name: /پروازهای فعال/,
    });
    expect(activeTab).toHaveTextContent("۱");
    await user.click(activeTab);
    expect(
      await screen.findByTestId(
        "active-flight-card-fi-active-without-allotment-ECONOMY-Y",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "active-flight-card-fi-active-without-allotment-BUSINESS-J",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("۲۴").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "درخواست تخصیص صندلی" }),
    ).toHaveLength(2);
  });

  it("keeps an existing allotment card without duplicating the matching catalogue class", async () => {
    const user = userEvent.setup();
    const option: AgencySeatRequestOption = {
      flightInstanceId: "fi1",
      flightNo: "BJ-100",
      originCode: "THR",
      destCode: "DXB",
      departureAt: "2026-09-05T05:00:00.000Z",
      aircraftType: "Airbus A320",
      cabin: "ECONOMY",
      fareClassCode: "Y",
      capacity: 180,
      agencySeatsReleased: 40,
      agencyAllocated: 20,
      ownAllocated: 20,
      availableToRequest: 20,
      pricePerSeatIrr: "30000000",
      specialOffer: false,
      definitionStatus: "PUBLISHED",
    };
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue(ROWS);
    vi.mocked(portalApi.fetchSeatRequestOptions).mockResolvedValue([option]);

    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /پروازهای فعال/ }),
    );
    expect(await screen.findByTestId("alloc-card")).toBeInTheDocument();
    expect(
      screen.queryByTestId("active-flight-card-fi1-ECONOMY-Y"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "درخواست صندلی بیشتر" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state when the agency has no allotments", async () => {
    const user = userEvent.setup();
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([]);
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /پروازهای فعال/ }),
    );
    expect(
      await screen.findByText(
        "در حال حاضر سهمیه پرداخت‌شده و فعال برای فروش وجود ندارد.",
      ),
    ).toBeInTheDocument();
  });

  it("renders translated info banner and labels in English", async () => {
    const user = userEvent.setup();
    mockLocale("en");
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue(ROWS);
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Active flights/ }),
    );
    expect(await screen.findByText("Allocated")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getByText(/every published flight with sellable inventory/),
    ).toBeInTheDocument();
  });

  it("renders translated labels in Arabic", async () => {
    const user = userEvent.setup();
    mockLocale("ar");
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue(ROWS);
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /الرحلات النشطة/ }),
    );
    expect(await screen.findByText("مخصَّص")).toBeInTheDocument();
    expect(screen.getByText("نشط")).toBeInTheDocument();
  });

  it("submits a real ticket sale from a free seat and refreshes allotments", async () => {
    const user = userEvent.setup();
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue(ROWS);
    vi.spyOn(publicApi, "fetchSeatMap").mockResolvedValue({
      flightInstanceId: "fi1",
      seats: [{ seatCode: "4A", row: 4, cabin: "ECONOMY", status: "FREE" }],
    });
    const create = vi
      .spyOn(portalApi, "createAllotmentBooking")
      .mockResolvedValue({
        id: "b1",
        pnr: "BJ123ABC",
        status: "TICKETED",
        cabin: "ECONOMY",
        priceIrr: "10000000",
        holdExpiresAt: null,
        flightInstanceId: "fi1",
        flightNo: "BJ-100",
        originCode: "THR",
        destCode: "DXB",
        departureAt: "2026-08-01T05:00:00.000Z",
        arrivalAt: "2026-08-01T07:00:00.000Z",
        isPriceLocked: false,
        passengers: [{ fullName: "نگار رضایی", seatCode: "4A" }],
      });
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /پروازهای فعال/ }),
    );
    await user.click(await screen.findByRole("button", { name: "ثبت فروش" }));
    await user.type(
      screen.getByLabelText("نام و نام خانوادگی مسافر"),
      "نگار رضایی",
    );
    await user.selectOptions(screen.getByLabelText("صندلی"), "4A");
    await user.click(screen.getByRole("button", { name: "صدور قطعی بلیت" }));

    expect(await screen.findByText(/BJ123ABC/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(
      "al1",
      expect.objectContaining({
        cabin: "ECONOMY",
        passengers: [
          expect.objectContaining({ fullName: "نگار رضایی", seatCode: "4A" }),
        ],
      }),
      expect.any(String),
    );
  });

  it("locks a class-bound COMFORT allotment to COMFORT and submits its free seat", async () => {
    const user = userEvent.setup();
    vi.spyOn(portalApi, "fetchAllotments").mockResolvedValue([
      { ...ROWS[0]!, cabin: "COMFORT", fareClassCode: "W" },
    ]);
    vi.spyOn(publicApi, "fetchSeatMap").mockResolvedValue({
      flightInstanceId: "fi1",
      seats: [{ seatCode: "12A", row: 12, cabin: "COMFORT", status: "FREE" }],
    });
    const create = vi
      .spyOn(portalApi, "createAllotmentBooking")
      .mockResolvedValue({
        id: "b2",
        pnr: "BJ456DEF",
        status: "TICKETED",
        cabin: "COMFORT",
        priceIrr: "12000000",
        holdExpiresAt: null,
        flightInstanceId: "fi1",
        flightNo: "BJ-100",
        originCode: "THR",
        destCode: "DXB",
        departureAt: "2026-08-01T05:00:00.000Z",
        arrivalAt: "2026-08-01T07:00:00.000Z",
        isPriceLocked: false,
        passengers: [{ fullName: "نگار رضایی", seatCode: "12A" }],
      });
    render(<AgencySeatsPage />);

    await user.click(
      await screen.findByRole("button", { name: /پروازهای فعال/ }),
    );
    await user.click(await screen.findByRole("button", { name: "ثبت فروش" }));
    expect(screen.getByLabelText("کلاس پروازی")).toHaveValue("COMFORT");
    expect(screen.getByLabelText("کلاس پروازی")).toBeDisabled();
    await user.type(
      screen.getByLabelText("نام و نام خانوادگی مسافر"),
      "نگار رضایی",
    );
    await user.selectOptions(screen.getByLabelText("صندلی"), "12A");
    await user.click(screen.getByRole("button", { name: "صدور قطعی بلیت" }));

    expect(create).toHaveBeenCalledWith(
      "al1",
      expect.objectContaining({
        cabin: "COMFORT",
        passengers: [
          expect.objectContaining({ fullName: "نگار رضایی", seatCode: "12A" }),
        ],
      }),
      expect.any(String),
    );
  });
});
