import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AccessRevokedListener from './AccessRevokedListener';
import { emitAccessRevoked } from '../lib/access-revoked';
import * as useAuthModule from '../hooks/useAuth';
import { mockAuthUserWithRole } from '../test/mockAuthUser';

describe('AccessRevokedListener', () => {
  it('replaces the panel with a full navy denial page and signs out', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUserWithRole('OPERATIONS_MANAGER'),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut,
    });

    render(
      <MemoryRouter initialEntries={['/panel']}>
        <AccessRevokedListener />
        <Routes><Route path="/panel" element={<div>محتوای پنل</div>} /><Route path="/login" element={<div>صفحه ورود</div>} /></Routes>
      </MemoryRouter>,
    );

    act(() => emitAccessRevoked());
    expect(await screen.findByTestId('access-revoked-page')).toBeVisible();
    expect(screen.getByText('اجازه دسترسی برای شما امکان‌پذیر نیست.')).toBeVisible();
    await waitFor(() => expect(signOut).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'بازگشت به صفحه ورود' }));
    expect(await screen.findByText('صفحه ورود')).toBeInTheDocument();
  });
});
