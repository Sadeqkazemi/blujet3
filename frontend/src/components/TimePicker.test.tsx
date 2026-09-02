import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TimePicker from './TimePicker';

function Harness({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <TimePicker
      label="ساعت پرواز *"
      value={v}
      onChange={(next) => {
        onChange(next);
        setV(next);
      }}
      testId="tp"
    />
  );
}

describe('TimePicker', () => {
  it('uses a custom dark 24h popup instead of native time input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    expect(document.querySelector('input[type="time"]')).toBeNull();
    await user.click(screen.getByTestId('tp-trigger'));
    expect(screen.getByTestId('tp-popup')).toBeInTheDocument();

    const hour = screen.getByTestId('tp-hour');
    const minute = screen.getByTestId('tp-minute');
    expect(
      hour.compareDocumentPosition(minute) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(hour.closest('[data-testid="time-picker-columns"]')).toHaveAttribute('dir', 'ltr');

    await user.selectOptions(hour, '8');
    await user.selectOptions(minute, '30');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('tp-done'));
    expect(onChange).toHaveBeenCalledWith('08:30');
  });
});
