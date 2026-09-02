import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  approveCartableTask,
  fetchCartable,
  fetchCartableTask,
  fetchChairPermission,
  fetchStaffDirectory,
  rejectCartableTask,
  replyCartableMessage,
  closeCartableConversation,
  requestChairPermission,
  transferCartableTask,
} from "../../api/cartable";
import { faDigits } from "../../lib/fa-format";
import { formatJalaliDateTime } from "../../lib/jalali";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import JalaliDatePicker from "../../components/JalaliDatePicker";
import ComposeMessageModal from "./ComposeMessageModal";
import AttachmentList from "../../components/AttachmentList";
import ConversationHistory from "../../components/ConversationHistory";
import AttachmentPicker from "../../components/AttachmentPicker";
import InternalCartableDashboard from "./InternalCartableDashboard";
import type {
  CartableCategory,
  CartableListResult,
  CartableStatus,
  CartableTask,
  ChairPermission,
  StaffDirectoryEntry,
  ReferralAttachment,
} from "../../types/cartable";

const CATEGORY_CARDS: {
  key: CartableCategory;
  label: string;
  iconBg: string;
  iconColor: string;
  icon: ReactNode;
}[] = [
  {
    key: "ADMIN",
    label: "درخواست اداری",
    iconBg: "rgba(59,130,246,.16)",
    iconColor: "#60a5fa",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    key: "AGENCY",
    label: "همکاری آژانس",
    iconBg: "rgba(245,158,11,.16)",
    iconColor: "#f59e0b",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M3 21h18" />
        <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
        <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
        <path d="M9 8h3M9 12h3M9 16h3" />
      </svg>
    ),
  },
  {
    key: "MANAGER",
    label: "درخواست مدیران",
    iconBg: "rgba(147,51,234,.16)",
    iconColor: "#a855f7",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

const CATEGORY_META: Record<
  CartableCategory,
  {
    badge: string;
    tagColor: string;
    tagBg: string;
    iconBg: string;
    iconColor: string;
    icon: ReactNode;
  }
> = {
  ADMIN: {
    badge: "اداری",
    tagColor: "#60a5fa",
    tagBg: "rgba(59,130,246,.16)",
    iconBg: "rgba(59,130,246,.16)",
    iconColor: "#60a5fa",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  AGENCY: {
    badge: "همکاری آژانس",
    tagColor: "#f59e0b",
    tagBg: "rgba(245,158,11,.14)",
    iconBg: "rgba(245,158,11,.16)",
    iconColor: "#f59e0b",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path d="M3 21h18" />
        <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
        <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
        <path d="M9 8h3M9 12h3M9 16h3" />
      </svg>
    ),
  },
  MANAGER: {
    badge: "درخواست مدیر",
    tagColor: "#a855f7",
    tagBg: "rgba(147,51,234,.16)",
    iconBg: "rgba(147,51,234,.16)",
    iconColor: "#a855f7",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
};

const STATUS_FILTERS: { key: CartableStatus; label: string }[] = [
  { key: "OPEN", label: "کارهای باز" },
  { key: "APPROVED", label: "تأییدشده" },
  { key: "REJECTED", label: "ردشده" },
  { key: "TRANSFERRED", label: "منتقل‌شده" },
];

export default function CartablePage() {
  const { user } = useAuth();
  const hasChairGate =
    user?.role === "FINANCE_MANAGER" || user?.role === "COMMERCIAL_MANAGER";
  const dark =
    user?.role === "CEO" ||
    user?.role === "BOARD_CHAIR" ||
    user?.role === "SENIOR_MANAGER" ||
    user?.role === "FINANCE_MANAGER" ||
    user?.role === "COMMERCIAL_MANAGER" ||
    user?.role === "IT_MANAGER" ||
    user?.role === "SITE_ADMIN";

  const [result, setResult] = useState<CartableListResult | null>(null);
  const [category, setCategory] = useState<CartableCategory | null>(null);
  const [status, setStatus] = useState<CartableStatus>("OPEN");
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [chairPerm, setChairPerm] = useState<ChairPermission | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const [reviewTask, setReviewTask] = useState<CartableTask | null>(null);
  const [note, setNote] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [replyAttachments, setReplyAttachments] = useState<
    ReferralAttachment[]
  >([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCartable({
        category: category ?? undefined,
        date: filterDate ?? undefined,
        status,
      });
      setResult(data);
      if (hasChairGate) setChairPerm(await fetchChairPermission());
    } catch {
      setError("خطا در دریافت کارتابل.");
    } finally {
      setLoading(false);
    }
  }, [category, filterDate, hasChairGate, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  async function openReview(task: CartableTask) {
    setReviewTask(task);
    setNote("");
    setTransferTo("");
    setReviewError(null);
    setReplyAttachments([]);
    try {
      const detail = await fetchCartableTask(task.id);
      setReviewTask(detail);
    } catch {
      // List row is enough to decide; detail marks readAt when available.
    }
  }

  async function onReply() {
    if (!reviewTask) return;
    if (!note.trim()) {
      setReviewError("متن پاسخ را وارد کنید.");
      return;
    }
    try {
      const taskId = reviewTask.id;
      await replyCartableMessage(
        reviewTask.id,
        note.trim(),
        replyAttachments.map((file) => file.id),
      );
      setNotice("پاسخ ارسال شد ✓");
      setNote("");
      setReplyAttachments([]);
      setReviewTask(await fetchCartableTask(taskId));
      await load();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "خطا در ارسال پاسخ.");
    }
  }

  async function onCloseConversation() {
    if (!reviewTask) return;
    try {
      await closeCartableConversation(reviewTask.id);
      setNotice("پیام بسته و در تاریخچه نگهداری شد ✓");
      setReviewTask(null);
      await load();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "خطا در بستن پیام.");
    }
  }

  async function onDecide(action: "approve" | "reject" | "transfer") {
    if (!reviewTask) return;
    if (!note.trim()) {
      setReviewError("برای ثبت تصمیم، درج نظر مدیر الزامی است.");
      return;
    }
    try {
      if (action === "approve") {
        await approveCartableTask(reviewTask.id, note.trim());
        setNotice("درخواست تأیید شد ✓");
      } else if (action === "reject") {
        await rejectCartableTask(reviewTask.id, note.trim());
        setNotice("درخواست رد شد");
      } else {
        const target = staff.find((s) => s.id === transferTo);
        await transferCartableTask(reviewTask.id, transferTo, note.trim());
        setNotice(`درخواست به ${target?.fullName ?? "مدیر مقصد"} منتقل شد`);
      }
      setReviewTask(null);
      await load();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "خطا در ثبت تصمیم.");
    }
  }

  async function onRequestChairPerm() {
    try {
      setChairPerm(await requestChairPermission());
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ارسال درخواست.");
    }
  }

  const tasks = useMemo(() => result?.tasks ?? [], [result?.tasks]);
  const normalizedQuery = query.trim().toLocaleLowerCase("fa");
  const filteredTasks = useMemo(
    () =>
      normalizedQuery
        ? tasks.filter((task) =>
            [
              task.title,
              task.description,
              task.senderLabelFa,
              task.sender?.fullName,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value).toLocaleLowerCase("fa").includes(normalizedQuery),
              ),
          )
        : tasks,
    [normalizedQuery, tasks],
  );
  const tasksPager = usePagination(filteredTasks);
  const filterLabel = category
    ? (CATEGORY_CARDS.find((c) => c.key === category)?.label ?? "")
    : "";

  const shellClass = dark ? "px-[21px] pb-[34px] pt-[18px]" : "p-8";
  const emptyText = query.trim()
    ? "موردی با این جستجو یافت نشد."
    : category || filterDate
      ? "موردی با این فیلتر یافت نشد."
      : "کارتابل خالی است ✓";

  return (
    <div className={shellClass}>
      <InternalCartableDashboard
        description="گردش کارهای سازمانی و پیام‌های داخلی در انتظار اقدام شما"
        query={query}
        onQueryChange={setQuery}
        cards={STATUS_FILTERS.map((item) => ({
          key: item.key,
          label: item.label,
          count:
            result?.statusCounts?.[item.key] ??
            (item.key === "OPEN" ? (result?.totalOpen ?? 0) : 0),
          tone:
            item.key === "OPEN"
              ? "amber"
              : item.key === "APPROVED"
                ? "green"
                : item.key === "REJECTED"
                  ? "red"
                  : "blue",
          selected: status === item.key,
          onSelect: () => setStatus(item.key),
        }))}
      />

      {error && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark
              ? "bg-[rgba(248,113,113,.12)] text-[#f87171]"
              : "bg-danger/10 text-danger"
          }`}
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark
              ? "bg-[rgba(52,211,153,.12)] text-[#34d399]"
              : "bg-[#10b98115] text-[#059669]"
          }`}
        >
          {notice}
        </p>
      )}

      {hasChairGate && (
        <section className="mb-6 rounded-xl border border-[#f59e0b40] bg-[#f59e0b0d] p-5">
          <h2 className="text-sm font-bold text-[#92400e]">
            ارجاع و ارسال گزارش به رئیس هیئت مدیره
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[#92400e]/80">
            دسترسی کامل کارتابل و ارجاعات مخصوص مدیر ارشد و مدیر عامل است؛ ارسال
            گزارش به رئیس هیئت مدیره نیازمند مجوز ایشان است.
          </p>
          <div className="mt-3">
            {chairPerm?.status === "APPROVED" ? (
              <span className="rounded-full bg-[#34d39924] px-3 py-1.5 text-xs font-bold text-[#34d399]">
                مجوز تأیید شد ✓
              </span>
            ) : chairPerm?.status === "PENDING" ? (
              <span className="rounded-full bg-[#f59e0b24] px-3 py-1.5 text-xs font-bold text-[#b45309]">
                درخواست ارسال شد — در انتظار تأیید
              </span>
            ) : (
              <button
                onClick={() => void onRequestChairPerm()}
                className="rounded-lg bg-[#b45309] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#92400e]"
              >
                درخواست مجوز از رئیس هیئت مدیره
              </button>
            )}
          </div>
        </section>
      )}

      <div className={`mb-[15px] grid grid-cols-1 gap-[13px] sm:grid-cols-3`}>
        {CATEGORY_CARDS.map((c) => {
          const on = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(on ? null : c.key)}
              className={`flex items-center gap-[11px] rounded-[14px] border p-3.5 text-start transition ${
                dark
                  ? on
                    ? "border-[#3b82f6] bg-[rgba(59,130,246,.12)]"
                    : "border-[#1f2a3d] bg-[#141d2e] hover:border-[#28344c]"
                  : on
                    ? "border-accent bg-accent/5"
                    : "border-border bg-white hover:border-accent/40"
              }`}
            >
              <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl"
                style={{ background: c.iconBg, color: c.iconColor }}
              >
                {c.icon}
              </span>
              <div className="leading-snug">
                {dark ? (
                  <div className="font-num text-[15px] font-extrabold text-white">
                    {faDigits(result?.counts[c.key] ?? 0)} {c.label}
                  </div>
                ) : (
                  <>
                    <div className="font-num text-[23.5px] font-black text-ink">
                      {faDigits(result?.counts[c.key] ?? 0)}
                    </div>
                    <div className="text-[11.5px] text-muted">{c.label}</div>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className={
          dark
            ? "overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]"
            : "overflow-hidden rounded-xl border border-border bg-white"
        }
      >
        <div
          className={`flex flex-wrap items-center gap-2.5 px-4 py-[11px] ${
            dark ? "border-b border-[#1f2a3d]" : "border-b border-border"
          }`}
        >
          <h2
            className={`m-0 text-[14.5px] font-extrabold ${dark ? "text-white" : "text-ink"}`}
          >
            کارتابل من
          </h2>
          {category && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                dark
                  ? "bg-[rgba(59,130,246,.14)] text-[#60a5fa]"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {filterLabel}
              <button
                type="button"
                aria-label="پاک کردن فیلتر دسته"
                onClick={() => setCategory(null)}
                className="font-black"
              >
                ✕
              </button>
            </span>
          )}
          <div className="mr-auto flex flex-wrap items-center gap-[7px]">
            <span
              className={`flex items-center gap-1.5 text-[11.5px] ${dark ? "text-[#6b7b94]" : "text-muted"}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M3 9h18M8 2v4M16 2v4" />
              </svg>
              روز
            </span>
            <div
              className={
                dark
                  ? "rounded-[9px] border border-[#28344c] bg-[#18223a]"
                  : "min-w-[140px] rounded-lg border border-border bg-body"
              }
            >
              <JalaliDatePicker
                label={dark ? "" : "فیلتر روز"}
                value={filterDate}
                onChange={setFilterDate}
                placeholder="انتخاب تاریخ"
                testId="cartable-date-filter"
                theme={dark ? "dark" : "light"}
                compact={dark}
              />
            </div>
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate(null)}
                className={`text-[11px] font-bold ${dark ? "text-[#60a5fa]" : "text-accent"}`}
              >
                پاک‌کردن
              </button>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                dark
                  ? "bg-[rgba(248,113,113,.14)] text-[#f87171]"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {faDigits(
                result?.statusCounts?.[status] ??
                  (status === "OPEN" ? (result?.totalOpen ?? 0) : tasks.length),
              )}{" "}
              مورد
            </span>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-3 py-[7px] text-[11.5px] font-bold text-white transition hover:bg-[#2563eb]"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              ایجاد پیام
            </button>
          </div>
        </div>

        <div className={dark ? "px-2 py-1.5" : "p-3"}>
          {loading ? (
            <p
              className={`py-10 text-center text-sm ${dark ? "text-[#6b7b94]" : "text-muted"}`}
            >
              در حال بارگذاری…
            </p>
          ) : filteredTasks.length === 0 ? (
            <p
              className={`px-3 py-7 text-center text-xs ${dark ? "text-[#6b7b94]" : "text-muted"}`}
            >
              {emptyText}
            </p>
          ) : (
            <ul>
              {tasksPager.pageItems.map((t) => {
                const meta = CATEGORY_META[t.category];
                return (
                  <li
                    key={t.id}
                    className={`flex flex-wrap items-center justify-between gap-[11px] px-[11px] py-3 ${
                      dark
                        ? "border-b border-[#1a2436]"
                        : "mb-2 rounded-xl border border-border bg-body/40 px-4"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-[11px]">
                      <span
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px]"
                        style={{
                          background: meta.iconBg,
                          color: meta.iconColor,
                        }}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0 leading-relaxed">
                        <div className="flex flex-wrap items-center gap-[7px]">
                          <span
                            className={`text-[12.5px] font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`}
                          >
                            {t.title}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              color: meta.tagColor,
                              background: meta.tagBg,
                            }}
                          >
                            {meta.badge}
                          </span>
                        </div>
                        <div
                          className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${
                            dark ? "text-[#6b7b94]" : "text-muted"
                          }`}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            aria-hidden
                          >
                            <circle cx="12" cy="8" r="3.5" />
                            <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
                          </svg>
                          ارسال از:{" "}
                          {t.senderLabelFa ?? t.sender?.fullName ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`font-num text-[11px] ${dark ? "text-[#6b7b94]" : "text-muted"}`}
                      >
                        {formatJalaliDateTime(t.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openReview(t)}
                        className="flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-3 py-[7px] text-[11.5px] font-bold text-white transition hover:bg-[#2563eb]"
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="M21 21l-4-4" />
                        </svg>
                        {t.status === "OPEN" ? "بررسی" : "مشاهده"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            page={tasksPager.page}
            totalPages={tasksPager.totalPages}
            onChange={tasksPager.setPage}
            variant={dark ? "dark" : "light"}
          />
        </div>
      </div>

      {composeOpen && (
        <ComposeMessageModal
          theme={dark ? "dark" : "light"}
          onClose={() => setComposeOpen(false)}
          onSent={(label) => setNotice(`پیام به «${label}» ارسال شد`)}
        />
      )}

      {reviewTask && (
        <Modal
          title="بررسی درخواست"
          onClose={() => setReviewTask(null)}
          variant={dark ? "dark" : "light"}
          maxWidthClass="max-w-lg"
        >
          <div className="mb-3">
            <div
              className={`text-sm font-bold ${dark ? "text-white" : "text-ink"}`}
            >
              {reviewTask.title}
            </div>
            <p
              className={`mt-1 text-xs leading-relaxed ${dark ? "text-[#9fb0c7]" : "text-text-2"}`}
            >
              {reviewTask.description}
            </p>
            {reviewTask.attachments?.length ? (
              <AttachmentList attachments={reviewTask.attachments} />
            ) : null}
          </div>
          <div
            className={`mb-4 rounded-lg p-3 ${dark ? "bg-[#18223a]" : "bg-surface"}`}
          >
            <div
              className={`text-[10px] ${dark ? "text-[#6b7b94]" : "text-muted"}`}
            >
              ارسال‌کننده‌ی درخواست
            </div>
            <div
              className={`mt-0.5 text-xs font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`}
            >
              {reviewTask.senderLabelFa ?? reviewTask.sender?.fullName ?? "—"}
            </div>
          </div>

          <div className="mb-4">
            <ConversationHistory
              title="تاریخچه پیام‌ها و اقدامات"
              dark={dark}
              items={(reviewTask.history?.length
                ? reviewTask.history
                : [
                    {
                      id: `created-${reviewTask.id}`,
                      action: "ثبت و ارسال پیام",
                      detail: reviewTask.description,
                      actorLabel:
                        reviewTask.senderLabelFa ??
                        reviewTask.sender?.fullName ??
                        null,
                      actorRole: reviewTask.sender?.role ?? null,
                      createdAt: reviewTask.createdAt,
                    },
                  ]
              ).map((entry, index) => ({
                id: entry.id,
                title: entry.action,
                body: entry.detail,
                actor: entry.actorLabel,
                createdAt: entry.createdAt,
                attachments: entry.attachments,
                side: index % 2 === 0 ? "sender" : "recipient",
              }))}
            />
          </div>

          {reviewTask.status === "OPEN" &&
          (reviewTask.sourceType === "MANAGER_MESSAGE" ||
            reviewTask.sourceType === "EMPLOYEE_MESSAGE") ? (
            <>
              <label
                className={`mb-1 block text-xs font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`}
                htmlFor="internal-reply"
              >
                پاسخ شما *
              </label>
              <textarea
                id="internal-reply"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="پاسخ خود را بنویسید…"
                rows={4}
                className={
                  dark
                    ? "w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
                    : "w-full rounded-lg border border-border p-3 text-xs outline-none transition focus:border-accent"
                }
              />
              <div className="mt-3">
                <AttachmentPicker
                  value={replyAttachments}
                  onChange={setReplyAttachments}
                />
              </div>
              {reviewError && (
                <p
                  role="alert"
                  className={`mt-2 text-xs ${dark ? "text-[#f87171]" : "text-danger"}`}
                >
                  {reviewError}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void onReply()}
                  className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2563eb]"
                >
                  ارسال پاسخ
                </button>
              </div>
            </>
          ) : reviewTask.status === "OPEN" ? (
            <>
              <label
                className={`mb-1 block text-xs font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`}
                htmlFor="review-note"
              >
                نظر مدیر *
              </label>
              <textarea
                id="review-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="توضیح یا دلیل تصمیم خود را بنویسید…"
                rows={3}
                className={
                  dark
                    ? "w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
                    : "w-full rounded-lg border border-border p-3 text-xs outline-none transition focus:border-accent"
                }
              />

              <label
                className={`mb-1 mt-3 block text-xs font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`}
                htmlFor="review-transfer"
              >
                انتقال به مدیر دیگر (اختیاری)
              </label>
              <select
                id="review-transfer"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className={
                  dark
                    ? "w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                    : "w-full rounded-lg border border-border bg-white p-3 text-xs outline-none transition focus:border-accent"
                }
              >
                <option value="">— انتخاب مدیر —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} — {s.roleLabelFa}
                  </option>
                ))}
              </select>

              {reviewError && (
                <p
                  role="alert"
                  className={`mt-2 text-xs ${dark ? "text-[#f87171]" : "text-danger"}`}
                >
                  {reviewError}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => void onDecide("transfer")}
                  disabled={!transferTo}
                  className={`rounded-lg border px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    dark
                      ? "border-[#3b82f6]/50 text-[#60a5fa] hover:bg-[rgba(59,130,246,.12)]"
                      : "border-accent/40 text-accent hover:bg-accent/5"
                  }`}
                >
                  انتقال
                </button>
                <button
                  onClick={() => void onDecide("reject")}
                  className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white transition hover:bg-danger/90"
                >
                  انصراف
                </button>
                <button
                  onClick={() => void onDecide("approve")}
                  className="rounded-lg bg-[#34d399] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2bb583]"
                >
                  تأیید
                </button>
              </div>
            </>
          ) : (
            <div
              className={`rounded-lg border p-3 text-xs ${dark ? "border-[#28344c] bg-[#18223a] text-[#9fb0c7]" : "border-border bg-surface text-text-2"}`}
            >
              این مورد با وضعیت «
              {STATUS_FILTERS.find((item) => item.key === reviewTask.status)
                ?.label ?? reviewTask.status}
              » ثبت شده و فقط برای مشاهده تاریخچه نمایش داده می‌شود.
              {reviewTask.resolutionNote ? (
                <p className="mt-2 font-bold">
                  نتیجه: {reviewTask.resolutionNote}
                </p>
              ) : null}
            </div>
          )}
          {(reviewTask.sourceType === "MANAGER_MESSAGE" ||
            reviewTask.sourceType === "EMPLOYEE_MESSAGE") &&
          reviewTask.conversationId ? (
            <div className={`mt-4 flex justify-end border-t pt-4 ${dark ? "border-[#28344c]" : "border-border"}`}>
              <button
                type="button"
                onClick={() => void onCloseConversation()}
                className={`rounded-lg border px-4 py-2 text-xs font-bold transition ${
                  dark
                    ? "border-[#ef4444]/60 text-[#f87171] hover:bg-[#450a0a]/30"
                    : "border-danger/50 text-danger hover:bg-danger/5"
                }`}
              >
                بستن پیام
              </button>
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
