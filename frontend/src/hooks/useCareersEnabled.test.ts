import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCareersEnabled } from './useCareersEnabled';
import * as careersApi from '../api/careers';

describe('useCareersEnabled', () => {
  it('starts false, then reflects the fetched settings', async () => {
    vi.spyOn(careersApi, 'fetchCareersSettings').mockResolvedValue({ enabled: true });
    const { result } = renderHook(() => useCareersEnabled());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false when the fetch fails (never fabricate an enabled link)', async () => {
    vi.spyOn(careersApi, 'fetchCareersSettings').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useCareersEnabled());
    await waitFor(() => expect(careersApi.fetchCareersSettings).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
