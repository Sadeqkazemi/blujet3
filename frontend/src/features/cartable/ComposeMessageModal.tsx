import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import {
  fetchStaffDirectory,
  sendDirectStaffMessage,
  sendManagerMessage,
} from "../../api/cartable";
import type {
  ManagerMessageDept,
  StaffDirectoryEntry,
} from "../../types/cartable";
import AttachmentPicker from "../../components/AttachmentPicker";
import type { ReferralAttachment } from "../../types/cartable";

const DEPT_OPTIONS: { value: ManagerMessageDept; label: string }[] = [
  { value: "FINANCE", label: "واحد مالی" },
  { value: "COMMERCIAL", label: "واحد بازرگانی" },
  { value: "SUPPORT", label: "واحد پشتیبانی" },
  { value: "AGENCIES", label: "واحد آژانس‌ها" },
  { value: "CEO", label: "مدیر عامل سامانه" },
  { value: "ALL_MANAGERS", label: "همه مدیران (اعلان عمومی)" },
];

interface Props {
  onClose: () => void;
  onSent: (label: string) => void;
  theme?: "light" | "dark";
}

export default function ComposeMessageModal({
  onClose,
  onSent,
  theme = "light",
}: Props) {
  const dark = theme === "dark";
  const [recipient, setRecipient] = useState("");
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ReferralAttachment[]>([]);

  const fieldClass = dark
    ? "w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
    : "w-full rounded-lg border border-border bg-white p-3 text-xs outline-none transition focus:border-accent";
  const labelClass = `mb-1 block text-xs font-bold ${dark ? "text-[#e7ecf3]" : "text-ink"}`;

  useEffect(() => {
    fetchStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  async function onSubmit() {
    if (!recipient || !subject.trim() || !body.trim()) {
      setError("گیرنده، موضوع و متن پیام الزامی است.");
      return;
    }
    try {
      const attachmentIds = attachments.map((file) => file.id);
      if (recipient.startsWith("staff:")) {
        const toId = recipient.slice("staff:".length);
        await sendDirectStaffMessage({
          toId,
          subject: subject.trim(),
          body: body.trim(),
          attachmentIds,
        });
        onSent(staff.find((row) => row.id === toId)?.fullName ?? "همکار");
      } else {
        const toDept = recipient.slice("dept:".length) as ManagerMessageDept;
        await sendManagerMessage({
          toDept,
          subject: subject.trim(),
          body: body.trim(),
          attachmentIds,
        });
        onSent(DEPT_OPTIONS.find((d) => d.value === toDept)?.label ?? toDept);
      }
      onClose();
    } catch {
      setError("خطا در ارسال پیام.");
    }
  }

  return (
    <Modal
      title="ایجاد پیام جدید"
      onClose={onClose}
      variant={dark ? "dark" : "light"}
    >
      <label className={labelClass} htmlFor="compose-dept">
        گیرنده
      </label>
      <select
        id="compose-dept"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className={fieldClass}
      >
        <option value="">انتخاب گیرنده…</option>
        <optgroup label="مدیران و کارمندان">
          {staff.map((person) => (
            <option key={person.id} value={`staff:${person.id}`}>
              {person.fullName} — {person.roleLabelFa}
            </option>
          ))}
        </optgroup>
        <optgroup label="ارسال سازمانی">
          {DEPT_OPTIONS.map((d) => (
            <option key={d.value} value={`dept:${d.value}`}>
              {d.label}
            </option>
          ))}
        </optgroup>
      </select>

      <label className={`${labelClass} mt-3`} htmlFor="compose-subject">
        موضوع
      </label>
      <input
        id="compose-subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="موضوع پیام…"
        className={fieldClass}
      />

      <label className={`${labelClass} mt-3`} htmlFor="compose-body">
        متن پیام
      </label>
      <textarea
        id="compose-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="متن پیام را بنویسید…"
        rows={4}
        className={fieldClass}
      />

      <div className="mt-3">
        <AttachmentPicker value={attachments} onChange={setAttachments} />
      </div>

      {error && (
        <p
          role="alert"
          className={`mt-2 text-xs ${dark ? "text-[#f87171]" : "text-danger"}`}
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className={
            dark
              ? "rounded-lg border border-[#28344c] px-4 py-2 text-xs font-bold text-[#9fb0c7]"
              : "rounded-lg bg-surface px-4 py-2 text-xs font-bold text-text-2"
          }
        >
          انصراف
        </button>
        <button
          onClick={() => void onSubmit()}
          className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2563eb]"
        >
          ارسال پیام
        </button>
      </div>
    </Modal>
  );
}
