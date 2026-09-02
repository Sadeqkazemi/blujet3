import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ClubTierRulesPage from './ClubTierRulesPage';
import * as clubApi from '../../api/club';
import { ApiRequestError } from '../../api/envelope';
import type { ClubTierRules } from '../../types/club';

const RULES: ClubTierRules = {
  goldMinPoints: 5000,
  platinumMinPoints: 15000,
  cardRequestMinPoints: 5000,
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedByLabelFa: null,
  preview: [
    { tier: 'SILVER', minPoints: 0, maxPoints: 4999 },
    { tier: 'GOLD', minPoints: 5000, maxPoints: 14999 },
    { tier: 'PLATINUM', minPoints: 15000, maxPoints: null },
  ],
};

describe('ClubTierRulesPage', () => {
  it('renders the seeded thresholds and redesigned tier cards', async () => {
    vi.spyOn(clubApi, 'fetchClubTierRules').mockResolvedValue(RULES);
    render(<ClubTierRulesPage />);

    expect(await screen.findByTestId('ctr-gold')).toHaveValue('5000');
    expect(screen.getByTestId('ctr-platinum')).toHaveValue('15000');
    expect(screen.getByTestId('ctr-card')).toHaveValue('5000');
    expect(screen.getByText('طلایی')).toBeInTheDocument();
    expect(screen.getByText('پلاتین')).toBeInTheDocument();
    expect(screen.getAllByTestId('club-tier-card')).toHaveLength(3);
    expect(screen.getByTestId('club-tier-GOLD')).toHaveTextContent('۵٬۰۰۰');
  });

  it('shows a client-side validation error when gold >= platinum, without calling the API', async () => {
    vi.spyOn(clubApi, 'fetchClubTierRules').mockResolvedValue(RULES);
    const update = vi.spyOn(clubApi, 'updateClubTierRules');
    render(<ClubTierRulesPage />);
    await screen.findByTestId('ctr-gold');

    const user = userEvent.setup();
    await user.clear(screen.getByTestId('ctr-platinum'));
    await user.type(screen.getByTestId('ctr-platinum'), '4000');
    await user.click(screen.getByTestId('ctr-save'));

    expect(await screen.findByText('حد نصاب طلایی باید کمتر از حد نصاب پلاتین باشد.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('saves real changes and shows the success notice', async () => {
    vi.spyOn(clubApi, 'fetchClubTierRules').mockResolvedValue(RULES);
    const update = vi.spyOn(clubApi, 'updateClubTierRules').mockResolvedValue({
      ...RULES,
      goldMinPoints: 4000,
      preview: [
        { tier: 'SILVER', minPoints: 0, maxPoints: 3999 },
        { tier: 'GOLD', minPoints: 4000, maxPoints: 14999 },
        { tier: 'PLATINUM', minPoints: 15000, maxPoints: null },
      ],
    });
    render(<ClubTierRulesPage />);
    await screen.findByTestId('ctr-gold');

    const user = userEvent.setup();
    await user.clear(screen.getByTestId('ctr-gold'));
    await user.type(screen.getByTestId('ctr-gold'), '4000');
    await user.click(screen.getByTestId('ctr-save'));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        goldMinPoints: 4000,
        platinumMinPoints: 15000,
        cardRequestMinPoints: 5000,
      }),
    );
    expect(await screen.findByText('قوانین باشگاه مشتریان ذخیره شد ✓')).toBeInTheDocument();
  });

  it('shows the real server error message on a save failure', async () => {
    vi.spyOn(clubApi, 'fetchClubTierRules').mockResolvedValue(RULES);
    vi.spyOn(clubApi, 'updateClubTierRules').mockRejectedValue(
      new ApiRequestError('FORBIDDEN', 'دسترسی به این بخش برای شما مجاز نیست.', 403),
    );
    render(<ClubTierRulesPage />);
    await screen.findByTestId('ctr-gold');

    await userEvent.click(screen.getByTestId('ctr-save'));

    expect(await screen.findByText('دسترسی به این بخش برای شما مجاز نیست.')).toBeInTheDocument();
  });
});
