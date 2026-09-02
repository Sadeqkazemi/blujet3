import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveCartableTask,
  fetchCartable,
  fetchCartableTask,
  fetchManagerRecipients,
  fetchSentManagerMessages,
  sendEmployeeManagerMessage,
  replyCartableMessage,
  closeCartableConversation,
} from "../../api/cartable";
import { faDigits } from "../../lib/fa-format";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { formatJalaliDateTime } from "../../lib/jalali";
import { fetchEmployeeContext } from "../../api/panels";
import type {
  CartableListResult,
  CartableTask,
  EmployeeManagerRecipient,
  SentEmployeeManagerMessage,
  ReferralAttachment,
  CartableStatus,
} from "../../types/cartable";
import AttachmentPicker from "../../components/AttachmentPicker";
import ConversationHistory from "../../components/ConversationHistory";
import InternalCartableDashboard from "./InternalCartableDashboard";
import Modal from "../../components/Modal";
import AttachmentList from "../../components/AttachmentList";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

export default function EmployeeCartablePage() {
  const [result, setResult] = useState<CartableListResult | null>(null);
  const [recipients, setRecipients] = useState<EmployeeManagerRecipient[]>([]);
  const [sent, setSent] = useState<SentEmployeeManagerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canProcess, setCanProcess] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CartableStatus>("OPEN");

  const [msgTo, setMsgTo] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [msgAttachments, setMsgAttachments] = useState<ReferralAttachment[]>(
    [],
  );
  const [reviewTask, setReviewTask] = useState<CartableTask | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<
    ReferralAttachment[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cartable, context] = await Promise.all([
        fetchCartable({ status: statusFilter }),
        fetchEmployeeContext(),
      ]);
      setResult(cartable);
      const mayProcess = context.permissionKeys.includes("ct_process");
      setCanProcess(mayProcess);
      if (mayProcess) {
        try {
          const [mgrs, sentMsgs] = await Promise.all([
            fetchManagerRecipients(),
            fetchSentManagerMessages(),
          ]);
          setRecipients(mgrs);
          setSent(sentMsgs);
        } catch {
          setRecipients([]);
          setSent([]);
        }
      } else {
        setRecipients([]);
        setSent([]);
      }
    } catch {
      setError("خطا در دریافت کارتابل.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDone(task: CartableTask) {
    try {
      await approveCartableTask(task.id, "انجام شد");
      setNotice("کار تکمیل شد ✓");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت انجام کار.");
    }
  }

  async function openTask(task: CartableTask) {
    setReviewTask(task);
    setReplyText("");
    setReplyAttachments([]);
    try {
      setReviewTask(await fetchCartableTask(task.id));
    } catch {
      // The list payload still supports completing non-message work.
    }
  }

  async function onReply() {
    if (!reviewTask || !replyText.trim()) {
      setError("متن پاسخ را وارد کنید.");
      return;
    }
    try {
      const taskId = reviewTask.id;
      await replyCartableMessage(
        reviewTask.id,
        replyText.trim(),
        replyAttachments.map((file) => file.id),
      );
      setNotice("پاسخ ارسال شد ✓");
      setReplyText("");
      setReplyAttachments([]);
      setReviewTask(await fetchCartableTask(taskId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ارسال پاسخ.");
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
      setError(e instanceof Error ? e.message : "خطا در بستن پیام.");
    }
  }

  async function onSendMessage() {
    if (!msgTo.trim()) {
      setError("گیرندهٔ پیام را انتخاب کنید");
      return;
    }
    if (!msgText.trim()) {
      setError("متن پیام را بنویسید");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmployeeManagerMessage({
        toId: msgTo,
        body: msgText.trim(),
        attachmentIds: msgAttachments.map((file) => file.id),
      });
      const target = recipients.find((r) => r.id === msgTo);
      setNotice(`پیام به ${target?.fullName ?? "همکار"} ارسال شد ✓`);
      setMsgTo("");
      setMsgText("");
      setMsgAttachments([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ارسال پیام.");
    } finally {
      setSending(false);
    }
  }

  const tasks = useMemo(() => result?.tasks ?? [], [result?.tasks]);
  const normalizedQuery = query.trim().toLocaleLowerCase("fa");
  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesQuery =
          !normalizedQuery ||
          [
            task.title,
            task.description,
            task.senderLabelFa,
            task.sender?.fullName,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase("fa").includes(normalizedQuery),
            );
        return matchesQuery;
      }),
    [normalizedQuery, tasks],
  );
  const tasksPager = usePagination(filteredTasks);
  const canSend = msgTo && msgText.trim().length > 0;

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <InternalCartableDashboard
        description="کارها و پیام‌های داخلی ارجاع‌شده به شما"
        query={query}
        onQueryChange={setQuery}
        cards={[
          {
            key: "OPEN",
            label: "کارهای باز",
            count: result?.statusCounts?.OPEN ?? result?.totalOpen ?? 0,
            tone: "amber",
            selected: statusFilter === "OPEN",
            onSelect: () => setStatusFilter("OPEN"),
          },
          {
            key: "APPROVED",
            label: "تکمیل‌شده",
            count: result?.statusCounts?.APPROVED ?? 0,
            tone: "green",
            selected: statusFilter === "APPROVED",
            onSelect: () => setStatusFilter("APPROVED"),
          },
          {
            key: "REJECTED",
            label: "ردشده",
            count: result?.statusCounts?.REJECTED ?? 0,
            tone: "red",
            selected: statusFilter === "REJECTED",
            onSelect: () => setStatusFilter("REJECTED"),
          },
          {
            key: "TRANSFERRED",
            label: "منتقل‌شده",
            count: result?.statusCounts?.TRANSFERRED ?? 0,
            tone: "blue",
            selected: statusFilter === "TRANSFERRED",
            onSelect: () => setStatusFilter("TRANSFERRED"),
          },
        ]}
      />

      {error && (
        <p className="mb-4 rounded-[12px] border border-[#7f1d1d] bg-[#450a0a]/60 p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-[12px] border border-[#14532d] bg-[rgba(16,185,129,.12)] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      {canProcess && (
        <section className="mb-5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">
            ارسال پیام داخلی
          </h2>
          <p className="mt-1 text-[11px] text-[#6b7b94]">
            می‌توانید به هر مدیر یا کارمند فعال پیام بدهید.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.7fr_auto] md:items-end">
            <div>
              <label
                className="mb-1 block text-[10px] text-[#6b7b94]"
                htmlFor="msg-to"
              >
                گیرنده
              </label>
              <select
                id="msg-to"
                value={msgTo}
                onChange={(e) => setMsgTo(e.target.value)}
                className="w-full rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 py-2.5 text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
              >
                <option value="">انتخاب همکار…</option>
                {recipients.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                    {m.isOwnManager ? " (مدیر شما)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="mb-1 block text-[10px] text-[#6b7b94]"
                htmlFor="msg-text"
              >
                متن پیام
              </label>
              <input
                id="msg-text"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="پیام خود را بنویسید…"
                className="w-full rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 py-2.5 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
            </div>
            <button
              type="button"
              disabled={!canSend || sending}
              onClick={() => void onSendMessage()}
              className={`rounded-[10px] px-4 py-2.5 text-xs font-bold transition ${
                canSend
                  ? "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                  : "cursor-not-allowed bg-[#18223a] text-[#6b7b94]"
              }`}
            >
              ارسال
            </button>
          </div>

          <div className="mt-3">
            <AttachmentPicker
              value={msgAttachments}
              onChange={setMsgAttachments}
              disabled={sending}
            />
          </div>

          {sent.length > 0 && (
            <div className="mt-4 border-t border-[#1f2a3d] pt-3">
              <ConversationHistory
                title="تاریخچه پیام‌های ارسالی"
                items={sent.map((message) => ({
                  id: message.id,
                  title: `ارسال به ${message.toName}`,
                  body: message.body,
                  actor: message.toName,
                  createdAt: message.createdAt,
                  attachments: message.attachments,
                  side: "sender",
                }))}
              />
            </div>
          )}
        </section>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[#6b7b94]">
          در حال بارگذاری…
        </p>
      ) : filteredTasks.length === 0 ? (
        <p className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] py-10 text-center text-sm text-[#6b7b94]">
          {query.trim()
            ? "موردی با این جستجو یافت نشد."
            : statusFilter !== "OPEN"
              ? "موردی با این وضعیت یافت نشد."
              : "کار بازی در کارتابل شما نیست."}
        </p>
      ) : (
        <ul className="space-y-3">
          {tasksPager.pageItems.map((t) => {
            const fromName = t.senderLabelFa ?? t.sender?.fullName ?? "—";
            const done = t.status !== "OPEN";
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-3 rounded-[14px] border bg-[#141d2e] p-4 ${
                  done ? "border-[#1f3d2f]" : "border-[#1f2a3d]"
                }`}
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[rgba(59,130,246,.16)] text-sm font-bold text-[#60a5fa]">
                  {initials(fromName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[#e7ecf3]">
                    {t.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[#6b7b94]">
                    <span>{formatJalaliDateTime(t.createdAt)}</span>
                    <span>از {fromName}</span>
                  </div>
                </div>
                {!done &&
                canProcess &&
                (t.sourceType === "MANAGER_MESSAGE" ||
                  t.sourceType === "EMPLOYEE_MESSAGE") ? (
                  <button
                    type="button"
                    onClick={() => void openTask(t)}
                    className="rounded-[10px] bg-[#3b82f6] px-3.5 py-2 text-[11px] font-bold text-white transition hover:bg-[#2563eb]"
                  >
                    پاسخ
                  </button>
                ) : !done && canProcess ? (
                  <button
                    type="button"
                    onClick={() => void onDone(t)}
                    className="rounded-[10px] bg-[#16a34a] px-3.5 py-2 text-[11px] font-bold text-white transition hover:bg-[#15803d]"
                  >
                    انجام شد ✓
                  </button>
                ) : done ? (
                  <button
                    type="button"
                    onClick={() => void openTask(t)}
                    className="text-[11px] font-bold text-[#34d399]"
                  >
                    مشاهده تاریخچه
                  </button>
                ) : (
                  <span className="text-[11px] font-bold text-[#9fb0c7]">
                    فقط مشاهده
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={tasksPager.page}
        totalPages={tasksPager.totalPages}
        onChange={tasksPager.setPage}
        variant="dark"
      />

      {result && result.totalOpen > 0 && (
        <p className="mt-4 text-center text-[11px] text-[#6b7b94]">
          {faDigits(result.totalOpen)} کار باز
        </p>
      )}

      {reviewTask && (
        <Modal
          title={
            reviewTask.status === "OPEN"
              ? "پاسخ به پیام داخلی"
              : "تاریخچه پیام داخلی"
          }
          onClose={() => setReviewTask(null)}
          variant="dark"
          maxWidthClass="max-w-lg"
        >
          <ConversationHistory
            title="تاریخچه پیام‌ها"
            dark
            items={(reviewTask.history ?? []).map((entry, index) => ({
              id: entry.id,
              title: entry.action,
              body: entry.detail,
              actor: entry.actorLabel,
              createdAt: entry.createdAt,
              attachments: entry.attachments,
              side: index % 2 === 0 ? "sender" : "recipient",
            }))}
          />
          {reviewTask.attachments?.length ? (
            <AttachmentList attachments={reviewTask.attachments} />
          ) : null}
          {reviewTask.status === "OPEN" &&
          (reviewTask.sourceType === "MANAGER_MESSAGE" ||
            reviewTask.sourceType === "EMPLOYEE_MESSAGE") ? (
            <div className="mt-4">
              <label
                className="mb-1 block text-xs font-bold text-[#e7ecf3]"
                htmlFor="employee-reply"
              >
                پاسخ شما *
              </label>
              <textarea
                id="employee-reply"
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                rows={4}
                placeholder="پاسخ خود را بنویسید…"
                className="w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
              <div className="mt-3">
                <AttachmentPicker
                  value={replyAttachments}
                  onChange={setReplyAttachments}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void onReply()}
                  className="rounded-[10px] bg-[#3b82f6] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#2563eb]"
                >
                  ارسال پاسخ
                </button>
              </div>
            </div>
          ) : null}
          {(reviewTask.sourceType === "MANAGER_MESSAGE" ||
            reviewTask.sourceType === "EMPLOYEE_MESSAGE") &&
          reviewTask.conversationId ? (
            <div className="mt-4 flex justify-end border-t border-[#28344c] pt-4">
              <button
                type="button"
                onClick={() => void onCloseConversation()}
                className="rounded-[10px] border border-[#ef4444]/60 px-4 py-2.5 text-xs font-bold text-[#f87171] hover:bg-[#450a0a]/30"
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
