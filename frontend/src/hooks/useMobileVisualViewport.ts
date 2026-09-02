import { useEffect, useState } from 'react';

export type MobileVisualViewport = {
  bottomInset: number;
  offsetLeft: number;
  offsetTop: number;
  visibleHeight: number;
  visibleWidth: number;
};

function readViewport(): MobileVisualViewport {
  const viewport = window.visualViewport;
  if (!viewport) {
    return {
      bottomInset: 0,
      offsetLeft: 0,
      offsetTop: 0,
      visibleHeight: window.innerHeight,
      visibleWidth: window.innerWidth,
    };
  }

  const visibleBottom = viewport.offsetTop + viewport.height;
  return {
    bottomInset: Math.max(0, Math.round(window.innerHeight - visibleBottom)),
    offsetLeft: Math.max(0, Math.round(viewport.offsetLeft)),
    offsetTop: Math.max(0, Math.round(viewport.offsetTop)),
    visibleHeight: Math.max(0, Math.round(viewport.height)),
    visibleWidth: Math.max(0, Math.round(viewport.width)),
  };
}

/**
 * Tracks the part of the mobile page that remains visible while the virtual
 * keyboard is open. `100vh`/`100dvh` are not reliable for fixed bottom sheets
 * on older iOS Safari versions, while VisualViewport reports the real space.
 */
export function useMobileVisualViewport(enabled: boolean): MobileVisualViewport | null {
  const [metrics, setMetrics] = useState<MobileVisualViewport | null>(() =>
    enabled ? readViewport() : null,
  );

  useEffect(() => {
    if (!enabled) {
      setMetrics(null);
      return;
    }

    const viewport = window.visualViewport;
    const update = () => setMetrics(readViewport());
    update();

    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return metrics;
}
