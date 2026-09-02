import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResultsAiRadar from './ResultsAiRadar';
import { RESULTS_COPY } from './results-copy';

const advisory = {
  available: true,
  recommendation: 'buy' as const,
  reasonFa: 'پاسخ پویا و ناشناخته مدل به زبان فارسی',
  predictedPriceIrr: '380000000',
  cheapestDayLabel: '2026-08-25',
  priceIncreaseProbPct: 72,
};

describe('ResultsAiRadar locale isolation', () => {
  it('does not leak a Persian ML reason into the English radar', () => {
    render(
      <ResultsAiRadar
        locale="en"
        copy={RESULTS_COPY.en}
        aiState="done"
        advisory={advisory}
        onAnalyze={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-radar')).toHaveTextContent('Smart Price Radar');
    expect(screen.getByTestId('ai-result')).toHaveTextContent(
      "Today's price is in a good range",
    );
    expect(screen.getByTestId('ai-result')).not.toHaveTextContent('پاسخ پویا');
  });

  it('does not leak a Persian ML reason into the Arabic radar', () => {
    render(
      <ResultsAiRadar
        locale="ar"
        copy={RESULTS_COPY.ar}
        aiState="done"
        advisory={advisory}
        onAnalyze={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-radar')).toHaveTextContent('رادار الأسعار الذكي');
    expect(screen.getByTestId('ai-result')).toHaveTextContent('سعر اليوم في نطاق جيد');
    expect(screen.getByTestId('ai-result')).not.toHaveTextContent('پاسخ پویا');
    expect(screen.getByTestId('ai-result')).not.toHaveTextContent('2026-08-25');
  });
});
