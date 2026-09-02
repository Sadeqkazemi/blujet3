import { useRef, useState } from 'react';
import { uploadFile } from '../api/files';
import type { ReferralAttachment } from '../types/cartable';

interface AttachmentPickerProps {
  value: ReferralAttachment[];
  onChange: (files: ReferralAttachment[]) => void;
  disabled?: boolean;
  theme?: 'light' | 'dark';
}

export default function AttachmentPicker({ value, onChange, disabled, theme = 'light' }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setUploading(true);
    // Accumulate locally rather than reading the `value` prop between
    // awaits — its parent-state update from a prior onChange() call in
    // this same loop hasn't necessarily landed yet.
    let next = value;
    try {
      for (const file of Array.from(fileList)) {
        const uploaded = await uploadFile(file);
        next = [...next, { id: uploaded.id, fileName: uploaded.fileName, mimeType: file.type, sizeBytes: uploaded.sizeBytes }];
        onChange(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در بارگذاری فایل.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onRemove(id: string) {
    onChange(value.filter((f) => f.id !== id));
  }

  return (
    <div>
      <label className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed text-xs font-bold transition hover:border-accent hover:text-accent ${theme === 'dark' ? 'border-[#34435d] bg-[#101827] text-[#9fb0c7]' : 'border-border text-text-2'}`}>
        {uploading ? 'در حال بارگذاری…' : 'افزودن سند'}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          disabled={disabled || uploading}
          onChange={(e) => void onFilesSelected(e.target.files)}
          className="hidden"
        />
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-danger">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {value.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-[#10b98115] px-2.5 py-1.5 text-[11px] font-bold text-[#059669]"
            >
              <span className="truncate">{f.fileName}</span>
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                aria-label={`حذف ${f.fileName}`}
                className="flex-none text-[#059669]/70 hover:text-[#059669]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
