import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CartableRouter from './CartableRouter';
import * as useAuthModule from '../hooks/useAuth';
import { mockAuthUserWithRole } from '../test/mockAuthUser';
import type { Role } from '../types/auth';

vi.mock('../features/cartable/CartablePage', () => ({ default: () => <div>کارتابل مدیر</div> }));
vi.mock('../features/cartable/EmployeeCartablePage', () => ({ default: () => <div>کارتابل کارمند</div> }));
vi.mock('../features/operations/OperationsCartablePage', () => ({ default: () => <div>کارتابل عملیات</div> }));
vi.mock('../features/support-tickets/SupportTicketsPage', () => ({
  default: () => <div data-testid="embedded-support-tickets">تیکت‌های ارجاع‌شده من</div>,
}));

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('CartableRouter internal workspace', () => {
  it('renders only the internal manager cartable for executives', () => {
    mockRole('CEO');
    render(<CartableRouter />);

    expect(screen.getByText('کارتابل مدیر')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-support-tickets')).not.toBeInTheDocument();
  });

  it('renders only the internal employee cartable', () => {
    mockRole('EMPLOYEE');
    render(<CartableRouter />);

    expect(screen.getByText('کارتابل کارمند')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-support-tickets')).not.toBeInTheDocument();
  });

  it.each([
    ['SITE_ADMIN', 'کارتابل مدیر'],
    ['IT_MANAGER', 'کارتابل مدیر'],
    ['OPERATIONS_MANAGER', 'کارتابل عملیات'],
  ] as const)('never embeds assigned support tickets for %s', (role, expectedCartable) => {
    mockRole(role);
    render(<CartableRouter />);

    expect(screen.getByText(expectedCartable)).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-support-tickets')).not.toBeInTheDocument();
  });
});
