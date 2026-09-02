import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requiresPermission';

/**
 * Narrows a method-level @Roles(...,'EMPLOYEE') grant down to the specific
 * EmployeePermission key(s) IT_MANAGER actually issued that employee (see
 * EmployeePermissionGuard). Any one of the listed keys is sufficient.
 * Roles other than EMPLOYEE are unaffected — they're already gated by
 * @Roles(...) alone.
 */
export const RequiresPermission = (...keys: string[]) =>
  SetMetadata(REQUIRES_PERMISSION_KEY, keys);
