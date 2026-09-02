import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FareRulesSection from './FareRulesSection';
import * as flightsApi from '../api/flights';
import type { FareRuleRow } from '../types/flights';

const RULE: FareRuleRow = {
  id: 'fr1',
  flightInstanceId: 'fi1',
  cabin: 'ECONOMY',
  classCode: 'Y',
  priceIrr: 38_000_000,
  seatsAllocated: 40,
  taxIrr: 0,
  refundable: true,
  changeable: true,
  baggageAllowanceKg: 20,
  validFrom: null,
  validUntil: null,
  allowedChannels: ['SYSTEM'],
};

describe('FareRulesSection', () => {
  it('lists fare rules and creates a new one', async () => {
    vi.spyOn(flightsApi, 'fetchFareRules').mockResolvedValue([]);
    const createSpy = vi.spyOn(flightsApi, 'createFareRule').mockResolvedValue(RULE);
    vi.spyOn(flightsApi, 'fetchFareRules')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([RULE]);

    render(<FareRulesSection instanceId="fi1" />);

    await userEvent.click(await screen.findByRole('button', { name: '+ افزودن' }));
    await userEvent.type(screen.getByLabelText('کد کلاس'), 'Y');
    await userEvent.type(screen.getByLabelText('قیمت تومان'), '3800000');
    await userEvent.type(screen.getByLabelText('تعداد صندلی'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت کلاس نرخی' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        'fi1',
        expect.objectContaining({ classCode: 'Y', priceIrr: 38_000_000, seatsAllocated: 40 }),
      ),
    );
    expect(await screen.findByTestId('fare-rule-row')).toHaveTextContent('Y');
  });
});
