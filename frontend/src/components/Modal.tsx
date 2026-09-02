import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Staff panels use the dark chrome by default. Pass "light" only for rare light surfaces. */
  variant?: 'dark' | 'light' | 'panel';
  /** Tailwind max-width class, default max-w-md */
  maxWidthClass?: string;
}

export default function Modal({
  title,
  onClose,
  children,
  variant = 'dark',
  maxWidthClass = 'max-w-md',
}: ModalProps) {
  const dark = variant === 'dark';
  const panel = variant === 'panel';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14]/72 p-4 backdrop-blur-[3px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          panel
            ? 'border-panel-border bg-panel-surface text-panel-ink'
            : dark
              ? 'border-[#2a3550] bg-[#141d2e]'
              : 'border-border bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex shrink-0 items-center justify-between border-b px-5 py-4 ${
            panel ? 'border-panel-border' : dark ? 'border-[#1f2a3d]' : 'border-border'
          }`}
        >
          <h3 className={`text-sm font-black ${panel ? 'text-panel-ink' : dark ? 'text-white' : 'text-ink'}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className={
              panel
                ? 'text-panel-muted transition hover:text-panel-ink'
                : dark
                ? 'text-[#9fb0c7] transition hover:text-white'
                : 'text-muted transition hover:text-ink'
            }
          >
            ✕
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto p-5 ${panel ? 'text-panel-ink' : dark ? 'text-[#e7ecf3]' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
