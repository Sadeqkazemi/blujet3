import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobileVisualViewport } from './useMobileVisualViewport';

type MutableVisualViewport = EventTarget & {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMobileVisualViewport', () => {
  it('lifts a mobile bottom sheet above the virtual keyboard', () => {
    const viewport = new EventTarget() as MutableVisualViewport;
    viewport.height = 800;
    viewport.width = 390;
    viewport.offsetTop = 0;
    viewport.offsetLeft = 0;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

    const { result } = renderHook(() => useMobileVisualViewport(true));
    expect(result.current).toEqual({
      bottomInset: 0,
      offsetLeft: 0,
      offsetTop: 0,
      visibleHeight: 800,
      visibleWidth: 390,
    });

    act(() => {
      viewport.height = 458;
      viewport.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toEqual({
      bottomInset: 342,
      offsetLeft: 0,
      offsetTop: 0,
      visibleHeight: 458,
      visibleWidth: 390,
    });
  });

  it('does not subscribe outside the mobile picker', () => {
    const viewport = new EventTarget() as MutableVisualViewport;
    viewport.height = 400;
    viewport.width = 390;
    viewport.offsetTop = 0;
    viewport.offsetLeft = 0;
    const addSpy = vi.spyOn(viewport, 'addEventListener');
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });

    const { result } = renderHook(() => useMobileVisualViewport(false));

    expect(result.current).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });
});
