import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSocialLinks } from './useSocialLinks';
import * as settingsApi from '../api/settings';

describe('useSocialLinks', () => {
  it('returns enabled links from the public settings endpoint', async () => {
    vi.spyOn(settingsApi, 'fetchPublicSocialLinks').mockResolvedValue({
      links: [{ id: 'telegram', name: 'تلگرام', url: 'https://t.me/blujet' }],
    });

    const { result } = renderHook(() => useSocialLinks());
    expect(result.current).toEqual([]);

    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 'telegram', name: 'تلگرام', url: 'https://t.me/blujet' },
      ]),
    );
  });

  it('stays empty when the fetch fails', async () => {
    vi.spyOn(settingsApi, 'fetchPublicSocialLinks').mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useSocialLinks());
    await waitFor(() => expect(settingsApi.fetchPublicSocialLinks).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
