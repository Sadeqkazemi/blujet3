import {
  assessProfileCompletion,
  maskIdentityValue,
  profileIncompleteSql,
} from './profile-completion';

describe('profile completion', () => {
  it('uses the same six equally weighted fields including the encrypted address', () => {
    expect(assessProfileCompletion({ fullName: 'Ali' })).toEqual({
      completionPct: 17,
      profileIncomplete: true,
      missingProfileFields: [
        'nationalId',
        'birthDate',
        'passportNo',
        'address',
        'verifiedEmail',
      ],
    });
    expect(
      assessProfileCompletion({
        fullName: 'Ali',
        nationalIdEnc: 'enc',
        birthDate: new Date(),
        passportNoEnc: 'enc',
        addressEnc: 'enc',
        emailVerifiedAt: new Date(),
      }),
    ).toEqual({
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });
  });

  it('keeps the SQL predicate aligned and masks identity values', () => {
    const sql = profileIncompleteSql('u');
    expect(sql).toContain('u.nationalIdEnc IS NULL');
    expect(sql).toContain('u.birthDate IS NULL');
    expect(sql).toContain('u.passportNoEnc IS NULL');
    expect(sql).toContain('u.addressEnc IS NULL');
    expect(sql).toContain('u.emailVerifiedAt IS NULL');
    expect(maskIdentityValue('0012345678')).toBe('******5678');
  });
});
