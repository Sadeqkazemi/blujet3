import { describe, expect, it, vi } from 'vitest';
import { syncGuestPrimaryProfile } from './checkout-guest-profile';
import { emptyPassenger } from './checkout-types';

describe('syncGuestPrimaryProfile', () => {
  it('fills only missing account identity fields and stores the first adult once', async () => {
    const primary = {
      ...emptyPassenger('', 'ADULT'),
      firstNameLatin: 'ALI',
      lastNameLatin: 'REZAEI',
      gender: 'male' as const,
      nationalId: '0012345679',
      birthDay: '1',
      birthMonth: '1',
      birthYear: '1370',
    };
    const updateProfile = vi.fn().mockResolvedValue({});
    const createSavedPassenger = vi.fn().mockResolvedValue({ id: 'saved-1' });

    await syncGuestPrimaryProfile([primary], 'fa', {
      fetchProfile: vi.fn().mockResolvedValue({
        fullName: '+989121234567',
        nationalId: null,
        birthDate: null,
        passportNo: null,
        address: 'تهران، خیابان نمونه',
        email: 'existing@example.com',
        emailVerifiedAt: null,
        completionPct: 40,
        profileIncomplete: true,
        missingProfileFields: ['fullName', 'nationalId', 'birthDate'],
      }),
      updateProfile,
      fetchSavedPassengers: vi.fn().mockResolvedValue([]),
      createSavedPassenger,
    });

    expect(updateProfile).toHaveBeenCalledWith({
      fullName: 'ALI REZAEI',
      nationalId: '0012345679',
      birthDate: '1991-03-21',
    });
    expect(createSavedPassenger).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'ALI REZAEI',
        latinName: 'ALI REZAEI',
        nationalId: '0012345679',
      }),
    );
  });

  it('does not overwrite a completed profile or duplicate an existing passenger', async () => {
    const primary = {
      ...emptyPassenger('', 'ADULT'),
      firstNameLatin: 'ALI',
      lastNameLatin: 'REZAEI',
      gender: 'male' as const,
      nationalId: '0012345679',
      birthDay: '1',
      birthMonth: '1',
      birthYear: '1370',
    };
    const updateProfile = vi.fn();
    const createSavedPassenger = vi.fn();

    await syncGuestPrimaryProfile([primary], 'fa', {
      fetchProfile: vi.fn().mockResolvedValue({
        fullName: 'Existing Customer',
        nationalId: '0012345679',
        birthDate: '1991-03-21',
        passportNo: null,
        address: 'تهران، خیابان نمونه',
        email: 'existing@example.com',
        emailVerifiedAt: '2026-08-01T00:00:00.000Z',
        completionPct: 100,
        profileIncomplete: false,
        missingProfileFields: [],
      }),
      updateProfile,
      fetchSavedPassengers: vi.fn().mockResolvedValue([
        { id: 'saved-1', nationalId: '0012345679', passportNo: null, latinName: 'ALI REZAEI' },
      ]),
      createSavedPassenger,
    });

    expect(updateProfile).not.toHaveBeenCalled();
    expect(createSavedPassenger).not.toHaveBeenCalled();
  });
});
