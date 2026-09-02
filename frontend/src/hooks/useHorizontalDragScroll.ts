import { useCallback, useEffect, useState, type RefCallback } from 'react';

/**
 * Makes an overflow-x strip scrollable by pointer drag (mouse + touch) and
 * vertical-wheel → horizontal. Native overflow alone often fails when the
 * strip is full of `<button>` children (common on the home page).
 *
 * Uses a callback ref so listeners attach even when the strip mounts later
 * (e.g. popular destinations after the home API responds).
 *
 * Chromium RTL uses a negative `scrollLeft` range — drag/wheel deltas are
 * inverted relative to LTR so content still follows the pointer.
 */
export function useHorizontalDragScroll<T extends HTMLElement>(
  enabled: boolean,
): RefCallback<T> {
  const [node, setNode] = useState<T | null>(null);

  const ref = useCallback<RefCallback<T>>((el) => {
    setNode(el);
  }, []);

  useEffect(() => {
    const el = node;
    if (!enabled || !el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    const isRtl = () => getComputedStyle(el).direction === 'rtl';

    const applyDrag = (dx: number) => {
      // Content follows the finger: LTR subtracts dx; RTL (negative
      // scrollLeft) adds dx.
      el.scrollLeft = isRtl() ? startScroll + dx : startScroll - dx;
    };

    const applyWheel = (delta: number) => {
      el.scrollLeft += isRtl() ? -delta : delta;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = el.scrollLeft;
      dragged = false;
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* ignore unsupported capture */
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 5) dragged = true;
      if (!dragged) return;
      applyDrag(dx);
      event.preventDefault();
    };

    const endPointer = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      if (!dragged) return;
      const blockClick = (clickEvent: Event) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        el.removeEventListener('click', blockClick, true);
      };
      el.addEventListener('click', blockClick, true);
    };

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const mostlyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      if (!mostlyVertical && event.deltaX === 0) return;
      const delta = mostlyVertical ? event.deltaY : event.deltaX;
      if (delta === 0) return;
      applyWheel(delta);
      event.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('wheel', onWheel);
    };
  }, [enabled, node]);

  return ref;
}
