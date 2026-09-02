import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as flightsApi from "../../../api/flights";
import type { CommercialFlightControl } from "../../../types/flights";
import CommercialFareClassControls from "./CommercialFareClassControls";

vi.mock("../../../api/flights");

const control: CommercialFlightControl = {
  flightInstanceId: "flight-1",
  departureAt: "2026-08-31T08:00:00.000Z",
  competitorPriceIrr: "40000000",
  publicSaleEnabled: false,
  agencySaleEnabled: true,
  fareClasses: [
    {
      ruleId: "rule-y",
      cabin: "ECONOMY",
      classCode: "Y",
      seatsAllocated: 30,
      soldSeats: 8,
      siteSoldSeats: 6,
      agencySoldSeats: 2,
      remainingSeats: 22,
      sharedSeatsRemaining: 15,
      siteSeatsAvailable: 4,
      agencySeatsAvailable: 3,
      agencySeatsCommitted: 2,
      revenueIrr: "304000000",
      basePriceIrr: "36000000",
      sitePriceIrr: "38000000",
      siteSeatsReleased: 10,
      agencySeatsReleased: 5,
      agencyReleasePriceIrr: "32000000",
      agencySpecialOffer: false,
      salesByRate: [
        {
          channel: "SYSTEM",
          priceIrr: "38000000",
          seats: 6,
          revenueIrr: "228000000",
          lastSoldAt: "2026-08-30T08:00:00.000Z",
        },
        {
          channel: "AGENCY",
          priceIrr: "32000000",
          seats: 2,
          revenueIrr: "64000000",
          lastSoldAt: "2026-08-30T08:05:00.000Z",
        },
      ],
      priceHistory: [
        {
          channel: "SYSTEM",
          previousPriceIrr: "36000000",
          newPriceIrr: "38000000",
          reason: "افزایش تقاضا",
          changedAt: "2026-08-30T07:00:00.000Z",
        },
        {
          channel: "AGENCY",
          previousPriceIrr: "36000000",
          newPriceIrr: "32000000",
          reason: "",
          changedAt: "2026-08-30T07:05:00.000Z",
        },
      ],
    },
  ],
};

describe("CommercialFareClassControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockResolvedValue(
      control,
    );
    vi.mocked(flightsApi.updateFlightSalesVisibility).mockResolvedValue({
      flightInstanceId: "flight-1",
      publicSaleEnabled: true,
      version: 2,
    });
    vi.mocked(flightsApi.updateAgencySalesVisibility).mockResolvedValue({
      flightInstanceId: "flight-1",
      agencySaleEnabled: false,
      version: 2,
    });
    vi.mocked(flightsApi.updateFareClassSitePrice).mockResolvedValue(
      {} as never,
    );
    vi.mocked(flightsApi.upsertAgencyFareRelease).mockResolvedValue(
      {} as never,
    );
    vi.mocked(flightsApi.updateFareClassChannelRelease).mockResolvedValue(
      {} as never,
    );
    vi.mocked(flightsApi.suggestFareClassPrice).mockResolvedValue({
      ruleId: "rule-y",
      cabin: "ECONOMY",
      classCode: "Y",
      channel: "SYSTEM",
      capacity: 30,
      releasedSeats: 10,
      soldSeats: 6,
      totalSoldSeats: 8,
      availableSeats: 4,
      sharedSeatsRemaining: 15,
      occupancyPct: 27,
      hoursToDeparture: 20,
      basePriceIrr: "36000000",
      currentPriceIrr: "38000000",
      competitorPriceIrr: "40000000",
      suggestedPriceIrr: "37000000",
      source: "HEURISTIC",
      modelVersion: null,
      confidence: null,
      reasonFa: "فروش و زمان باقی‌مانده تحلیل شد.",
      factorsFa: ["فروش پایین است."],
      advisoryOnly: true,
    });
  });

  it("renders a loading state while the commercial control is being fetched", () => {
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockReturnValue(
      new Promise(() => undefined),
    );

    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText("در حال دریافت کنترل فروش…")).toBeInTheDocument();
  });

  it("reports the API error and does not fabricate controls", async () => {
    const onError = vi.fn();
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockRejectedValue(
      new Error("پرواز یافت نشد."),
    );

    render(
      <CommercialFareClassControls
        instanceId="missing-flight"
        canManage
        onNotice={vi.fn()}
        onError={onError}
      />,
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("پرواز یافت نشد."),
    );
    expect(
      screen.queryByText("کنترل فروش کلاس‌های نرخی"),
    ).not.toBeInTheDocument();
  });

  it("renders the honest empty state when no fare class exists", async () => {
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockResolvedValue({
      flightInstanceId: "flight-1",
      departureAt: "2026-08-31T08:00:00.000Z",
      competitorPriceIrr: null,
      publicSaleEnabled: false,
      agencySaleEnabled: true,
      fareClasses: [],
    });

    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("agency-seat-release-panel")).toHaveTextContent(
      "برای این پرواز کلاس نرخی ثبت نشده است",
    );
    expect(screen.getByTestId("site-seat-release-panel")).toHaveTextContent(
      "برای این پرواز کلاس نرخی ثبت نشده است",
    );
  });

  it("toggles public-site sale visibility through the API", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={onNotice}
        onError={vi.fn()}
      />,
    );

    const visibility = await screen.findByRole("switch", {
      name: /فروش در سایت/,
    });
    await user.click(visibility);

    await waitFor(() =>
      expect(flightsApi.updateFlightSalesVisibility).toHaveBeenCalledWith(
        "flight-1",
        true,
      ),
    );
    expect(onNotice).toHaveBeenCalledWith(
      "فروش این پرواز در سایت عمومی فعال شد.",
    );
  });

  it("toggles agency sale visibility independently through the API", async () => {
    const user = userEvent.setup();
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const visibility = await screen.findByRole("switch", {
      name: /فروش آژانسی/,
    });
    await user.click(visibility);

    await waitFor(() =>
      expect(flightsApi.updateAgencySalesVisibility).toHaveBeenCalledWith(
        "flight-1",
        false,
      ),
    );
    expect(flightsApi.updateFlightSalesVisibility).not.toHaveBeenCalled();
  });

  it("keeps site and agency release controls independent", async () => {
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockResolvedValue({
      ...control,
      fareClasses: [
        {
          ...control.fareClasses[0],
          sitePriceIrr: null,
          agencyReleasePriceIrr: null,
          siteSeatsReleased: 0,
          agencySeatsReleased: 0,
        },
      ],
    });
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const agencyPanel = await screen.findByTestId("agency-seat-release-panel");
    const sitePanel = screen.getByTestId("site-seat-release-panel");
    expect(agencyPanel).not.toContainElement(sitePanel);
    expect(sitePanel).not.toContainElement(agencyPanel);
    expect(screen.getByTestId("base-price-rule-y")).toHaveTextContent(
      "۳٬۶۰۰٬۰۰۰",
    );
    expect(agencyPanel).toHaveTextContent("ظرفیت ثبت‌شده در ایجاد پرواز: ۳۰ صندلی");
    expect(sitePanel).toHaveTextContent("ظرفیت ثبت‌شده در ایجاد پرواز: ۳۰ صندلی");
    expect(screen.getByLabelText("قیمت فروش آژانس")).toHaveValue("3600000");

    expect(screen.getByLabelText("ظرفیت فروش سایت")).toBeEnabled();
    expect(screen.getByLabelText("ظرفیت فروش آژانس")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "تأیید، ثبت و انتشار برای سایت" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "تأیید، ثبت و انتشار برای آژانس" }),
    ).toBeEnabled();
  });

  it("saves the agency and site cards through separate operations", async () => {
    const user = userEvent.setup();
    vi.mocked(flightsApi.fetchCommercialFlightControl).mockResolvedValue({
      ...control,
      publicSaleEnabled: false,
      agencySaleEnabled: false,
    });
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await screen.findByText("آزادسازی مستقل برای آژانس‌ها");
    await user.clear(screen.getByLabelText("ظرفیت فروش آژانس"));
    await user.type(screen.getByLabelText("ظرفیت فروش آژانس"), "8");
    await user.click(
      screen.getByRole("button", { name: "تأیید، ثبت و انتشار برای آژانس" }),
    );
    await waitFor(() =>
      expect(flightsApi.upsertAgencyFareRelease).toHaveBeenCalledWith(
        "flight-1",
        "rule-y",
        { seats: 8, priceIrr: "32000000", specialOffer: false },
      ),
    );
    expect(flightsApi.updateAgencySalesVisibility).toHaveBeenCalledWith(
      "flight-1",
      true,
    );
    expect(
      within(screen.getByTestId("agency-seat-release-panel")).getByRole("button", {
        name: /اکونومی · کلاس Y.*آزادشده.*فروش‌رفته/,
      }),
    ).toHaveAttribute("aria-expanded", "false");

    await user.clear(screen.getByLabelText("ظرفیت فروش سایت"));
    await user.type(screen.getByLabelText("ظرفیت فروش سایت"), "12");
    await user.click(
      screen.getByRole("button", { name: "تأیید، ثبت و انتشار برای سایت" }),
    );
    await waitFor(() =>
      expect(flightsApi.updateFareClassSitePrice).toHaveBeenCalledWith(
        "flight-1",
        "rule-y",
        { priceIrr: "38000000", reason: "", seats: 12 },
      ),
    );
    expect(flightsApi.updateFlightSalesVisibility).toHaveBeenCalledWith(
      "flight-1",
      true,
    );
  });

  it("shows sold/released inventory and keeps AI advice advisory until explicit publish", async () => {
    const user = userEvent.setup();
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const sitePanel = await screen.findByTestId("site-seat-release-panel");
    const stats = within(sitePanel).getByTestId("site-release-stats");
    expect(stats).toHaveTextContent("صندلی آزادشده");
    expect(stats).toHaveTextContent("صندلی فروش‌رفته");
    expect(stats).toHaveTextContent("ثبت شده؛ کانال غیرفعال است");

    await user.click(
      within(sitePanel).getByRole("button", { name: "تحلیل و پیشنهاد نرخ" }),
    );
    await waitFor(() =>
      expect(flightsApi.suggestFareClassPrice).toHaveBeenCalledWith(
        "flight-1",
        "rule-y",
        { channel: "SYSTEM", competitorPriceIrr: "40000000" },
      ),
    );
    expect(flightsApi.updateFareClassSitePrice).not.toHaveBeenCalled();

    await user.click(
      within(sitePanel).getByRole("button", { name: "اعمال در نرخ جدید" }),
    );
    expect(screen.getByLabelText("قیمت فروش سایت")).toHaveValue("3700000");
    expect(flightsApi.updateFareClassSitePrice).not.toHaveBeenCalled();
  });

  it("shows every registered rate and calculates profit or loss from the creation rate", async () => {
    render(
      <CommercialFareClassControls
        instanceId="flight-1"
        canManage
        onNotice={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("نرخ‌های ثبت‌شده و سود/زیان فروش"),
    ).toBeInTheDocument();
    expect(screen.getByText(/نرخ ثبت‌شده برای سایت: ۳٬۸۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/نرخ ثبت‌شده برای آژانس: ۳٬۲۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/اختلاف هر بلیط با نرخ پایه: \+۲۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/اختلاف هر بلیط با نرخ پایه: −۴۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/سود\/زیان نسبت به نرخ پایه: \+۱٬۲۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/سود\/زیان نسبت به نرخ پایه: −۸۰۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "افزودن برنامه نرخ" })).not.toBeInTheDocument();
  });
});
