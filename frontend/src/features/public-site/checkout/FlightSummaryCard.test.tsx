import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FlightSummaryCard from './FlightSummaryCard';

const flight = {
  flightInstanceId: 'fi-1',
  flightNo: 'XY1234',
  originCode: 'THR',
  destCode: 'KIH',
  departureAt: '2026-08-28T05:00:00.000Z',
  arrivalAt: '2026-08-28T06:30:00.000Z',
  aircraftType: 'MD-80',
  priceIrr: '10000000',
};

describe('FlightSummaryCard route contract', () => {
  it.each([
    ['fa', 'rtl', 'تهران به کیش', 'scaleX(-1)'],
    ['ar', 'rtl', 'طهران إلى كيش', 'scaleX(-1)'],
    ['en', 'ltr', 'Tehran to Kish', ''],
  ] as const)('renders origin-to-destination direction in %s', (locale, dir, label, transform) => {
    render(<FlightSummaryCard flight={flight} cabin="FIRST" locale={locale} />);
    const summary = screen.getByTestId('checkout-flight-summary');
    expect(summary).toHaveAttribute('dir', dir);
    expect(screen.getByTestId('checkout-route-label')).toHaveTextContent(label);
    const plane = summary.querySelector('span[style]');
    if (transform) expect(plane).toHaveStyle({ transform });
    else expect(plane).toBeNull();
  });
});
