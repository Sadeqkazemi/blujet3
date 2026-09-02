import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import FlowStepper from './FlowStepper';

describe('FlowStepper', () => {
  it('marks earlier steps done and the current step active', () => {
    render(
      <MemoryRouter>
        <FlowStepper current="checkout" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('flow-step-search')).toHaveTextContent('✓');
    expect(screen.getByTestId('flow-step-results')).toHaveTextContent('✓');
    expect(screen.getByTestId('flow-step-checkout')).toHaveTextContent('تأیید اطلاعات');
    expect(screen.getByTestId('flow-step-payment')).toHaveTextContent('۵');
  });

  it('calls onBack when the back arrow is clicked', async () => {
    const onBack = vi.fn();
    render(
      <MemoryRouter>
        <FlowStepper current="results" onBack={onBack} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByTestId('flow-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
