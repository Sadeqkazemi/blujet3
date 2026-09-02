import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHorizontalDragScroll } from './useHorizontalDragScroll';

describe('useHorizontalDragScroll', () => {
  it('returns a callback ref', () => {
    const { result } = renderHook(() => useHorizontalDragScroll(true));
    expect(typeof result.current).toBe('function');
  });
});
