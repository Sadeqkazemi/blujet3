import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as flightsApi from "../../../api/flights";
import type { CommercialFlightControl, FlightDetail } from "../../../types/flights";
import CommercialFlightDetailContent from "./CommercialFlightDetailContent";
import * as cancellationApi from "../../../api/flight-cancellations";
import * as agenciesApi from "../../../api/agencies";

const detail: FlightDetail = {
  id: "fi-1",
  flightNo: "EP-821",
  originCode: "THR",
  destCode: "DXB",
  departureAt: "2026-08-30T08:30:00.000Z",
  capacity: 180,
  sold: 40,
  basePriceIrr: "38000000",
  publicSaleEnabled: true,
  occupancyPct: 22,
  aircraftType: "Airbus A320",
  channels: [
    { channel: "SYSTEM", seats: 25, revenueIrr: "950000000" },
    { channel: "CHARTER", seats: 10, revenueIrr: "380000000" },
    { channel: "AGENCY", seats: 5, revenueIrr: "190000000" },
  ],
  totalRevenueIrr: "1520000000",
};

const control: CommercialFlightControl = {
  flightInstanceId: "fi-1",
  departureAt: "2026-08-31T08:00:00.000Z",
  competitorPriceIrr: null,
  publicSaleEnabled: true,
  agencySaleEnabled: true,
  fareClasses: [
    {
      ruleId: "rule-y",
      cabin: "ECONOMY",
      classCode: "Y",
      seatsAllocated: 160,
      soldSeats: 40,
      siteSoldSeats: 25,
      agencySoldSeats: 5,
      remainingSeats: 120,
      sharedSeatsRemaining: 120,
      siteSeatsAvailable: 0,
      agencySeatsAvailable: 3,
      agencySeatsCommitted: 5,
      revenueIrr: "1520000000",
      basePriceIrr: "38000000",
      sitePriceIrr: "38000000",
      siteSeatsReleased: 12,
      agencySeatsReleased: 8,
      agencyReleasePriceIrr: "35000000",
      agencySpecialOffer: false,
      priceHistory: [],
    },
  ],
};

function renderContent() {
  return render(
    <CommercialFlightDetailContent
      detail={detail}
      canManage
      onNotice={vi.fn()}
      onError={vi.fn()}
      onChanged={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
}

describe("CommercialFlightDetailContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(flightsApi, "fetchCommercialFlightControl").mockResolvedValue(control);
    vi.spyOn(flightsApi, "fetchAllotmentsSummary").mockResolvedValue({
      flightInstanceId: "fi-1",
      totalCapacity: 180,
      charterSeats: 0,
      directReserved: 40,
      agencySeats: 10,
      freeSeats: 130,
      agencyRevenueIrr: "350000000",
      agencies: [],
    });
    vi.spyOn(agenciesApi, "fetchAgencies").mockResolvedValue({
      kpis: {
        activeCount: 1,
        totalCreditGrantedIrr: "0",
        totalUsedIrr: "0",
        pendingSettlementCount: 0,
      },
      agencies: [{
        id: "agency-1",
        fullName: "آژانس نمونه",
        managerName: "مدیر",
        licenseNo: "A-1",
        city: "تهران",
        tier: "NORMAL",
        isActive: true,
        limitIrr: "0",
        usedIrr: "0",
        remainingIrr: "0",
        pendingInvoiceCount: 0,
        monthlyTicketsSold: 0,
        monthlySalesIrr: "0",
      }],
    });
  });

  it("keeps manual agency locks in the dedicated agency tab", async () => {
    const createSpy = vi.spyOn(flightsApi, "createAllotment").mockResolvedValue({
      id: "allot-1",
      agencyId: "agency-1",
      agencyName: "آژانس نمونه",
      seatsAllocated: 12,
      type: "HARD",
      releaseAt: null,
      contractPriceIrr: "36000000",
      createdAt: "2026-08-26T00:00:00.000Z",
      active: true,
    });
    renderContent();

    await screen.findByText("تفکیک کانال فروش صندلی");
    fireEvent.click(screen.getByRole("button", { name: "آژانس" }));
    fireEvent.change(screen.getByLabelText("آژانس"), { target: { value: "agency-1" } });
    fireEvent.change(screen.getByLabelText("تعداد صندلی"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("قیمت هر صندلی (تومان)"), { target: { value: "3600000" } });
    fireEvent.click(screen.getByRole("button", { name: "قفل صندلی برای آژانس" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith("fi-1", {
      agencyId: "agency-1",
      seatsAllocated: 12,
      type: "HARD",
      contractPriceIrr: "36000000",
    }));
  });

  it("renders the real flight controls and updates sales visibility through the canonical endpoint", async () => {
    const visibilitySpy = vi
      .spyOn(flightsApi, "updateFlightSalesVisibility")
      .mockResolvedValue({ ...control, publicSaleEnabled: false });
    renderContent();

    expect(await screen.findByText("تفکیک کانال فروش صندلی")).toBeInTheDocument();
    expect(screen.getAllByText("اکونومی · Y")).toHaveLength(2);

    fireEvent.click(await screen.findByRole("switch", { name: /فروش در سایت/ }));
    await waitFor(() => expect(visibilitySpy).toHaveBeenCalledWith("fi-1", false));
  });

  it("shows channel sold counts and independently toggles agency catalogue visibility", async () => {
    const agencyVisibilitySpy = vi
      .spyOn(flightsApi, "updateAgencySalesVisibility")
      .mockResolvedValue({ ...control, agencySaleEnabled: false });
    renderContent();

    expect(await screen.findByText("۲۵ صندلی فروخته‌شده در سایت")).toBeInTheDocument();
    expect(screen.getByText("۵ صندلی فروخته‌شده به آژانس‌ها")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("switch", { name: /فروش آژانسی/ }));

    await waitFor(() =>
      expect(agencyVisibilitySpy).toHaveBeenCalledWith("fi-1", false),
    );
  });

  it("saves the per-class agency allocation and website price with their canonical APIs", async () => {
    const releaseSpy = vi
      .spyOn(flightsApi, "upsertAgencyFareRelease")
      .mockResolvedValue(control.fareClasses[0]);
    const priceSpy = vi
      .spyOn(flightsApi, "updateFareClassSitePrice")
      .mockResolvedValue(control.fareClasses[0]);
    renderContent();

    const releaseHeading = await screen.findByText("آزادسازی صندلی برای فروش آژانسی — به تفکیک کلاس پروازی");
    expect(releaseHeading).toBeVisible();
    fireEvent.change(screen.getByLabelText("تعداد صندلی برای فروش"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("قیمت هر صندلی این کلاس (تومان)"), {
      target: { value: "3600000" },
    });
    fireEvent.click(screen.getByLabelText("نمایش به آژانس‌ها به‌عنوان پیشنهاد فوق‌العاده"));
    fireEvent.click(screen.getByRole("button", { name: "ثبت" }));

    await waitFor(() =>
      expect(releaseSpy).toHaveBeenCalledWith("fi-1", "rule-y", {
        seats: 15,
        priceIrr: "36000000",
        specialOffer: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "اصلاح قیمت ✎" }));
    fireEvent.change(screen.getByLabelText("قیمت سایت اکونومی · Y"), {
      target: { value: "4200000" },
    });
    fireEvent.change(screen.getByLabelText("دلیل تغییر قیمت اکونومی · Y"), {
      target: { value: "تقاضای آخر هفته" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() =>
      expect(priceSpy).toHaveBeenCalledWith("fi-1", "rule-y", {
        priceIrr: "42000000",
        reason: "تقاضای آخر هفته",
        seats: 12,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "آژانس" }));
    expect(releaseHeading.closest("section")).toHaveClass("hidden");
  });

  it("requires a reason and cancels the flight through the governed endpoint", async () => {
    const cancelSpy = vi.spyOn(cancellationApi, "cancelFlight").mockResolvedValue({
      flightInstanceId: "fi-1",
      status: "CANCELLED",
      affectedBookings: 3,
    });
    renderContent();

    await screen.findByText("تفکیک کانال فروش صندلی");
    fireEvent.click(screen.getByRole("button", { name: "کنسل کردن پرواز" }));
    fireEvent.change(screen.getByLabelText("علت کنسلی"), {
      target: { value: "محدودیت عملیاتی فرودگاه" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأیید کنسلی" }));

    await waitFor(() =>
      expect(cancelSpy).toHaveBeenCalledWith("fi-1", "محدودیت عملیاتی فرودگاه"),
    );
  });
});
