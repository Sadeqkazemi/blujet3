import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SavedPassenger } from '../../../types/public-site';
import PassengerStep from './PassengerStep';
import { buildPassengersFromMix, emptyPassenger } from './checkout-types';

describe('PassengerStep — saved passengers', () => {
  const realSavedPassenger: SavedPassenger = {
    id: 'api-1',
    fullName: 'سارا احمدی',
    latinName: 'SARA AHMADI',
    gender: 'female',
    birthDate: '1994-08-20',
    nationalId: '0499370899',
    passportNo: null,
    mobile: null,
    isChild: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('always shows the from-saved link with icon, even when API list is empty', () => {
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={vi.fn()}
        savedPassengers={[]}
      />,
    );

    expect(screen.getByTestId('checkout-from-saved-0')).toHaveTextContent(
      'از مسافران ذخیره‌شده',
    );
  });

  it('shows an honest empty state when the account has no saved passengers', async () => {
    const user = userEvent.setup();
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={vi.fn()}
        savedPassengers={[]}
      />,
    );

    await user.click(screen.getByTestId('checkout-from-saved-0'));
    expect(screen.getByTestId('checkout-saved-panel-0')).toBeInTheDocument();
    expect(screen.getByText('انتخاب از مسافران ذخیره‌شده:')).toBeInTheDocument();
    expect(screen.getByText('هنوز مسافری در حساب شما ذخیره نشده است.')).toBeInTheDocument();
    expect(screen.queryByTestId(/checkout-saved-chip/)).not.toBeInTheDocument();
  });

  it('autofills all checkout fields returned by the saved-passenger API', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={onChange}
        savedPassengers={[realSavedPassenger]}
      />,
    );

    await user.click(screen.getByTestId('checkout-from-saved-0'));
    await user.click(screen.getByTestId('checkout-saved-chip-api-1'));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as ReturnType<typeof emptyPassenger>[];
    expect(next[0]).toMatchObject({
      firstNameLatin: 'SARA',
      lastNameLatin: 'AHMADI',
      gender: 'female',
      nationalId: '0499370899',
      docType: 'NATIONAL_ID',
    });
    expect(next[0]?.birthDay).not.toBe('');
    expect(next[0]?.birthMonth).not.toBe('');
    expect(next[0]?.birthYear).not.toBe('');
    expect(screen.queryByTestId('checkout-saved-panel-0')).not.toBeInTheDocument();
  });

  it('visibly fills both name boxes for a recoverable legacy saved passenger', async () => {
    const user = userEvent.setup();
    const legacySavedPassenger: SavedPassenger = {
      ...realSavedPassenger,
      id: 'legacy-1',
      fullName: 'SADEQ KAZEMI',
      latinName: 'KAZEMI',
    };

    function ControlledPassengerStep() {
      const [passengers, setPassengers] = useState([emptyPassenger('')]);
      return (
        <PassengerStep
          locale="fa"
          passengers={passengers}
          onChange={setPassengers}
          savedPassengers={[legacySavedPassenger]}
        />
      );
    }

    render(<ControlledPassengerStep />);
    await user.click(screen.getByTestId('checkout-from-saved-0'));
    await user.click(screen.getByTestId('checkout-saved-chip-legacy-1'));

    expect(screen.getByTestId('checkout-pax-first-0')).toHaveValue('SADEQ');
    expect(screen.getByTestId('checkout-pax-last-0')).toHaveValue('KAZEMI');
  });

  it('prefers API saved passengers over the demo list', async () => {
    const user = userEvent.setup();
    const apiRows: SavedPassenger[] = [realSavedPassenger];
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={vi.fn()}
        savedPassengers={apiRows}
      />,
    );

    await user.click(screen.getByTestId('checkout-from-saved-0'));
    expect(screen.getByTestId('checkout-saved-chip-api-1')).toHaveTextContent('سارا احمدی');
    expect(screen.queryAllByTestId(/checkout-saved-chip/)).toHaveLength(1);
  });

  it('limits the first passenger birth year to someone at least 12 on departure', () => {
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={vi.fn()}
        savedPassengers={[]}
        departureAt="2026-08-01T05:00:00.000Z"
      />,
    );

    const yearSelect = screen.getAllByRole('combobox')[3]!;
    expect(yearSelect).toHaveTextContent('۱۳۹۳');
    expect(yearSelect).not.toHaveTextContent('۱۳۹۴');
  });

  it('shows the age and fare notice for every added passenger', () => {
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger(''), emptyPassenger('', 'CHILD')]}
        onChange={vi.fn()}
        savedPassengers={[]}
        departureAt="2026-08-01T05:00:00.000Z"
      />,
    );

    expect(screen.getByTestId('checkout-passenger-age-notice-1')).toHaveTextContent(
      'رده سنی مسافر و قیمت بلیط بر اساس تاریخ تولد در روز پرواز محاسبه می‌شود.',
    );
  });

  it('localizes the add and remove passenger controls in English and Arabic', () => {
    const passengers = [emptyPassenger(''), emptyPassenger('')];
    const { rerender } = render(
      <PassengerStep
        locale="en"
        passengers={passengers}
        onChange={vi.fn()}
        savedPassengers={[]}
      />,
    );

    expect(screen.getByTestId('checkout-add-pax')).toHaveTextContent(
      'Add new passenger',
    );
    expect(screen.getByTestId('checkout-remove-pax-1')).toHaveTextContent(
      'Remove',
    );

    rerender(
      <PassengerStep
        locale="ar"
        passengers={passengers}
        onChange={vi.fn()}
        savedPassengers={[]}
      />,
    );

    expect(screen.getByTestId('checkout-add-pax')).toHaveTextContent(
      'إضافة مسافر جديد',
    );
    expect(screen.getByTestId('checkout-remove-pax-1')).toHaveTextContent(
      'حذف',
    );
  });

  it('labels each passenger with a per-type ordinal from the search mix', () => {
    render(
      <PassengerStep
        locale="fa"
        passengers={buildPassengersFromMix({
          adults: 2,
          children: 1,
          infants: 1,
        })}
        onChange={vi.fn()}
        savedPassengers={[]}
        lockPassengerCount
      />,
    );

    expect(screen.getByText('1. بزرگسال')).toBeInTheDocument();
    expect(screen.getByText('2. بزرگسال')).toBeInTheDocument();
    expect(screen.getByText('1. کودک')).toBeInTheDocument();
    expect(screen.getByText('1. نوزاد')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-add-pax')).not.toBeInTheDocument();
  });

  it('marks missing and invalid fields in red with specific inline messages', () => {
    const invalidPassenger = {
      ...emptyPassenger(''),
      nationalId: '0012345678',
    };
    render(
      <PassengerStep
        locale="fa"
        passengers={[invalidPassenger]}
        onChange={vi.fn()}
        savedPassengers={[]}
        showValidationErrors
      />,
    );

    expect(screen.getByTestId('checkout-pax-first-0')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('نام را وارد کنید.')).toBeInTheDocument();
    expect(screen.getByText('نام خانوادگی را وارد کنید.')).toBeInTheDocument();
    expect(screen.getByText('کد ملی اشتباه وارد شده است.')).toBeInTheDocument();
    expect(screen.getByText('تاریخ تولد را کامل وارد کنید.')).toBeInTheDocument();
  });

  it('offers an adjacent extra seat only to seated passengers and explains baggage', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PassengerStep
        locale="fa"
        passengers={[emptyPassenger('')]}
        onChange={onChange}
        savedPassengers={[]}
      />,
    );

    await user.click(screen.getByTestId('checkout-extra-seat-0'));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ extraSeatRequested: true }),
    ]);
    expect(
      screen.getByText(
        'برای صندلی اضافه بار مجزا تعلق نمی‌گیرد؛ بار اضافه باید جداگانه خریداری شود.',
      ),
    ).toBeInTheDocument();
  });
});
