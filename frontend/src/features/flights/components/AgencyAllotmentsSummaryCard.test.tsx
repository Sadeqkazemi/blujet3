import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgencyAllotmentsSummaryCard from "./AgencyAllotmentsSummaryCard";

describe("AgencyAllotmentsSummaryCard", () => {
  it("renders reservation-sourced agency seats, free capacity and agency rows", () => {
    render(
      <AgencyAllotmentsSummaryCard
        summary={{
          flightInstanceId: "fi-1",
          totalCapacity: 180,
          charterSeats: 20,
          directReserved: 10,
          agencySeats: 30,
          freeSeats: 120,
          agencyRevenueIrr: "450000000",
          agencies: [
            {
              id: "allot-1",
              agencyId: "agency-1",
              agencyName: "آژانس سپهر",
              seatsAllocated: 30,
              type: "HARD",
              releaseAt: null,
              contractPriceIrr: "15000000",
              revenueIrr: "450000000",
              createdAt: "2026-08-11T00:00:00.000Z",
              active: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("agency-allotments-summary")).toHaveTextContent(
      "آژانس سپهر",
    );
    expect(screen.getByText("صندلی آزاد").parentElement).toHaveTextContent(
      "۱۲۰",
    );
    expect(screen.getByText(/مجموع صندلی آژانس/)).toHaveTextContent("۳۰");
  });

  it("does not expose a manual commitment form without a resolved flight", () => {
    render(<AgencyAllotmentsSummaryCard summary={null} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/شماره پرواز ثبت‌شده/)).toBeInTheDocument();
  });
});
