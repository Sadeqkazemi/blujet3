import { SetMetadata } from '@nestjs/common';

export const SKIP_MUST_CHANGE_PASSWORD = 'skipMustChangePassword';

/** Routes that must stay reachable while `User.mustChangePassword` is true
 * (identity, password change itself, sign-out). */
export const SkipMustChangePassword = () =>
  SetMetadata(SKIP_MUST_CHANGE_PASSWORD, true);
