import type { ReactNode } from 'react';
import { panelCard, panelMuted, panelTitle } from './panel-theme';

interface PanelModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Dark-themed modal for management panel pages. */
export default function PanelModal({ title, onClose, children, footer, wide }: PanelModalProps) {
  return (
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-[rgba(7,11,20,.72)] p-4 backdrop-blur-[3px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="panel-modal-title"
        className={`${panelCard} flex max-h-[90vh] w-full flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] ${wide ? 'max-w-[560px]' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#1f2a3d] px-4 py-3.5">
          <h2 id="panel-modal-title" className={`m-0 text-[15.5px] ${panelTitle}`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className={`text-lg leading-none ${panelMuted} transition hover:text-white`}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-[15px]">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[#1f2a3d] px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
