import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatTile from './StatTile';

describe('StatTile', () => {
  it('renders the label, value and optional sublabel', () => {
    render(<StatTile label="کل درآمد" value="۱۲٬۷۶۸٬۰۰۰٬۰۰۰ تومان" sublabel="حاشیه ۱۰۰٪" tone="good" />);

    expect(screen.getByText('کل درآمد')).toBeInTheDocument();
    expect(screen.getByText('۱۲٬۷۶۸٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText('حاشیه ۱۰۰٪')).toBeInTheDocument();
  });

  it('omits the sublabel when not provided', () => {
    render(<StatTile label="هزینه عملیاتی" value="۰ تومان" />);
    expect(screen.queryByText(/حاشیه/)).not.toBeInTheDocument();
  });

  it('renders a real icon in the colored badge for every tone', () => {
    const { container, rerender } = render(<StatTile label="کل درآمد" value="۰" tone="good" />);
    expect(container.querySelector('svg')).toBeInTheDocument();

    for (const tone of ['accent', 'warning', 'critical'] as const) {
      rerender(<StatTile label="کل درآمد" value="۰" tone={tone} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    }
  });
});
