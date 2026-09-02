import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PricingPage from "./PricingPage";
import * as pricingApi from "../../api/pricing";
import * as useAuthModule from "../../hooks/useAuth";
import { mockAuthUserWithRole } from "../../test/mockAuthUser";
import type {
  CeoPricingResult,
  CommercialPricingResult,
  PricingProposal,
} from "../../types/pricing";
import type { Role } from "../../types/auth";

// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
const PROPOSAL: PricingProposal = {
  id: "pp1",
  flightInstanceId: "fi1",
  basePriceIrr: "38000000",
  competitorPriceIrr: "39000000",
  proposedPriceIrr: "38500000",
  legalRateIrr: "42000000",
  note: "قیمت کمی پایین‌تر از رقبا برای پرکردن صندلی‌های آزاد.",
  status: "PENDING",
  registeredPriceIrr: null,
  approvedAt: null,
  aiSuggestion: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  proposedBy: { id: "u1", fullName: "رضا مرادی", role: "COMMERCIAL_MANAGER" },
  approvedBy: null,
  flightInstance: {
    id: "fi1",
    departureAt: "2026-07-27T08:30:00.000Z",
    capacity: 180,
    charterSeats: 60,
    flight: {
      flightNo: "EP-821",
      route: { originCode: "THR", destCode: "DXB" },
    },
  },
};

const WITH_AI: PricingProposal = {
  ...PROPOSAL,
  id: "pp2",
  aiSuggestion: {
    priceIrr: 39_200_000,
    reason:
      "با توجه به فصل تابستان و قیمت رقبا، نرخ پیشنهادی مدل هم‌تراز رقباست.",
    factors: [
      "فصل: اوج سفرهای تابستانی",
      "موقعیت رقابتی: هم‌تراز با میانگین رقبا",
    ],
    season: "اوج سفرهای تابستانی",
    occasion: "بدون مناسبت خاص",
    confidence: 0.85,
    modelVersion: "heuristic-v1.0.0",
    generatedAt: "2026-07-17T00:00:00.000Z",
  },
};

const REGISTERED: PricingProposal = {
  ...PROPOSAL,
  id: "pp3",
  status: "REGISTERED",
  registeredPriceIrr: "38500000",
  approvedBy: { id: "u2", fullName: "محمد رحیمی", role: "CEO" },
  approvedAt: "2026-07-15T00:00:00.000Z",
};

const CEO_DATA: CeoPricingResult = {
  pending: [PROPOSAL, WITH_AI],
  registered: [REGISTERED],
  pendingApprovalsCount: 2,
};

const COMMERCIAL_DATA: CommercialPricingResult = {
  flights: [
    {
      id: "fi1",
      departureAt: "2026-07-27T08:30:00.000Z",
      capacity: 180,
      charterSeats: 60,
      basePriceIrr: "38000000",
      definitionStatus: "PENDING_CEO",
      version: 2,
      flight: {
        flightNo: "EP-821",
        route: { originCode: "THR", destCode: "DXB" },
      },
      pricing: PROPOSAL,
    },
    {
      id: "fi2",
      departureAt: "2026-08-06T08:30:00.000Z",
      capacity: 180,
      charterSeats: 60,
      // No base — modal opens empty so validation can be exercised.
      basePriceIrr: null,
      definitionStatus: "DRAFT",
      version: 1,
      flight: {
        flightNo: "EP-822",
        route: { originCode: "THR", destCode: "IST" },
      },
      pricing: null,
    },
    {
      id: "fi3",
      departureAt: "2026-08-16T08:30:00.000Z",
      capacity: 180,
      charterSeats: 60,
      basePriceIrr: "38000000",
      definitionStatus: "PUBLISHED",
      version: 4,
      flight: {
        flightNo: "EP-823",
        route: { originCode: "MHD", destCode: "KIH" },
      },
      pricing: REGISTERED,
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

function renderPage() {
  return render(
    <MemoryRouter>
      <PricingPage />
    </MemoryRouter>,
  );
}

describe("PricingPage", () => {
  it("SENIOR_MANAGER sees access denied and does not call pricing APIs", async () => {
    mockRole("SENIOR_MANAGER");
    const fetchCeo = vi.spyOn(pricingApi, "fetchCeoPricing");
    const fetchCommercial = vi.spyOn(pricingApi, "fetchCommercialPricing");
    const fetchCount = vi.spyOn(pricingApi, "fetchPendingApprovalsCount");

    renderPage();

    expect(await screen.findByTestId("pricing-access-denied")).toHaveTextContent(
      "دسترسی به این بخش مجاز نیست.",
    );
    expect(fetchCeo).not.toHaveBeenCalled();
    expect(fetchCommercial).not.toHaveBeenCalled();
    expect(fetchCount).not.toHaveBeenCalled();
  });

  it("CEO sees the workflow banner, AI button, pending cards with the three price columns and register buttons", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue(CEO_DATA);
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 2,
    });

    renderPage();

    expect(
      await screen.findByText("۱ پیشنهاد مدیر بازرگانی"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تحلیل و پیشنهاد قیمت هوش مصنوعی" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("پروازهای در انتظار تأیید نهایی"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("پس از تأیید مدیرعامل، پرواز برای فروش فعال می‌شود."),
    ).toBeInTheDocument();
    // 38,500,000 rial -> ۳٬۸۵۰٬۰۰۰ toman
    expect(screen.getAllByText("۳٬۸۵۰٬۰۰۰ تومان").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "تأیید نهایی" })).toHaveLength(
      2,
    );
    // «ثبت با AI» only on the card with a persisted suggestion.
    expect(screen.getAllByRole("button", { name: "ثبت با AI" })).toHaveLength(
      1,
    );
    expect(screen.getByText("تحلیل کامل هوش مصنوعی")).toBeInTheDocument();
    expect(screen.getByText(/یادداشت برای مدیرعامل/)).toBeInTheDocument();
    // Registered list with the locked badge.
    expect(screen.getByText("قیمت‌های ثبت‌شده")).toBeInTheDocument();
    expect(screen.getByText("قفل‌شده")).toBeInTheDocument();
  });

  it("CEO empty pending list shows the design empty state", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue({
      pending: [],
      registered: [],
    });
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 0,
    });

    renderPage();

    expect(
      await screen.findByText("پروازهای در انتظار تأیید نهایی"),
    ).toBeInTheDocument();
    expect(screen.getByText("اطلاعاتی یافت نشد")).toBeInTheDocument();
    expect(screen.queryByText("قیمت‌های ثبت‌شده")).not.toBeInTheDocument();
  });

  it("CEO approving proposed price confirms then calls approveProposal without OTP", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue(CEO_DATA);
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 2,
    });
    const register = vi
      .spyOn(pricingApi, "approveProposal")
      .mockResolvedValue(REGISTERED);

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "تأیید نهایی" }).length,
      ).toBeGreaterThan(0);
    });
    await userEvent.click(
      screen.getAllByRole("button", { name: "تأیید نهایی" })[0]!,
    );

    expect(
      screen.queryByRole("dialog", { name: "تأیید مجدد هویت" }),
    ).not.toBeInTheDocument();
    const confirm = await screen.findByTestId("ceo-register-confirm");
    await userEvent.click(
      within(confirm).getByTestId("ceo-register-confirm-confirm"),
    );

    await waitFor(() => expect(register).toHaveBeenCalledWith("pp1", "PROPOSED"));
    expect(
      await screen.findByText("قیمت پرواز تأیید و ثبت شد ✓"),
    ).toBeInTheDocument();
  });

  it("CEO reject requires a reason then ConfirmActionDialog without OTP", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue(CEO_DATA);
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 2,
    });
    const reject = vi.spyOn(pricingApi, "rejectProposal").mockResolvedValue({
      ...PROPOSAL,
      status: "REJECTED",
      rejectionReason: "نرخ پیشنهادی بالاست",
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "رد درخواست" }).length,
      ).toBeGreaterThan(0);
    });
    await userEvent.click(
      screen.getAllByRole("button", { name: "رد درخواست" })[0]!,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "ثبت درخواست" }),
    );

    expect(
      await screen.findByText("دلیل رد درخواست را وارد کنید."),
    ).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByLabelText("دلیل رد درخواست (الزامی)"),
      "نرخ پیشنهادی بالاست",
    );
    await userEvent.click(screen.getByRole("button", { name: "ثبت درخواست" }));

    expect(
      screen.queryByRole("dialog", { name: "تأیید مجدد هویت" }),
    ).not.toBeInTheDocument();
    const confirm = await screen.findByTestId("ceo-reject-confirm");
    await userEvent.click(within(confirm).getByTestId("ceo-reject-confirm-confirm"));

    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith("pp1", {
        rejectionReason: "نرخ پیشنهادی بالاست",
      }),
    );
    expect(
      await screen.findByText("درخواست قیمت‌گذاری رد شد ✓"),
    ).toBeInTheDocument();
  });

  it("CEO registering with AI calls the API with source=AI without OTP", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue(CEO_DATA);
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 2,
    });
    const register = vi
      .spyOn(pricingApi, "approveProposal")
      .mockResolvedValue(REGISTERED);

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "ثبت با AI" }),
    );

    const confirm = await screen.findByTestId("ceo-register-confirm");
    await userEvent.click(
      within(confirm).getByTestId("ceo-register-confirm-confirm"),
    );

    await waitFor(() => expect(register).toHaveBeenCalledWith("pp2", "AI"));
    expect(
      await screen.findByText("قیمت پرواز تأیید و ثبت شد ✓"),
    ).toBeInTheDocument();
  });

  it("CEO AI-analysis outage shows the graceful degradation message", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue(CEO_DATA);
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 2,
    });
    vi.spyOn(pricingApi, "runAiAnalysis").mockResolvedValue({
      analyzed: 0,
      available: false,
    });

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "تحلیل و پیشنهاد قیمت هوش مصنوعی",
      }),
    );
    expect(
      await screen.findByText(
        "سرویس تحلیل هوش مصنوعی در دسترس نیست؛ تأیید قیمت پیشنهادی همچنان ممکن است.",
      ),
    ).toBeInTheDocument();
  });

  it("CEO pending badge uses fetchPendingApprovalsCount when API succeeds", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue({
      pending: [PROPOSAL],
      registered: [],
      pendingApprovalsCount: 1,
    });
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 5,
    });

    renderPage();

    expect(
      await screen.findByText("پروازهای در انتظار تأیید نهایی"),
    ).toBeInTheDocument();
    expect(screen.getByText("۵")).toBeInTheDocument();
  });

  it("CEO pending badge shows zero when count API returns zero", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue({
      pending: [],
      registered: [],
    });
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockResolvedValue({
      pendingApprovalsCount: 0,
    });

    renderPage();

    expect(
      await screen.findByText("پروازهای در انتظار تأیید نهایی"),
    ).toBeInTheDocument();
    expect(screen.getByText("۰")).toBeInTheDocument();
    expect(screen.getByText("اطلاعاتی یافت نشد")).toBeInTheDocument();
  });

  it("CEO pending badge falls back to pending.length when count API fails", async () => {
    mockRole("CEO");
    vi.spyOn(pricingApi, "fetchCeoPricing").mockResolvedValue({
      pending: [PROPOSAL, WITH_AI],
      registered: [],
    });
    vi.spyOn(pricingApi, "fetchPendingApprovalsCount").mockRejectedValue(
      new Error("network"),
    );

    renderPage();

    const pendingHeading = await screen.findByText(
      "پروازهای در انتظار تأیید نهایی",
    );
    expect(pendingHeading.parentElement).toHaveTextContent("۲");
  });

  it("Commercial sees the three row states and the correct button labels", async () => {
    mockRole("COMMERCIAL_MANAGER");
    vi.spyOn(pricingApi, "fetchCommercialPricing").mockResolvedValue(
      COMMERCIAL_DATA,
    );

    renderPage();

    expect(
      await screen.findByText("تعیین قیمت پرواز و ارسال به گردش تأیید"),
    ).toBeInTheDocument();
    expect(screen.getByText("در انتظار تأیید مدیر عامل")).toBeInTheDocument();
    expect(screen.getByText("قیمت‌گذاری نشده")).toBeInTheDocument();
    expect(screen.getByText("منتشرشده — قابل مدیریت")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ارسال‌شده" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "تعیین قیمت" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مدیریت قیمت" })).toBeEnabled();
    // Subtitle shows base + competitor for rows that already have a proposal.
    expect(screen.getAllByText(/پایه/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/رقبا/).length).toBeGreaterThan(0);
    // Proposed rate column shows the pending proposal amount (rial→toman).
    expect(screen.getAllByText("۳٬۸۵۰٬۰۰۰ تومان").length).toBeGreaterThan(0);
  });

  it("Commercial shows — for missing competitor and never invents base+3%", async () => {
    mockRole("COMMERCIAL_MANAGER");
    vi.spyOn(pricingApi, "fetchCommercialPricing").mockResolvedValue({
      flights: [
        {
          id: "fi-nocomp",
          departureAt: "2026-08-06T08:30:00.000Z",
          capacity: 180,
          charterSeats: 60,
          basePriceIrr: "38000000",
          competitorPriceIrr: null,
          flight: {
            flightNo: "XY1234",
            route: { originCode: "THR", destCode: "DXB" },
          },
          pricing: null,
        },
      ],
    });

    renderPage();

    const subtitle = await screen.findByText(/پایه/);
    expect(subtitle).toHaveTextContent("رقبا —");
    // Old fabricated competitor was ~39,100,000 IRR → ۳٬۹۱۰٬۰۰۰ تومان.
    expect(screen.queryByText(/۳٬۹۱۰٬۰۰۰/)).not.toBeInTheDocument();
  });

  it("Commercial set-price modal validates the proposed price and submits toman→rial", async () => {
    mockRole("COMMERCIAL_MANAGER");
    vi.spyOn(pricingApi, "fetchCommercialPricing").mockResolvedValue(
      COMMERCIAL_DATA,
    );
    const upsert = vi
      .spyOn(pricingApi, "upsertProposal")
      .mockResolvedValue(PROPOSAL);
    const submitOperations = vi
      .spyOn((await import("../../api/flights")), "submitFlightToOperations")
      .mockResolvedValue({} as never);

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "تعیین قیمت" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "ارسال نرخ پیشنهادی برای بررسی مدیر عملیات",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "نرخ پیشنهادی را وارد کنید",
    );
    expect(upsert).not.toHaveBeenCalled();

    await userEvent.type(
      screen.getByLabelText("نرخ پیشنهادی (تومان)"),
      "3850000",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "ارسال نرخ پیشنهادی برای بررسی مدیر عملیات",
      }),
    );
    // 3,850,000 toman -> 38,500,000 rial (decimal string on the wire)
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith("fi2", {
        proposedPriceIrr: "38500000",
        legalRateIrr: undefined,
        note: undefined,
      }),
    );
    expect(submitOperations).toHaveBeenCalledWith("fi2", 1);
    expect(
      await screen.findByText(
        "نرخ پیشنهادی برای بررسی مدیر عملیات ارسال شد ✓",
      ),
    ).toBeInTheDocument();
  });

  it("Commercial pricing list paginates at 10 rows per page", async () => {
    mockRole("COMMERCIAL_MANAGER");
    const many: CommercialPricingResult = {
      flights: Array.from({ length: 12 }, (_, i) => ({
        id: `fi-page-${i + 1}`,
        departureAt: "2026-08-06T08:30:00.000Z",
        capacity: 180,
        charterSeats: 60,
        basePriceIrr: "38000000",
        flight: {
          flightNo: `EP-${800 + i}`,
          route: { originCode: "THR", destCode: "DXB" },
        },
        pricing: null,
      })),
    };
    vi.spyOn(pricingApi, "fetchCommercialPricing").mockResolvedValue(many);

    const { default: userEvent } = await import("@testing-library/user-event");
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "تعیین قیمت" }),
      ).toHaveLength(10);
    });
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "بعدی" }));
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "تعیین قیمت" }),
      ).toHaveLength(2);
    });
  });
});
