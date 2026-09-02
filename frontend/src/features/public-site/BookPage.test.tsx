import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import BookPage from './BookPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';

describe('BookPage', () => {
  beforeEach(() => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
  });

  it('redirects authenticated users into the checkout wizard', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', fullName: 'Test', role: 'USER', preferredLocale: 'FA', mustChangePassword: false },
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/book/fi-1?cabin=ECONOMY']}>
        <Routes>
          <Route path="/book/:flightInstanceId" element={<BookPage />} />
          <Route
            path="/checkout/new"
            element={<div data-testid="checkout-wizard">checkout</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-wizard')).toBeInTheDocument();
  });

  it('sends unauthenticated users to the passenger-first checkout wizard', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/book/fi-1?cabin=BUSINESS']}>
        <Routes>
          <Route path="/book/:flightInstanceId" element={<BookPage />} />
          <Route path="/checkout/new" element={<div data-testid="checkout-wizard">checkout</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('checkout-wizard')).toBeInTheDocument();
    });
  });

  it('redirects authenticated users into checkout with cabin=COMFORT', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', fullName: 'Test', role: 'USER', preferredLocale: 'FA', mustChangePassword: false },
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/book/fi-1?cabin=COMFORT']}>
        <Routes>
          <Route path="/book/:flightInstanceId" element={<BookPage />} />
          <Route
            path="/checkout/new"
            element={<div data-testid="checkout-wizard">checkout</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('checkout-wizard')).toBeInTheDocument();
  });
});
