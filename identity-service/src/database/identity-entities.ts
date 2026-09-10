import { CustomerIdentityVerification } from './entities/customer-identity-verification.entity';
import { PasswordResetEvent } from './entities/password-reset-event.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SecurityPolicy } from './entities/security-policy.entity';
import { TwoFactorChallenge } from './entities/two-factor-challenge.entity';
import { User } from './entities/user.entity';

export const identityEntities = [
  User,
  RefreshToken,
  TwoFactorChallenge,
  PasswordResetEvent,
  SecurityPolicy,
  CustomerIdentityVerification,
];
