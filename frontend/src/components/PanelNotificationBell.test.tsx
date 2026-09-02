import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PanelNotificationBell, { type PanelNotificationItem } from './PanelNotificationBell';

const items: PanelNotificationItem[] = [
  { key: 'cartable-1', title: 'درخواست مرخصی', sublabel: 'علی حسینی', to: '/panel/cartable', tone: 'danger' },
  { key: 'refund-queue', title: 'استرداد در صف پرداخت', sublabel: '۲ مورد', to: '/panel/refund', tone: 'purple' },
];

function renderBell(list: PanelNotificationItem[]) {
  return render(
    <MemoryRouter>
      <PanelNotificationBell items={list} />
    </MemoryRouter>,
  );
}

describe('PanelNotificationBell', () => {
  it('shows the unread count and hides the dropdown until opened', () => {
    renderBell(items);
    expect(screen.getByTestId('notification-bell-count')).toHaveTextContent('۲');
    expect(screen.queryByText('درخواست مرخصی')).not.toBeInTheDocument();
  });

  it('opens the dropdown and lists each real item with its sublabel', () => {
    renderBell(items);
    fireEvent.click(screen.getByRole('button', { name: 'اعلان‌ها' }));

    expect(screen.getByText('درخواست مرخصی')).toBeInTheDocument();
    expect(screen.getByText('علی حسینی')).toBeInTheDocument();
    expect(screen.getByText('استرداد در صف پرداخت')).toBeInTheDocument();
    expect(screen.getByText('۲ مورد')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', () => {
    renderBell([]);
    fireEvent.click(screen.getByRole('button', { name: 'اعلان‌ها' }));
    expect(screen.getByText('اعلان جدیدی ندارید.')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell-count')).not.toBeInTheDocument();
  });

  it('awaits the read acknowledgement before completing an unread item open', async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    renderBell([{ ...items[0]!, onOpen }]);

    fireEvent.click(screen.getByTestId('notification-bell-count').closest('button')!);
    fireEvent.click(screen.getAllByRole('button')[1]!);

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  });
});
