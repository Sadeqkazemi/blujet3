import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmActionDialog from './ConfirmActionDialog';

describe('ConfirmActionDialog', () => {
  it('requires an explicit confirmation before running the action', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmActionDialog
        open
        title="خروج از حساب"
        message="آیا مطمئن هستید؟"
        confirmLabel="بله، خارج شو"
        cancelLabel="انصراف"
        onConfirm={onConfirm}
        onCancel={onCancel}
        testId="logout-confirm"
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('logout-confirm-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('logout-confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('prevents duplicate actions while the request is busy and renders API errors', () => {
    render(
      <ConfirmActionDialog
        open
        title="حذف"
        message="این عملیات قابل بازگشت نیست."
        confirmLabel="حذف"
        cancelLabel="انصراف"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        busy
        busyLabel="در حال انجام…"
        error="درخواست انجام نشد."
      />,
    );

    expect(screen.getByTestId('confirm-action-dialog-confirm')).toBeDisabled();
    expect(screen.getByTestId('confirm-action-dialog-cancel')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('درخواست انجام نشد.');
  });
});
