import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountLoansTab from "./AccountLoansTab";
import * as loansApi from "../../api/loans";
import type { LoanCustomerProfile } from "../../types/loans";

const baseProfile: LoanCustomerProfile = {
  membershipStatus: "UNDECLARED",
  maskedCustomerNumber: null,
  accountOpeningStatus: "NOT_STARTED",
  accountOpeningReferenceId: null,
  eligibilityStatus: "NOT_STARTED",
  eligibilityReferenceId: null,
  eligibleAmountIrr: null,
  lastSyncedAt: null,
  updatedAt: "2026-08-25T08:00:00.000Z",
};

function mockHistory() {
  return vi.spyOn(loansApi, "fetchMyLoanApplications").mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("AccountLoansTab", () => {
  it("submits the Saman customer number and keeps the amount locked while assessment starts", async () => {
    mockHistory();
    vi.spyOn(loansApi, "fetchLoanProfile").mockResolvedValue(baseProfile);
    const eligibilitySpy = vi
      .spyOn(loansApi, "startLoanEligibility")
      .mockResolvedValue({
        ...baseProfile,
        membershipStatus: "BANK_CUSTOMER",
        maskedCustomerNumber: "••••7890",
        eligibilityStatus: "SUBMITTED",
        eligibilityReferenceId: "ASSESS-START",
      });

    render(<AccountLoansTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("loan-bank-customer"));
    expect(screen.getByTestId("loan-customer-number-field")).toHaveClass(
      "min-h-24",
    );
    await user.type(screen.getByTestId("loan-customer-number"), "1234567890");
    await user.click(screen.getByTestId("loan-start-eligibility"));

    await waitFor(() =>
      expect(eligibilitySpy).toHaveBeenCalledWith(
        "1234567890",
        expect.any(String),
      ),
    );
    expect(screen.getByTestId("loan-amount-input")).toBeDisabled();
    expect(screen.getByTestId("loan-flow-status")).toHaveTextContent(
      "اعتبارسنجی در حال انجام",
    );
    expect(screen.getByTestId("loan-request-notice")).toHaveTextContent(
      "درخواست اعتبارسنجی شما ارسال شد",
    );
  });

  it("keeps the amount request locked while bank assessment is pending", async () => {
    mockHistory();
    vi.spyOn(loansApi, "fetchLoanProfile").mockResolvedValue({
      ...baseProfile,
      membershipStatus: "BANK_CUSTOMER",
      eligibilityStatus: "UNDER_REVIEW",
      eligibilityReferenceId: "ASSESS-1",
    });

    render(<AccountLoansTab />);

    expect(await screen.findByTestId("loan-sync-pending")).toBeEnabled();
    expect(screen.getByTestId("loan-amount-input")).toBeDisabled();
    expect(screen.getByTestId("loan-submit")).toBeDisabled();
  });

  it("unlocks the amount only after the bank returns an eligible rial limit", async () => {
    mockHistory();
    vi.spyOn(loansApi, "fetchLoanProfile").mockResolvedValue({
      ...baseProfile,
      membershipStatus: "BANK_CUSTOMER",
      eligibilityStatus: "UNDER_REVIEW",
      eligibilityReferenceId: "ASSESS-2",
    });
    vi.spyOn(loansApi, "syncLoanEligibility").mockResolvedValue({
      ...baseProfile,
      membershipStatus: "BANK_CUSTOMER",
      maskedCustomerNumber: "••••7890",
      eligibilityStatus: "ELIGIBLE",
      eligibilityReferenceId: "ASSESS-2",
      eligibleAmountIrr: "50000000",
    });

    render(<AccountLoansTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("loan-sync-pending"));

    await waitFor(() =>
      expect(screen.getByTestId("loan-amount-input")).toBeEnabled(),
    );
    expect(screen.getByTestId("loan-eligible-amount")).toHaveTextContent(
      "۵٬۰۰۰٬۰۰۰ تومان",
    );
    expect(screen.getByTestId("loan-flow-status")).toHaveTextContent(
      "سقف اعتبار مشخص شد",
    );
  });

  it("sends a Toman amount as IRR only after an eligible limit exists", async () => {
    mockHistory();
    vi.spyOn(loansApi, "fetchLoanProfile").mockResolvedValue({
      ...baseProfile,
      membershipStatus: "BANK_CUSTOMER",
      maskedCustomerNumber: "••••7890",
      eligibilityStatus: "ELIGIBLE",
      eligibilityReferenceId: "ASSESS-2",
      eligibleAmountIrr: "50000000",
    });
    const createSpy = vi
      .spyOn(loansApi, "createLoanApplication")
      .mockResolvedValue({
        id: "loan-1",
        requestedAmountIrr: "12500000",
        bankStatus: "SUBMITTED",
        displayStatus: "awaiting_bank",
        bankReferenceId: "BANK-1",
        createdAt: "2026-08-10T08:00:00.000Z",
        updatedAt: "2026-08-10T08:00:00.000Z",
        lastSyncedAt: null,
      });

    render(<AccountLoansTab />);
    expect(
      await screen.findByText("هنوز درخواست وامی ثبت نشده است."),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("loan-amount-input"), "۱٬۲۵۰٬۰۰۰");
    await user.click(screen.getByTestId("loan-submit"));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith("12500000", expect.any(String)),
    );
  });

  it("starts account opening for a non-customer without unlocking later steps", async () => {
    mockHistory();
    vi.spyOn(loansApi, "fetchLoanProfile").mockResolvedValue(baseProfile);
    const openingSpy = vi
      .spyOn(loansApi, "startLoanAccountOpening")
      .mockResolvedValue({
        ...baseProfile,
        membershipStatus: "ACCOUNT_OPENING_REQUESTED",
        accountOpeningStatus: "SUBMITTED",
        accountOpeningReferenceId: "OPEN-1",
      });

    render(<AccountLoansTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("loan-bank-non-customer"));
    await user.click(screen.getByTestId("loan-open-account"));

    await waitFor(() =>
      expect(openingSpy).toHaveBeenCalledWith(expect.any(String)),
    );
    expect(screen.getByTestId("loan-amount-input")).toBeDisabled();
  });
});
