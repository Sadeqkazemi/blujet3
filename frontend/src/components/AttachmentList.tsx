import { useEffect, useState } from 'react';
import { downloadFile, fetchFileBlob } from '../api/files';
import type { ReferralAttachment } from '../types/cartable';

interface AttachmentListProps {
  attachments: ReferralAttachment[];
  /** Matches the design's two read-only chip stylings: neutral for a
   * referral's own attachments, success (green) for a report's. */
  variant?: 'neutral' | 'success';
}

export default function AttachmentList({ attachments, variant = 'neutral' }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  const chipClass =
    variant === 'success'
      ? 'bg-[#10b98115] text-[#059669]'
      : 'border border-border bg-surface text-text-2';

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {attachments.map((f) =>
        f.mimeType?.startsWith('image/') ? (
          <ImageAttachment key={f.id} file={f} className={chipClass} />
        ) : (
          <button
            key={f.id}
            type="button"
            aria-label={f.fileName}
            onClick={() => void downloadFile(f.id, f.fileName)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-80 ${chipClass}`}
          >
            <span aria-hidden="true">📎</span>
            <span>{f.fileName}</span>
          </button>
        ),
      )}
    </div>
  );
}

function ImageAttachment({ file, className }: { file: ReferralAttachment; className: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    let cancelled = false;
    void fetchFileBlob(file.id)
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setUrl(currentUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [file.id]);

  return (
    <button
      type="button"
      aria-label={file.fileName}
      onClick={() => void downloadFile(file.id, file.fileName)}
      className={`overflow-hidden rounded-lg p-1.5 text-[11px] font-bold transition hover:opacity-80 ${className}`}
    >
      {url ? <img src={url} alt={file.fileName} className="h-24 w-32 rounded-md object-cover" /> : <span>🖼 {file.fileName}</span>}
      {url && <span className="mt-1 block max-w-32 truncate px-1">{file.fileName}</span>}
    </button>
  );
}
