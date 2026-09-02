import { Role } from '../../database/enums';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  fullName: string;
  isSuperAdmin?: boolean;
  sandboxOwnerId?: string;
}
