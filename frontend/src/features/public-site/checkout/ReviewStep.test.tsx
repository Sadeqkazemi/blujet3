import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewStep from './ReviewStep';
import { emptyPassenger } from './checkout-types';

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

describe('ReviewStep passenger details', () => {
  it('keeps national ID and birth date in separate review cells', () => {
    render(
      <ReviewStep
        locale="fa"
        passengers={[
          {
            ...emptyPassenger(''),
            firstNameLatin: 'SADEQ',
            lastNameLatin: 'KAZEMI',
            gender: 'male',
            nationalId: '0603267874',
            birthDay: '20',
            birthMonth: '11',
            birthYear: '1377',
          },
        ]}
        extras={[]}
        selectedSeats={[]}
      />,
    );

    const documentCell = screen.getByTestId('checkout-review-document-0');
    const documentHeading = screen.getByTestId('checkout-review-document-heading');
    const birthCell = screen.getByTestId('checkout-review-birth-date-0');
    expect(documentCell).toHaveTextContent('0603267874');
    expect(documentCell).not.toHaveTextContent('۱۳۷۷');
    expect(birthCell).toHaveTextContent('۱۳۷۷/۱۱/۲۰');
    expect(birthCell).not.toHaveTextContent('0603267874');
    expect(documentHeading).toHaveClass('text-center');
    expect(documentCell).toHaveClass('text-center');
  });
});
