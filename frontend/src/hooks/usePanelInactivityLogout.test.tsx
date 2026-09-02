import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePanelInactivityLogout } from './usePanelInactivityLogout';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePanelInactivityLogout', () => {
  it('logs a panel user out after exactly ten inactive minutes', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    renderHook(() => usePanelInactivityLogout({ enabled: true, onTimeout }));

    act(() => vi.advanceTimersByTime(599_999));
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('restarts the ten-minute window after panel activity', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    renderHook(() => usePanelInactivityLogout({ enabled: true, onTimeout }));

    act(() => vi.advanceTimersByTime(8 * 60_000));
    act(() => window.dispatchEvent(new MouseEvent('mousemove')));
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(8 * 60_000));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('stays disabled when there is no authenticated panel session', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    renderHook(() => usePanelInactivityLogout({ enabled: false, onTimeout }));

    act(() => vi.advanceTimersByTime(20 * 60_000));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
