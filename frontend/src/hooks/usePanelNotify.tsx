import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PanelNotifyTone = 'success' | 'error' | 'warning';

export interface PanelNotifyItem {
  id: string;
  message: string;
  tone: PanelNotifyTone;
}

interface PanelNotifyContextValue {
  items: PanelNotifyItem[];
  notify: (message: string, tone?: PanelNotifyTone) => void;
  dismiss: (id: string) => void;
}

const PanelNotifyContext = createContext<PanelNotifyContextValue | null>(null);

/** Shell-level toast host — reuses panel alert tones, not a parallel library. */
export function PanelNotifyProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PanelNotifyItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: PanelNotifyTone = 'success') => {
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((list) => [...list, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ items, notify, dismiss }), [items, notify, dismiss]);

  return (
    <PanelNotifyContext.Provider value={value}>
      {children}
      <div
        data-testid="panel-notify-host"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex w-[min(420px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            data-testid="panel-notify-toast"
            data-tone={item.tone}
            className={`pointer-events-auto rounded-[12px] border px-3.5 py-3 text-[12.5px] font-semibold shadow-lg ${
              item.tone === 'success'
                ? 'border-[rgba(52,211,153,.35)] bg-[#10241c] text-[#34d399]'
                : item.tone === 'warning'
                  ? 'border-[rgba(245,158,11,.35)] bg-[#2a1f0c] text-[#f59e0b]'
                  : 'border-[rgba(248,113,113,.35)] bg-[#2a1216] text-[#f87171]'
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </PanelNotifyContext.Provider>
  );
}

export function usePanelNotify(): PanelNotifyContextValue {
  const ctx = useContext(PanelNotifyContext);
  if (!ctx) {
    return {
      items: [],
      notify: () => undefined,
      dismiss: () => undefined,
    };
  }
  return ctx;
}
