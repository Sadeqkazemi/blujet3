import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '../../api/settings';
import type { SiteRules } from '../../types/site-pages';
import SiteRulesPage from './SiteRulesPage';

const RULES: SiteRules = {
  categories: [
    ['purchase', 'خرید', 'متن خرید'],
    ['refund', 'استرداد', 'متن استرداد'],
    ['change', 'تغییر', 'متن تغییر'],
    ['baggage', 'بار', 'متن بار'],
    ['club', 'باشگاه', 'متن باشگاه'],
    ['privacy', 'حریم خصوصی', 'متن حریم خصوصی'],
    ['pets', 'حمل حیوان خانگی', 'متن حیوان'],
  ].map(([id, title, text]) => ({ id, title, text })) as SiteRules['categories'],
};

afterEach(() => vi.restoreAllMocks());

describe('SiteRulesPage', () => {
  it('loads all seven real categories and saves edited copy', async () => {
    vi.spyOn(settingsApi, 'fetchSiteRules').mockResolvedValue(RULES);
    const update = vi.spyOn(settingsApi, 'updateSiteRules').mockImplementation(async (input) => input);
    render(<SiteRulesPage />);

    expect(await screen.findByText('حمل حیوان خانگی')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(14);
    const title = screen.getByLabelText('عنوان ۱');
    await userEvent.clear(title);
    await userEvent.type(title, 'خرید و صدور بلیط');
    await userEvent.click(screen.getByRole('button', { name: 'ذخیره قوانین' }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({ id: 'purchase', title: 'خرید و صدور بلیط' }),
        ]),
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('منتشر شد');
  });
});
