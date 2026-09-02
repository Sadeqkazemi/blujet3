import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FlightsPage from "./FlightsPage";
import * as flightsApi from "../../api/flights";
import * as pricingApi from "../../api/pricing";
import * as useAuthModule from "../../hooks/useAuth";
import { mockAuthUserWithRole } from "../../test/mockAuthUser";
import type {
  AirportEntry,
  CommercialFlightControl,
  FlightsOverview,
  FlightDetail,
  FutureFlightRow,
} from "../../types/flights";
import type { Role } from "../../types/auth";

const AIRPORTS: AirportEntry[] = [
  { id: "a1", code: "THR", cityFa: "تهران", tz: "Asia/Tehran" },
  { id: "a2", code: "MHD", cityFa: "مشهد", tz: "Asia/Tehran" },
  { id: "a3", code: "DXB", cityFa: "دبی", tz: "Asia/Dubai" },
];

const FUTURE_ROW: FutureFlightRow = {
  id: "fu1",
  flightNo: "EP-840",
  originCode: "THR",
  destCode: "DXB",
  departureAt: "2026-08-10T08:30:00.000Z",
  capacity: 180,
  charterSeats: 60,
  sold: 0,
  basePriceIrr: null,
  agencySeatsAllocated: null,
  aiSuggestion: {
    // Advisory-only ML output — a plain JSON number, unlike the other Irr
    // fields on this page (see types/flights.ts).
    priceIrr: 41_000_000,
    reason: "با توجه به فصل تابستان، نرخ پیشنهادی هم‌تراز رقباست.",
    factors: ["فصل: اوج سفر"],
    season: "تابستان",
    occasion: "بدون مناسبت",
    confidence: 0.8,
    modelVersion: "heuristic-v1.0.0",
    generatedAt: "2026-07-17T00:00:00.000Z",
  },
};

const OVERVIEW: FlightsOverview = {
  kpis: { activeCount: 1, soldSeats: 152, meanOccupancyPct: 84 },
  active: [
    {
      id: "fi1",
      flightNo: "EP-821",
      originCode: "THR",
      destCode: "DXB",
      departureAt: "2026-07-20T08:30:00.000Z",
      capacity: 180,
      charterSeats: 60,
      sold: 152,
      // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
      // on the backend).
      basePriceIrr: "38000000",
      derivedStatus: "SELLING",
    },
    {
      id: "fi2",
      flightNo: "RV-431",
      originCode: "THR",
      destCode: "MHD",
      departureAt: "2026-07-21T06:20:00.000Z",
      capacity: 140,
      charterSeats: 0,
      sold: 0,
      basePriceIrr: "15000000",
      derivedStatus: "CANCELLED",
    },
  ],
  completed: {
    rows: [
      {
        id: "dn1",
        flightNo: "EP-805",
        originCode: "THR",
        destCode: "DXB",
        departureAt: "2026-07-10T08:30:00.000Z",
        tickets: 3,
        basePriceIrr: "30000000",
        avgPriceIrr: "40000000",
        revenueIrr: "120000000",
        channelRevenueIrr: {
          SYSTEM: "80000000",
          CHARTER: "0",
          AGENCY: "40000000",
        },
        profitIrr: "30000000",
        lossIrr: "0",
      },
    ],
    kpis: {
      totalSalesIrr: "120000000",
      totalProfitIrr: "30000000",
      totalTickets: 3,
      flightCount: 1,
    },
  },
  future: [FUTURE_ROW],
};

const DETAIL: FlightDetail = {
  ...OVERVIEW.active[0],
  channels: [
    { channel: "SYSTEM", seats: 80, revenueIrr: "3040000000" },
    { channel: "CHARTER", seats: 45, revenueIrr: "1710000000" },
    { channel: "AGENCY", seats: 27, revenueIrr: "1026000000" },
  ],
  totalRevenueIrr: "5776000000",
  occupancyPct: 84,
  aircraftType: "Airbus A320",
};

const COMMERCIAL_CONTROL: CommercialFlightControl = {
  flightInstanceId: "fi1",
  departureAt: "2026-08-31T08:00:00.000Z",
  competitorPriceIrr: null,
  publicSaleEnabled: true,
  agencySaleEnabled: true,
  fareClasses: [
    {
      ruleId: "rule-y",
      cabin: "ECONOMY",
      classCode: "Y",
      seatsAllocated: 180,
      soldSeats: 152,
      siteSoldSeats: 140,
      agencySoldSeats: 12,
      remainingSeats: 28,
      sharedSeatsRemaining: 28,
      siteSeatsAvailable: 0,
      agencySeatsAvailable: 0,
      agencySeatsCommitted: 12,
      revenueIrr: "5776000000",
      basePriceIrr: "38000000",
      sitePriceIrr: "38000000",
      siteSeatsReleased: 10,
      agencySeatsReleased: 12,
      agencyReleasePriceIrr: "35000000",
      agencySpecialOffer: false,
      priceHistory: [],
    },
  ],
};

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
    status: "authenticated",
    user: mockAuthUserWithRole(role, { id: "me" }),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

function mockData(overview: FlightsOverview = OVERVIEW) {
  vi.spyOn(flightsApi, "fetchFlightsOverview").mockResolvedValue(overview);
  vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue(AIRPORTS);
  vi.spyOn(flightsApi, "fetchCommercialFlightControl").mockResolvedValue(
    COMMERCIAL_CONTROL,
  );
}

describe("FlightsPage", () => {
  it("renders KPI cards and the active table with derived statuses, occupancy and toman prices", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    render(<FlightsPage />);

    expect(
      await screen.findByText("مدیریت پروازها و موجودی"),
    ).toBeInTheDocument();
    expect(screen.getByText("پرواز فعال")).toBeInTheDocument();
    expect(screen.getByText("۱۵۲")).toBeInTheDocument(); // sold-seats KPI
    expect(screen.getByText("۸۴٪")).toBeInTheDocument();

    expect(screen.getByText("تهران ← دبی")).toBeInTheDocument();
    expect(screen.getByText("EP-821")).toBeInTheDocument();
    expect(screen.getByText("در حال فروش")).toBeInTheDocument();
    expect(screen.getByText("لغو شده")).toBeInTheDocument();
    // 38,000,000 rial → ۳٬۸۰۰٬۰۰۰ toman
    expect(screen.getByText("۳٬۸۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  });

  it("filters flight management by route and flight number and exposes the date calendar", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await screen.findByText("مدیریت پروازها و موجودی");
    expect(screen.getByTestId("flight-filter-date")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId("flight-filter-dest"), "MHD");
    expect(screen.getByText("RV-431")).toBeInTheDocument();
    expect(screen.queryByText("EP-821")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByTestId("flight-filter-number"));
    await userEvent.type(screen.getByTestId("flight-filter-number"), "EP-821");
    expect(screen.getByText("پروازی مطابق فیلترها یافت نشد.")).toBeInTheDocument();
  });

  it("shows weak-sales warnings as a one-card carousel", async () => {
    mockRole("COMMERCIAL_MANAGER");
    const weak = OVERVIEW.active.map((row, index) => ({
      ...row,
      derivedStatus: "SELLING" as const,
      salesHealth: {
        isWeak: true,
        occupancyPct: 10,
        hoursToDeparture: 24 + index,
        thresholdPct: 40,
        windowHours: 168,
        reasonFa: "فروش کمتر از حد انتظار است.",
      },
    }));
    mockData({ ...OVERVIEW, active: weak });
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    expect(await screen.findByTestId("commercial-flight-card-fi1")).toBeInTheDocument();

    expect(await screen.findByTestId("weak-sales-alert-fi1")).toBeInTheDocument();
    expect(screen.queryByTestId("weak-sales-alert-fi2")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("weak-sales-next"));
    expect(await screen.findByTestId("weak-sales-alert-fi2")).toBeInTheDocument();
    expect(screen.queryByTestId("weak-sales-alert-fi1")).not.toBeInTheDocument();
  });

  it("opens the full-page add-flight form when + افزودن پرواز is clicked", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    vi.spyOn(flightsApi, "fetchAirports").mockResolvedValue([
      { id: "a1", code: "THR", cityFa: "تهران", tz: "Asia/Tehran" },
      { id: "a2", code: "MHD", cityFa: "مشهد", tz: "Asia/Tehran" },
    ]);
    vi.spyOn(flightsApi, "fetchAircraftTypes").mockResolvedValue([
      { aircraftType: "Airbus A320", capacity: 180 },
    ]);

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ افزودن پرواز" }),
    );
    expect(await screen.findByTestId("add-flight-page")).toBeInTheDocument();
    expect(screen.getByText("افزودن پرواز جدید")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "ادامه به مرحله بعد",
      }),
    ).toBeInTheDocument();
  });

  it("flight detail modal shows the real channel breakdown and total revenue", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    vi.spyOn(flightsApi, "fetchFlightDetail").mockResolvedValue(DETAIL);

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await userEvent.click(await screen.findByText("تهران ← دبی"));
    const dialog = await screen.findByRole("dialog", { name: /EP-821/ });

    expect(dialog).toHaveClass("bg-[#141d2e]");
    expect(dialog).not.toHaveClass("bg-white");

    expect(
      within(dialog).getByText("تفکیک کانال فروش صندلی"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("فروش سیستمی")).toBeInTheDocument();
    expect(within(dialog).getByText(/۸۰ صندلی/)).toBeInTheDocument();
    expect(within(dialog).getByText("درآمد پرواز")).toBeInTheDocument();
    // 5,776,000,000 rial → ۵۷۷٬۶۰۰٬۰۰۰ toman
    expect(within(dialog).getByText("۵۷۷٬۶۰۰٬۰۰۰ تومان")).toBeInTheDocument();
  });

  it("future tab: AI panel renders; the plan modal pre-fills from AI and submits toman→rial + agency cap", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    const planSpy = vi.spyOn(flightsApi, "planFlight").mockResolvedValue({
      id: "fu1",
      basePriceIrr: "41000000",
      agencySeatsAllocated: 50,
      directSeats: 70,
      proposalPending: false,
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "پروازهای آینده" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /تهران ← دبی/ })); // expand card
    expect(
      screen.getByText("تحلیل هوش مصنوعی — چرا این قیمت؟"),
    ).toBeInTheDocument();
    expect(screen.getByText("تعیین نشده")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "نرخ‌گذاری" }));
    const dialog = await screen.findByRole("dialog", {
      name: /نرخ‌گذاری و تخصیص/,
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "استفاده از قیمت AI" }),
    );
    // 41,000,000 rial → 4,100,000 toman in the input
    expect(within(dialog).getByLabelText("نرخ نهایی (تومان)")).toHaveValue(
      "4100000",
    );

    const agencyInput = within(dialog).getByLabelText(/تخصیص صندلی آژانس/);
    fireEvent.change(agencyInput, { target: { value: "50" } });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "ثبت نرخ و تخصیص صندلی" }),
    );

    await waitFor(() =>
      expect(planSpy).toHaveBeenCalledWith(
        "fu1",
        expect.objectContaining({ priceIrr: "41000000", agencySeats: 50 }),
      ),
    );
    expect(
      await screen.findByText(/نرخ و تخصیص صندلی تهران ← دبی ثبت شد ✓/),
    ).toBeInTheDocument();
  });

  it("AI analysis outage shows the graceful degradation message", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    vi.spyOn(flightsApi, "runFlightsAiAnalysis").mockResolvedValue({
      analyzed: 0,
      available: false,
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "پروازهای آینده" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "پیشنهاد قیمت هوش مصنوعی" }),
    );
    expect(
      await screen.findByText(
        "سرویس تحلیل هوش مصنوعی در دسترس نیست؛ نرخ‌گذاری دستی همچنان ممکن است.",
      ),
    ).toBeInTheDocument();
  });

  it("Commercial shows cities tab and moves embedded pricing to ops tab", async () => {
    mockRole("COMMERCIAL_MANAGER");
    mockData();
    vi.spyOn(pricingApi, "fetchCommercialPricing").mockResolvedValue({
      flights: [],
    });

    render(<FlightsPage />);
    expect(
      await screen.findByRole("button", { name: "تعیین پرواز" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "عملیات" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "پروازهای آینده" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("تعیین قیمت پرواز و ارسال به گردش تأیید"),
    ).not.toBeInTheDocument();

    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(screen.getByRole("button", { name: "عملیات" }));
    expect(
      await screen.findByText("تعیین قیمت پرواز و ارسال برای بررسی مدیر عملیات"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("تعیین قیمت پرواز و ارسال به گردش تأیید"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "شهرهای پروازی" }),
    );
    expect(
      await screen.findByText("شهرهای دارای پرواز"),
    ).toBeInTheDocument();
    expect(screen.getByText("تهران")).toBeInTheDocument();
  });

  it("shows the redesigned class-level sales controls only to the Commercial Manager", async () => {
    mockRole("COMMERCIAL_MANAGER");
    mockData();
    vi.spyOn(flightsApi, "fetchFlightDetail").mockResolvedValue({
      ...DETAIL,
      classBreakdown: [
        { label: 'اکونومی', cabin: 'ECONOMY', capacity: 120, sold: 70 },
      ],
      classSitePrices: { اکونومی: '38000000' },
      agencyRelease: { اکونومی: { seats: 20, priceIrr: '35000000' } },
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);
    await userEvent.click(await screen.findByText("EP-821"));

    const dialog = await screen.findByRole("dialog", { name: /EP-821/ });
    expect(
      within(dialog).getByText('آزادسازی صندلی برای فروش آژانسی — به تفکیک کلاس پروازی'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('قیمت فروش در سایت به تفکیک کلاس پروازی'),
    ).toBeInTheDocument();
    expect(await within(dialog).findByRole('switch', { name: /فروش در سایت/ })).toBeInTheDocument();
  });

  it("does not expose published-fare or seat-lock controls to an employee", async () => {
    mockRole("EMPLOYEE");
    mockData();
    vi.spyOn(flightsApi, "fetchFlightDetail").mockResolvedValue(DETAIL);

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);
    await userEvent.click(await screen.findByText("EP-821"));

    const dialog = await screen.findByRole("dialog", { name: /EP-821/ });
    expect(within(dialog).queryByRole("button", { name: /MD/ })).not.toBeInTheDocument();
  });

  it("Senior does NOT get the pricing section", async () => {
    mockRole("SENIOR_MANAGER");
    mockData();
    render(<FlightsPage />);
    await screen.findByText("مدیریت پروازها و موجودی");
    expect(
      screen.queryByText("تعیین قیمت پرواز و ارسال به گردش تأیید"),
    ).not.toBeInTheDocument();
  });

  it("Senior future flights show pricing status but not the CEO pricing panel link", async () => {
    mockRole("SENIOR_MANAGER");
    mockData({
      ...OVERVIEW,
      future: [
        {
          ...FUTURE_ROW,
          approvalStatus: "PENDING_CEO",
          pricingRegistered: false,
        },
      ],
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    render(<FlightsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "پروازهای آینده" }),
    );
    expect(
      screen.getAllByText("در انتظار تأیید مدیرعامل").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: "مشاهده در پنل تأیید مدیرعامل",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("پنل تأیید مدیرعامل — قیمت‌گذاری"),
    ).not.toBeInTheDocument();
  });

});
