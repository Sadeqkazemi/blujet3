import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeCartablePage from "./EmployeeCartablePage";
import * as cartableApi from "../../api/cartable";
import * as panelsApi from "../../api/panels";
import type { CartableListResult } from "../../types/cartable";

const LIST: CartableListResult = {
  tasks: [
    {
      id: "t1",
      category: "ADMIN",
      title: "بررسی قرارداد",
      description: "توضیح",
      senderLabelFa: "مدیر بازرگانی",
      sender: null,
      sourceType: null,
      sourceId: null,
      status: "OPEN",
      resolutionNote: null,
      createdAt: "2026-07-31T10:00:00.000Z",
    },
  ],
  counts: { ADMIN: 1, AGENCY: 0, MANAGER: 0 },
  totalOpen: 1,
};

describe("EmployeeCartablePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cartableApi, "fetchCartable").mockResolvedValue(LIST);
    vi.spyOn(panelsApi, "fetchEmployeeContext").mockResolvedValue({
      dept: "commercial",
      deptLabelFa: "واحد بازرگانی",
      rank: "کارشناس",
      permissionLabelsFa: ["مشاهدهٔ کارتابل", "رسیدگی به کارتابل"],
      permissionKeys: ["ct_list", "ct_process"],
    });
    vi.spyOn(cartableApi, "fetchManagerRecipients").mockResolvedValue([
      {
        id: "mgr1",
        fullName: "مدیر بازرگانی",
        role: "COMMERCIAL_MANAGER",
        roleLabelFa: "مدیر بازرگانی",
        isOwnManager: true,
      },
    ]);
    vi.spyOn(cartableApi, "fetchSentManagerMessages").mockResolvedValue([]);
  });

  it("renders open tasks with the انجام شد button", async () => {
    render(<EmployeeCartablePage />);
    expect(await screen.findByText("بررسی قرارداد")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "کارتابل داخلی" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /کارهای باز.*۱/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /تکمیل‌شده.*۰/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "جستجو در کارتابل داخلی" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "انجام شد ✓" }),
    ).toBeInTheDocument();
  });

  it("filters employee internal work without ticket behavior", async () => {
    render(<EmployeeCartablePage />);
    const search = await screen.findByRole("searchbox", {
      name: "جستجو در کارتابل داخلی",
    });
    await userEvent.type(search, "عبارت ناموجود");
    expect(screen.queryByText("بررسی قرارداد")).not.toBeInTheDocument();
    expect(
      screen.getByText("موردی با این جستجو یافت نشد."),
    ).toBeInTheDocument();
  });

  it("marks a task done via approve with the design note", async () => {
    const approve = vi
      .spyOn(cartableApi, "approveCartableTask")
      .mockResolvedValue(LIST.tasks[0]);
    render(<EmployeeCartablePage />);
    await screen.findByText("بررسی قرارداد");
    await userEvent.click(screen.getByRole("button", { name: "انجام شد ✓" }));
    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith("t1", "انجام شد");
    });
  });

  it("sends a manager message when recipient and text are filled", async () => {
    const send = vi
      .spyOn(cartableApi, "sendEmployeeManagerMessage")
      .mockResolvedValue({ id: "x" });
    render(<EmployeeCartablePage />);
    await screen.findByText("ارسال پیام داخلی");
    await userEvent.selectOptions(screen.getByLabelText("گیرنده"), "mgr1");
    await userEvent.type(screen.getByLabelText("متن پیام"), "سلام");
    await userEvent.click(screen.getByRole("button", { name: "ارسال" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({
        toId: "mgr1",
        body: "سلام",
        attachmentIds: [],
      });
    });
  });

  it("shows the empty state when there are no tasks", async () => {
    vi.spyOn(cartableApi, "fetchCartable").mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });
    render(<EmployeeCartablePage />);
    expect(
      await screen.findByText("کار بازی در کارتابل شما نیست."),
    ).toBeInTheDocument();
  });

  it("keeps the cartable usable for a read-only employee without calling manager-only endpoints", async () => {
    vi.mocked(panelsApi.fetchEmployeeContext).mockResolvedValue({
      dept: "commercial",
      deptLabelFa: "واحد بازرگانی",
      rank: "کارشناس",
      permissionLabelsFa: ["مشاهدهٔ کارتابل"],
      permissionKeys: ["ct_list"],
    });

    render(<EmployeeCartablePage />);

    expect(await screen.findByText("بررسی قرارداد")).toBeInTheDocument();
    expect(
      screen.queryByText("خطا در دریافت کارتابل."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ارسال پیام داخلی")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "انجام شد ✓" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("فقط مشاهده")).toBeInTheDocument();
    expect(cartableApi.fetchManagerRecipients).not.toHaveBeenCalled();
    expect(cartableApi.fetchSentManagerMessages).not.toHaveBeenCalled();
  });

  it("replies without closing and exposes a separate conversation close action", async () => {
    const internalTask = {
      ...LIST.tasks[0],
      sourceType: "MANAGER_MESSAGE" as const,
      conversationId: "conversation-1",
      history: [
        {
          id: "message-t1",
          action: "ثبت و ارسال پیام",
          detail: "لطفاً بررسی کنید",
          actorLabel: "مدیر بازرگانی",
          actorRole: "COMMERCIAL_MANAGER",
          createdAt: LIST.tasks[0].createdAt,
        },
      ],
    };
    vi.spyOn(cartableApi, "fetchCartable").mockResolvedValue({
      ...LIST,
      tasks: [internalTask],
    });
    vi.spyOn(cartableApi, "fetchCartableTask").mockResolvedValue(internalTask);
    const reply = vi
      .spyOn(cartableApi, "replyCartableMessage")
      .mockResolvedValue({ ...internalTask, id: "reply-1", status: "OPEN" });
    const close = vi
      .spyOn(cartableApi, "closeCartableConversation")
      .mockResolvedValue({ ...internalTask, status: "APPROVED" });

    render(<EmployeeCartablePage />);
    await userEvent.click(await screen.findByRole("button", { name: "پاسخ" }));
    await userEvent.type(screen.getByLabelText("پاسخ شما *"), "پاسخ کارمند");
    await userEvent.click(
      screen.getByRole("button", { name: "ارسال پاسخ" }),
    );

    await waitFor(() => {
      expect(reply).toHaveBeenCalledWith("t1", "پاسخ کارمند", []);
    });
    expect(screen.getByRole("button", { name: "بستن پیام" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "بستن پیام" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith("t1"));
  });
});
